# 沙箱（Sandbox）完整链路讲解

## 核心概念

### 沙箱是什么？

沙箱是 Agent 的"安全操作间"——Agent 可以在里面执行命令、读写文件、浏览目录，但沙箱保证它不会跑到不该去的地方（如读 `/etc/passwd`、执行 `rm -rf /`）。

### 为什么需要沙箱？

Agent 需要做三件事：执行命令、读写文件、浏览目录。但 Agent 可能犯错或被恶意利用。沙箱就是给这些操作加安全围栏。

### 两个实现

| 对比   | LocalSandbox  | AioSandboxProvider (Docker) |
| ---- | ------------- | --------------------------- |
| 隔离程度 | 进程级（防君子不防小人）  | 容器级（真正的隔离）                  |
| 关键防护 | 路径穿越检测 + 超时控制 | 容器文件系统隔离 + 资源限制             |
| 启动速度 | 秒开            | 需要几秒创建容器                    |
| 场景   | 开发调试          | 生产环境                        |

***

## 架构三层次

### 第 1 层：接口（Sandbox）

定义"沙箱能做什么"——5 个方法：

```typescript
interface Sandbox {
  exec("npm", ["test"])           // 执行命令
  readFile("src/index.ts")        // 读文件
  writeFile("config.json", data)  // 写文件
  updateFile("image.png", bytes)  // 写二进制
  listDir("src/")                 // 列目录
}
```

### 第 2 层：工厂（SandboxProvider）

负责"创建和销毁沙箱"：

- `create()` → 获取一个沙箱（本地模式直接返回，Docker 模式创建容器）
- `destroy(sandbox)` → 释放单个沙箱

### 第 3 层：管理器（SandboxManager）

可选的缓存层，相当于"沙箱缓存池"：

```typescript
manager.getSandbox("default")  // 第一次创建，以后复用同一实例
manager.destroyAll()           // 一键清理所有
```

***

## 沙箱的调用单位

### 当前实现：每次对话执行一个沙箱

```typescript
// messages.ts
async function runAgentExecution(conversationId, content, cm, log) {
  // 每次调用都 new 一个沙箱
  const harnessSandbox = new LocalSandbox(cwd);
  const toolRegistry = new ToolRegistry(harnessSandbox);
  harness.setToolRegistry(toolRegistry);
}
```

```
用户消息 "读取 src/index.ts"
  └→ runAgentExecution("conv-1")
       └→ new LocalSandbox(workspace)   ← 沙箱 A
            ├─ turn 1: read_file → 沙箱 A
            ├─ turn 2: execute_command → 沙箱 A
            └─ turn 3: write_file → 沙箱 A

用户消息 "再读 package.json"
  └→ runAgentExecution("conv-1")       ← 又 new 一个
       └→ new LocalSandbox(workspace)   ← 沙箱 B（全新的）
```

粒度：同一用户消息内的多轮 tool-calling 共享沙箱，但不同消息之间不共享。

### 规划方案：SandboxManager + 确定性哈希

```typescript
const sandboxId = SHA256(thread_id);
SandboxManager.getSandbox(sandboxId);
// 相同的 thread_id → 相同的 sandboxId → 同一个沙箱实例
```

父 Agent 和子 Agent 只要传同一个 `thread_id`，就共享沙箱。

***

## 沙箱不是"关卡"，是可选的"工具包"

**沙箱不是中间件过滤器**，不会拦截所有工具调用。它只是 4 个内置工具内部使用的一个工具对象。

```
LLM 返回 ToolCall("read_file")
         │
         ▼
AgentHarness 收到 ToolCall
         │
         ├─ 先去 this.tools 查（自定义 handler）
         │    └─ 找到 → 执行自定义 handler，不碰沙箱
         │
         └─ 没找到 → 去 this.toolRegistry 查（内置工具）
              └─ 找到 → 执行 sandbox.readFile()
```

```typescript
// 直接在 harness 上注册自定义工具（不走沙箱）
harness.registerTool("get_weather", async (toolName, args, context) => {
  const city = args.city;
  return fetch(`https://api.weather.com/${city}`);  // ← 完全不碰 sandbox
});

