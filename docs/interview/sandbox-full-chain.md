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

> **当前生产链路是"降级链"**：`AioSandboxProvider`(Docker) 优先，容器创建失败时由 `FallbackSandboxProvider`（warn 模式）自动降级到 `LocalSandboxProvider`。

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

- `acquire(threadId)` → 获取一个沙箱（本地模式直接返回，Docker 模式创建/复用容器）
- `get(sandboxId)` → 按 ID 取回已创建的沙箱
- `release(sandboxId)` → 释放单个沙箱
- `shutdown()` → 一键清理所有

### 第 3 层：生命周期桥接（SandboxMiddleware）

当前实现没有独立的 `SandboxManager`，而是由 `SandboxMiddleware` 承担"获取/复用/销毁"，相当于"沙箱缓存池"：

```typescript
const sandboxMiddleware = new SandboxMiddleware({
  provider: fallbackProvider,   // Docker → 本地 的降级链
  lazyInit: false,              // eager：agent 开始前就获取沙箱
});
harness.use(sandboxMiddleware);

const sb = await sandboxMiddleware.getOrCreateSandbox(conversationId); // 同一 conversation 复用
await sandboxMiddleware.releaseSandbox(conversationId);                // 释放单个
await sandboxMiddleware.releaseAll();                                  // 一键清理所有
```

***

## 沙箱的调用单位

### 当前实现：Docker 优先 → 失败降级本地

```typescript
// messages.ts
async function runAgentExecution(conversationId, content, cm, log) {
  // 1. Docker 沙箱（生产首选）
  const aioProvider = new AioSandboxProvider({
    image: "docker/sandbox-templates:shell",
    workingDir: cwd,
  });
  // 2. 本地沙箱（兜底）
  const localProvider = new LocalSandboxProvider(cwd);
  // 3. 降级链：Docker 失败 → 本地，warn 模式会打印警告
  const fallbackProvider = new FallbackSandboxProvider(aioProvider, localProvider, "warn");

  // 4. 创建 SandboxMiddleware（eager：agent 开始前就获取沙箱）
  const sandboxMiddleware = new SandboxMiddleware({ provider: fallbackProvider, lazyInit: false });
  harness.use(sandboxMiddleware);

  // 5. 获取沙箱（同一 conversationId → 同一容器），注册内置工具
  const sb = await sandboxMiddleware.getOrCreateSandbox(conversationId);
  const toolRegistry = new ToolRegistry(sb);
  harness.setToolRegistry(toolRegistry);
}
```

```
用户消息 "读取 src/index.ts"
  └→ runAgentExecution("conv-1")
       └→ acquire("conv-1") → 容器名 agenthub-sandbox-<hash>
            └→ AioSandbox（Docker 容器）   ← 沙箱 A
                 ├─ turn 1: read_file → docker exec cat
                 ├─ turn 2: execute_command → docker exec
                 └─ turn 3: write_file → docker exec printf

用户消息 "再读 package.json"
  └→ runAgentExecution("conv-1")
       └→ acquire("conv-1") → 容器名相同
            └→ AioSandboxProvider 发现同名容器已存在 → 复用同一个容器
```

粒度：同一用户消息内的多轮 tool-calling 共享沙箱；不同消息之间，**Docker 容器按 conversationId 确定性命名，也会复用同一个容器**（若已被 idle 超时回收则重建）。

### 已实现：确定性哈希 → 复用同一容器

当初规划的 `SandboxManager + SHA256(thread_id)` 已经落地，只是哈希不在管理器里，而在**容器命名**上：

```typescript
// AioSandbox.containerName(threadId) —— 确定性哈希
// 相同 conversationId → 相同容器名 → 复用同一 Docker 容器
const name = AioSandbox.containerName("conv-1");
// → "agenthub-sandbox-1a2b3c4d5e6f7a8b"
```

父 Agent 和子 Agent 只要传同一个 `thread_id`，就会解析到同一个容器名，共享同一个沙箱文件系统。

***