// 内置工具通过 ToolRegistry 走沙箱
const toolRegistry = new ToolRegistry(sandbox);
harness.setToolRegistry(toolRegistry);
```

`ToolExecutionContext` 里的 sandbox 是**可选**的：

```typescript
interface ToolExecutionContext {
  conversationId: string;
  sandbox?: Sandbox;  // ← 可选！不强制使用
}
```

***

## LocalSandbox 核心实现

### 路径安全防护

```typescript
private resolvePath(inputPath: string): string {
  const resolved = resolve(this.allowedDir, normalize(inputPath));
  const rel = relative(this.allowedDir, resolved);
  if (rel.startsWith("..") || (rel.length === 1 && rel === ".")) {
    if (resolved !== this.allowedDir) {
      throw new Error(`Path traversal denied: ${inputPath}`);
    }
  }
  return resolved;
}
```

核心逻辑：**normalize → resolve → 判断 relative 是否以** **`..`** **开头**。

| 输入                    | resolved                  | allowedDir   | 相对路径                  | 结果 |
| --------------------- | ------------------------- | ------------ | --------------------- | -- |
| `src/index.ts`        | `/workspace/src/index.ts` | `/workspace` | `src/index.ts`        | ✅  |
| `../../../etc/passwd` | `/etc/passwd`             | `/workspace` | `../../../etc/passwd` | ❌  |
| `.`                   | `/workspace`              | `/workspace` | `.`                   | ✅  |

### 命令执行安全

```typescript
async exec(command: string, args: string[] = []): Promise<SandboxResult> {
  const fullCommand = [command, ...args].join(" ");
  try {
    const stdout = execSync(fullCommand, {
      cwd: this.allowedDir,  // 锁定工作目录
      timeout: 30_000,       // 超时保护
    });
    return { stdout: stdout.trim(), stderr: "", exitCode: 0 };
  } catch (err) {
    // execSync 的错误对象里包含 stdout/stderr/exitCode
    return { stdout, stderr, exitCode };
  }
}
```

### 4 个内置工具的注册

```typescript
// ToolRegistry.registerBuiltins()
private registerBuiltins(sandbox: Sandbox): void {
  this.register({
    name: "execute_command",
    handler: async (args) => {
      const result = await sandbox.exec(command, cmdArgs);
      return `Exit code: ${result.exitCode}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`;
    },
  });
  this.register({
    name: "read_file",
    handler: async (args) => sandbox.readFile(args.path),
  });
  this.register({
    name: "write_file",
    handler: async (args) => {
      await sandbox.writeFile(args.path, args.content);
      return `File written: ${path}`;
    },
  });
  this.register({
    name: "list_dir",
    handler: async (args) => {
      const entries = await sandbox.listDir(args.path);
      return entries.join("\n");
    },
  });
}
```

***

## 完整端到端链路追踪

场景：用户输入 "读取 src/index.ts 的内容"（single-agent 对话，Claude 提供商）

### 第一阶段：HTTP 请求 → 消息路由

```
前端发 POST /api/conversations/conv-1/messages/create
Body: { content: "读取 src/index.ts 的内容" }
```

**handleCreate** (messages.ts)：

```typescript
// 1. 校验并保存用户消息到数据库
const message = await dbCreateMessage({
  conversationId: "conv-1", content: "读取 src/index.ts 的内容", ...
});

// 2. WebSocket 广播通知其他客户端
cm.broadcastToConversation(..., "notification", { preview: "读取..." });

// 3. 检查对话类型 → single，启动 Agent 执行
runAgentExecution("conv-1", "读取 src/index.ts 的内容", cm, log);

// 4. 立刻返回 201
return reply.status(201).send(message);
```

关键：runAgentExecution 是异步后台任务（`.catch()`），不阻塞 HTTP 响应。

### 第二阶段：初始化

**runAgentExecution** (messages.ts)：

```typescript
async function runAgentExecution(conversationId, content, cm, log) {
  const conv = await getConversation(conversationId);
  const agent = await getContact(contactId);  // 获取 Agent 配置

  // 1. 确定工作目录
  const cwd = resolve(WORKSPACE_ROOT, agent.workspacePath);

  // 2. 创建 Adapter（LLM 调用器）
  const adapter = createAdapter("claude", { cwd, timeout: 300_000 });

  // 3. 创建沙箱 + 工具注册表
  const harnessSandbox = new LocalSandbox(cwd);
  const toolRegistry = new ToolRegistry(harnessSandbox);
  //  ↑ 构造函数里自动注册 4 个内置工具

  // 4. 创建 Harness（执行引擎）
  const harness = new AgentHarness(adapter, { maxTurns: 10 });
  harness.setToolRegistry(toolRegistry);
  harness.setSandbox(harnessSandbox);
  harness.use(new BlackboardMiddleware());

  // 5. 定义工具的 JSON Schema（告诉 LLM 这些工具长什么样）
  const toolDefinitions = [
    { name: "read_file", description: "读取文件", inputSchema: { path: "string" } },
    { name: "execute_command", description: "执行命令", inputSchema: { command: "string" } },
    { name: "write_file", description: "写文件", inputSchema: { path: "string", content: "string" } },
    { name: "list_dir", description: "列目录", inputSchema: { path: "string" } },
  ];

  // 6. 构建上下文
  const context = {
    conversationId: "conv-1",
    message: "读取 src/index.ts 的内容",
    history: [/*最近50条历史消息*/],
    systemPrompt: agent.systemPrompt,
    tools: toolDefinitions,    // ← LLM 会看到这些工具
  };

  // 7. 启动执行引擎
  for await (const chunk of harness.execute(context)) {
    // 这里开始接收流式输出的 Chunk
    // 逐个推送到 WebSocket
  }
}
```

### 第三阶段：Harness 内部执行循环

```
┌──────────────────────────────────────────────────────────┐
│ Turn 1                                                    │
│                                                           │
│  context = {                                              │
│    message: "读取 src/index.ts 的内容",                     │
│    tools: [read_file, write_file, ...],                    │
│    history: [...]                                          │
│  }                                                         │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ ClaudeAdapter.execute(context)                            │
│                                                           │
│  // 把 context 拼成纯文本 prompt                            │
│  prompt = `                                               │
│    <system>你是 Agent...</system>                          │
│    user: 读取 src/index.ts 的内容                           │
│  `                                                        │
│                                                           │
│  // spawn child process                                   │
│  claude -p "prompt" --output-format stream-json            │
│         --dangerously-skip-permissions --max-turns 25      │
│                                                           │
│  // 逐行读取 stdout（NDJSON 流）                            │
│  for await (const line of rl) {                           │
│    yield parseClaudeStreamJson(line, state)               │
│  }                                                        │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ Claude CLI 把 prompt 发给 Anthropic API                    │
│                                                           │
│  LLM 看到 toolDefinitions：                                 │
│  - read_file(path)                                        │
│  - write_file(path, content)                              │
│  - execute_command(command)                               │
│  - list_dir(path)                                         │
│                                                           │
│  LLM 决定：需要读取 src/index.ts                            │
│  → 调用 read_file(path="src/index.ts")                    │
│                                                           │
│  Claude CLI 输出 NDJSON：                                  │
│  {"type":"tool_use","name":"Read",                        │
│   "input":{"path":"src/index.ts"}}                        │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ AgentHarness 收到 ToolCall chunk                          │
│                                                           │
│  chunk = { type: "ToolCall",                              │
│    content: '{"name":"Read","args":{"path":"src/index.ts"}}' }                                    │
│                                                           │
│  // 1. 立即 yield 给外层（WebSocket 推送 "tool_status"）   │
│  yield chunk                                              │
│                                                           │
│  // 2. 推入 toolCallsInTurn 列表                          │
│  toolCallsInTurn.push(chunk)                              │
│                                                           │
│  // Claude 继续输出 Done chunk                            │
│  // → adapter 循环结束                                     │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ toolCallsInTurn.length > 0 → 处理工具调用                  │
│                                                           │
│  parsed.name = "Read"                                     │
│  canonicalName = resolveToolName("Read")                  │
│  // → 查别名表："Read" → "read_file"                      │
│                                                           │
│  // 先查 harness 自定义 handler                           │
│  this.tools.get("read_file") → 没找到                     │
│                                                           │
│  // fallback 到 ToolRegistry                              │
│  this.toolRegistry.has("read_file") → true ✅             │
│                                                           │
│  result = await this.toolRegistry.execute(                │
│    "read_file",                                           │
│    { path: "src/index.ts" },                              │
│    { conversationId, sandbox }                            │
│  )                                                        │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ ToolRegistry.execute("read_file", { path }, context)      │
│                                                           │
│  // 查找注册表 → 找到 handler                              │
│  handler = {                                              │
│    name: "read_file",                                     │
│    handler: async (args) => {                             │
│      return sandbox.readFile(args.path)                   │
│    }                                                      │
│  }                                                        │
│                                                           │
│  // 执行 handler                                          │
│  → LocalSandbox.readFile("src/index.ts")                  │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ LocalSandbox.readFile("src/index.ts")                     │
│                                                           │
│  // 路径安全检查                                           │
│  resolvePath("src/index.ts")                              │
│  ├─ normalize("src/index.ts")                             │
│  ├─ resolve(workspaceDir, ...) → /workspace/project/src/  │
│  ├─ relative(workspaceDir, resolved) → "src/index.ts"     │
│  └─ 不以 ".." 开头 → ✅ 安全                               │
│                                                           │
│  // 读取文件                                              │
│  return readFileSync("/workspace/project/src/index.ts")   │
│  → "export function hello() { ... }"                      │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ 结果冒泡返回                                               │
│                                                           │
│  结果: "export function hello() { ... }"                   │
│                                                           │
│  → LocalSandbox 返回                                       │
│  → ToolRegistry 返回                                       │
│  → AgentHarness 收到 result                                │
│                                                           │
│  // 构造 tool message                                      │
│  toolMessages.push({ role: "assistant", toolName: "Read",  │
│    content: '{"path":"src/index.ts"}' })                   │
│  toolMessages.push({ role: "tool", toolName: "read_file",  │
│    content: "export function hello() { ... }",             │
│    toolCallId: "call_1_..." })                             │
│                                                           │
│  // 更新工作上下文，进入下一轮                               │
│  workingContext = {                                        │
│    ...workingContext,                                      │
│    toolMessages: [assistant_msg, tool_msg],                │
│    message: "基于工具结果，提供最终回复"                     │
│  }                                                         │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ Turn 2                                                    │
│                                                           │
│  // 再次调用 adapter，这次包含 tool 调用历史                │
│  adapter.execute(workingContext)                           │
│                                                           │
│  Claude CLI 把最新的 prompt（含 tool 结果）发给 API         │
│                                                           │
│  LLM 看到文件内容了 → 生成回答                              │
│  "src/index.ts 的内容如下：                                │
│   export function hello() { ... }"                        │
│                                                           │
│  Claude CLI 输出 NDJSON：                                  │
│  {"type":"text","text":"src/index.ts 的内容如下："}        │
│  {"type":"text","text":"export function hello() { ... }"} │
│  {"type":"message_stop"}                                  │
│                                                           │
│  AgentHarness 收到 Text chunks → 立即 yield               │
│  AgentHarness 收到 Done chunk → 本轮无 ToolCall → break   │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
                         Done