## 沙箱不是"关卡"，是可选的"工具包"

**沙箱本身不是中间件过滤器**，不会拦截所有工具调用。它只是 4 个内置工具内部使用的一个工具对象。（注意区分：现在的 `SandboxMiddleware` 只负责沙箱的**生命周期**——创建/复用/销毁，并不参与工具调用过滤，工具调用仍然走下面的查找链路。）

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
const toolRegistry = new ToolRegistry(sb);
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

## LocalSandbox 核心实现（本地兜底路径）

> 当 Docker 不可用、`FallbackSandboxProvider` 降级时使用。以下机制只在**宿主机**上生效；Docker 路径（AioSandbox）靠容器文件系统天然隔离，见下一节。

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

## AioSandbox 核心实现（Docker）

### 文件操作 = 容器内执行命令

`AioSandbox` 不做宿主机路径解析，所有文件操作都通过 `docker exec` 在容器内完成——路径越界天然被容器文件系统挡住：

```typescript
class AioSandbox implements Sandbox {
  // 读文件 → 容器内 cat
  async readFile(path: string): Promise<string> {
    const result = await this.exec("cat", [path]);
    if (result.exitCode !== 0) throw new Error(`Failed to read file: ${path}`);
    return result.stdout;
  }

  // 写文件 → 容器内 printf（shell 引号转义防注入）
  async writeFile(path: string, content: string): Promise<void> {
    const escaped = content.replace(/'/g, "'\\''");
    const cmd = `printf '%s' '${escaped}' > '${path}'`;
    await this.exec("sh", ["-c", cmd]);
  }

  // 列目录 → 容器内 ls -1
  async listDir(path = "."): Promise<string[]> {
    const result = await this.exec("ls", ["-1", path]);
    return result.exitCode === 2 ? [] : result.stdout.split("\n");
  }
}
```

### 命令执行 = docker exec

```typescript
async exec(command: string, args: string[] = []): Promise<SandboxResult> {
  const exec = await this.container.exec({
    Cmd: [command, ...args],
    AttachStdout: true, AttachStderr: true,
  });
  const stream = await exec.start({ Detach: false, Tty: false });
  // modem.demuxStream 分离 stdout/stderr，exitCode 来自 exec.inspect()
  return { stdout, stderr, exitCode };  // 10 分钟超时保护
}
```

### 容器生命周期