```

### 第四阶段：外层循环把结果推给前端

回到 runAgentExecution 里的 `for await`：

```typescript
for await (const chunk of harness.execute(context)) {
  // Turn 1: ToolCall chunk
  // → pushChunk(cm, convId, "tool_status", { toolName: "read_file" })
  // → 前端显示 "正在读取文件..." 指示器

  // Turn 2: Text chunks
  // → pushChunk(cm, convId, "chunk", { content: "src/index.ts 的内容如下：" })
  // → 前端实时打字效果
  // → pushChunk(cm, convId, "chunk", { content: "export function hello() { ... }" })
}

// 保存最终回答到数据库
const saved = await dbCreateMessage({
  conversationId: "conv-1", senderType: "Contact",
  content: "src/index.ts 的内容如下：export function hello() { ... }",
});

// 推送 done 事件 → 前端完成渲染
cm.pushToConversation("conv-1", "done", { messageId: saved.id });
```

### 第五阶段：前端收到

```
WebSocket 收到 "chunk"      → 打字机效果显示文本
WebSocket 收到 "tool_status" → 显示 "正在使用 read_file 工具..."
WebSocket 收到 "done"       → 回复完成，UI 渲染完毕
```

***

## 完整架构总览

```
前端 POST 消息
  │
  ▼
handleCreate (messages.ts)
  ├─ 保存用户消息到 DB
  ├─ WebSocket 通知
  └─ runAgentExecution()  ← 后台异步
       │
       ├─ 创建 Adapter → claude -p --stream-json
       ├─ 创建 LocalSandbox + ToolRegistry
       ├─ 创建 AgentHarness
       └─ harness.execute(context)  ← 主循环
             │
             ├─ Turn 1: LLM 决定调 read_file
             │   ├─ ToolRegistry 查找到 handler
             │   ├─ LocalSandbox.readFile()  ← 路径安全检查
             │   └─ 结果注入下一轮上下文
             │
             ├─ Turn 2: LLM 看到文件内容
             │   ├─ 生成文本回答
             │   └─ yield Text chunks → WebSocket → 前端
             │
             └─ Done → 保存 DB + 通知前端
```

**核心数据流方向：**

```
用户输入 → handleCreate → runAgentExecution → AgentHarness.execute()
  → ClaudeAdapter.execute() → claude CLI → LLM API
  → ToolCall(Read) → AgentHarness 拦截 → ToolRegistry → LocalSandbox
  → 结果注入下一轮 → LLM 生成最终回答
  → Text chunks → WebSocket → 前端显示
```

***

## 关键设计要点

1. **沙箱不是中间件**：它不拦截所有工具调用，只是 4 个内置工具内部使用的工具对象。自定义工具可以直接注册在 harness 上，完全绕过沙箱。
2. **AgentHarness 持有沙箱引用**：所有 turn 共享同一个 sandbox 实例，确保状态一致。
3. **ToolRegistry 注册内置工具**：把 sandbox 的方法包装成 LLM 可调用的 Tool 对象，通过 toolDefinitions（JSON Schema）告诉 LLM 工具有哪些。
4. **路径安全三行核心代码**：`normalize → resolve → relative` 判断是否越界。
5. **别名映射**：LLM 返回的工具名（如 "Read"）通过别名表映射为规范名（"read\_file"），兼容不同 LLM 的命名差异。