- **确定性命名**：`agenthub-sandbox-<hash(threadId)>`，同名容器跨消息复用；容器还在就能恢复（crash recovery）。
- **常驻**：启动命令是 `sleep infinity`，保证容器随时可被 exec。
- **资源限制**：HostConfig 支持 CPU / 内存 / 进程数 / DNS 限制、`ReadonlyRootfs`、网络 `none`（可完全断网）。
- **回收**：10 分钟 idle 超时自动 `release()`（stop + remove）。

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

  // 3. 创建沙箱降级链：Docker 优先，失败降级本地
  const aioProvider = new AioSandboxProvider({
    image: "docker/sandbox-templates:shell",
    workingDir: cwd,
  });
  const localProvider = new LocalSandboxProvider(cwd);
  const fallbackProvider = new FallbackSandboxProvider(aioProvider, localProvider, "warn");

  // 4. 创建 Harness（执行引擎）+ SandboxMiddleware
  const harness = new AgentHarness(adapter, { maxTurns: 10 });
  const sandboxMiddleware = new SandboxMiddleware({ provider: fallbackProvider, lazyInit: false });
  harness.use(sandboxMiddleware);

  // 5. 获取沙箱（Docker 容器 or 本地），注册内置工具
  const sb = await sandboxMiddleware.getOrCreateSandbox(conversationId);
  const toolRegistry = new ToolRegistry(sb);
  harness.setToolRegistry(toolRegistry);
  harness.setSandbox(sb);
  harness.use(new BlackboardMiddleware());

  // 6. 定义工具的 JSON Schema（告诉 LLM 这些工具长什么样）
  const toolDefinitions = [
    { name: "read_file", description: "读取文件", inputSchema: { path: "string" } },
    { name: "execute_command", description: "执行命令", inputSchema: { command: "string" } },
    { name: "write_file", description: "写文件", inputSchema: { path: "string", content: "string" } },
    { name: "list_dir", description: "列目录", inputSchema: { path: "string" } },
  ];

  // 7. 构建上下文
  const context = {
    conversationId: "conv-1",
    message: "读取 src/index.ts 的内容",
    history: [/*最近50条历史消息*/],
    systemPrompt: agent.systemPrompt,
    tools: toolDefinitions,    // ← LLM 会看到这些工具
  };

  // 8. 启动执行引擎
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
│    handler: async (args) => sandbox.readFile(args.path)   │
│  }                                                        │
│                                                           │
│  // 执行 handler                                          │
│  → AioSandbox.readFile("src/index.ts")（Docker 容器）      │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ AioSandbox.readFile("src/index.ts")                       │
│                                                           │
│  // 没有宿主机路径解析 —— 直接在容器内执行                  │
│  exec("cat", ["src/index.ts"])                            │
│  ├─ container.exec({ Cmd: ["cat", "src/index.ts"] })      │
│  ├─ 容器文件系统天然隔离，无需路径白名单                   │
│  └─ exitCode 0 → 返回 stdout                              │
│                                                           │
│  → "export function hello() { ... }"                      │
│                                                           │
│  ⚠ 若 Docker 不可用，FallbackSandboxProvider 已降级：      │
│  这里会走 LocalSandbox 的宿主机路径安全检查                │
│  （normalize → resolve → relative，见上文）                │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ 结果冒泡返回                                               │
│                                                           │
│  结果: "export function hello() { ... }"                   │
│                                                           │
│  → AioSandbox 返回                                         │
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
       ├─ 创建沙箱链：AioSandboxProvider(Docker) → FallbackSandboxProvider → LocalSandboxProvider
       ├─ SandboxMiddleware 获取/复用沙箱（conversationId → 确定性容器名）
       ├─ 创建 AgentHarness
       └─ harness.execute(context)  ← 主循环
             │
             ├─ Turn 1: LLM 决定调 read_file
             │   ├─ ToolRegistry 查找到 handler
             │   ├─ AioSandbox.readFile()  ← docker exec cat（容器内隔离）
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
  → ToolCall(Read) → AgentHarness 拦截 → ToolRegistry → AioSandbox(Docker exec)
  → 结果注入下一轮 → LLM 生成最终回答
  → Text chunks → WebSocket → 前端显示
```

***

## 关键设计要点

1. **沙箱本身不是过滤器**：它不拦截所有工具调用，只是 4 个内置工具内部使用的工具对象。自定义工具可以直接注册在 harness 上，完全绕过沙箱。`SandboxMiddleware` 只负责沙箱生命周期，不做工具调用过滤。
2. **AgentHarness 持有沙箱引用**：所有 turn 共享同一个 sandbox 实例，确保状态一致。
3. **ToolRegistry 注册内置工具**：把 sandbox 的方法包装成 LLM 可调用的 Tool 对象，通过 toolDefinitions（JSON Schema）告诉 LLM 工具有哪些。
4. **降级链**：生产链路 `AioSandboxProvider(Docker) → FallbackSandboxProvider(warn) → LocalSandboxProvider`。Docker 失败自动降级，日志会打印 `[Sandbox] ⚠️ Docker unavailable...`。
5. **Docker 路径靠容器隔离，本地路径靠路径白名单**：AioSandbox 的文件操作是 `docker exec` 在容器内执行，天然隔离；降级到 LocalSandbox 时才需要 `normalize → resolve → relative` 三行路径检查。
6. **确定性复用**：`AioSandbox.containerName(threadId)` 用 conversationId 哈希出固定容器名，跨消息复用同一个容器。
7. **别名映射**：LLM 返回的工具名（如 "Read"）通过别名表映射为规范名（"read\_file"），兼容不同 LLM 的命名差异。
