# Agent-Core 执行引擎：完整运行流程

## 一、架构定位

`@agenthub/agent-core` 是 AgentHub 的 **Agent 执行引擎**，运行在任何 Node.js 环境中。它不关心调用者是谁，只负责在当前进程中执行 CLI 子进程或 HTTP 请求。

### 运行位置

```
┌──────────────────────────────────────────────────────────────┐
│  agent-core 运行在三个位置                                    │
│                                                              │
│  Backend Server     → 服务端部署，为所有端提供后端 CLI 调用    │
│  Desktop Electron   → 桌面端主进程，直接调用用户本地 CLI      │
│  Bridge Daemon      → 远期，为 Web 浏览器提供本地 CLI 调用    │
└──────────────────────────────────────────────────────────────┘
```

### 三种调用方式

| 方式 | 链路 | 适用端 |
|------|------|--------|
| **A. 本地 CLI** | 用户本地 `claude`/`opencode` → agent-core spawn CLI | Desktop、Web（通过 Bridge Daemon） |
| **B. 后端 CLI** | 客户端 → API Server → agent-core spawn 服务端 CLI | Web、Desktop、Mobile |
| **C. 外部 API** | 直接 HTTP 调用 OpenAI 等 LLM API | Web（浏览器直接 fetch）、Desktop（agent-core fetch） |

---

## 二、核心接口

### AgentAdapter（定义在 `@agenthub/shared`）

```typescript
interface AgentAdapter {
  /** 执行一个 Agent 调用，返回流式 Chunk 序列 */
  execute(context: AgentContext): AsyncIterable<Chunk>;

  /** 中止当前正在执行的调用 */
  abort(): void;

  /** 检查 Agent 是否可用，返回健康状态 + 延迟 */
  healthCheck(): Promise<HealthStatus>;
}
```

### AgentContext（传入参数）

```typescript
interface AgentContext {
  conversationId: string;    // 会话 ID
  message: string;           // 当前用户消息
  history: Message[];        // 历史消息列表
  agents: Agent[];           // 参与会话的 Agent 列表
}
```

### Chunk（流式输出单元）

```typescript
interface Chunk {
  type: ChunkType;    // text | code | tool_call | artifact | error | done
  content: string;    // 文本内容
  metadata?: Record<string, unknown>;  // 可选元数据（用量、sessionId 等）
  timestamp: string;   // ISO 时间戳
}
```

---

## 三、三种 Adapter 的运行流程

### 3.1 ClaudeAdapter — `claude` CLI

```
┌─────────────────────────────────────────────────────────────────┐
│                     ClaudeAdapter.execute(context)               │
│                                                                  │
│  1. buildPrompt(context)                                         │
│     └── history.map(m => `${m.senderType}: ${m.content}`)       │
│         + `user: ${context.message}`                             │
│                                                                  │
│  2. spawn("claude", [                                            │
│       "--bare",                                                  │
│       "-p", prompt,                                              │
│       "--output-format", "stream-json",                          │
│       "--include-partial-messages",                              │
│       "--dangerously-skip-permissions",                          │
│       "--max-turns", "25",                                       │
│     ])                                                           │
│                                                                  │
│  3. 注册 exitCodePromise = new Promise(on("close", resolve))     │
│                                                                  │
│  4. readline 逐行读取 stdout                                     │
│     ┌──────────────────────────────────────────────── │
│     │ line: {"type":"stream_event","event":{          │
│     │   "type":"content_block_delta",                 │
│     │   "delta":{"type":"text_delta","text":"Hello"}  │
│     │ }}                                              │
│     │                                                 │
│     │ parseClaudeStreamJson(line)                     │
│     │   → stream_event.content_block_delta.text_delta │
│     │   → yield Chunk{type: Text, content: "Hello"}   │
│     ├──────────────────────────────────────────────── │
│     │ line: {"type":"result","session_id":"ses-123",  │
│     │   "usage":{"total_cost_usd":0.002}}             │
│     │                                                 │
│     │ parseClaudeStreamJson(line)                     │
│     │   → type: "result"                              │
│     │   → yield Chunk{type: Done,                     │
│     │       metadata: {usage, sessionId}}             │
│     │   → break (stream ends)                         │
│     └──────────────────────────────────────────────── │
│                                                                  │
│  5. await exitCodePromise                                        │
│     └── exitCode !== 0 → yield Chunk{type: Error}               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**配置项：**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `cliPath` | `"claude"` | `claude` 二进制路径 |
| `maxTurns` | `25` | 最大 Agent 轮次 |
| `timeout` | 无 | 超时毫秒数 |
| `args` | `[]` | 额外 CLI 参数 |

**`claude --output-format stream-json` 事件格式：**

```
type:init          → 会话初始化（忽略）
type:stream_event  → 流式事件
  ├── content_block_delta.text_delta  → Chunk{type: Text}
  └── content_block_stop              → 忽略
type:result        → 执行完成 → Chunk{type: Done}
```

---

### 3.2 OpenCodeAdapter — `opencode` CLI

```
┌─────────────────────────────────────────────────────────────────┐
│                   OpenCodeAdapter.execute(context)               │
│                                                                  │
│  1. buildPrompt(context)                                         │
│                                                                  │
│  2. spawn("opencode", [                                          │
│       "run",                                                     │
│       "--format", "json",                                        │
│       "-m", model,   // e.g. "anthropic/claude-sonnet-4-6"      │
│       prompt,                                                    │
│     ])                                                           │
│                                                                  │
│  3. 注册 exitCodePromise                                         │
│                                                                  │
│  4. readline 逐行读取 stdout                                     │
│     ┌──────────────────────────────────────────────── │
│     │ line: {"type":"text","content":"Hello",         │
│     │   "timestamp":1712345678000,"sessionID":"s-1"}  │
│     │ parseOpenCodeEvent(line)                        │
│     │   → type: "text"                                │
│     │   → yield Chunk{type: Text, content: "Hello"}   │
│     ├──────────────────────────────────────────────── │
│     │ line: {"type":"tool_use","name":"read_file",    │
│     │   "input":{"path":"/tmp/x"},"state":{"output":  │
│     │   "file content"}}                              │
│     │ parseOpenCodeEvent(line)                        │
│     │   → type: "tool_use"                            │
│     │   → yield Chunk{type: ToolCall,                 │
│     │       content: JSON.stringify({name,input,output│
│     ├──────────────────────────────────────────────── │
│     │ line: {"type":"step_finish",                    │
│     │   "tokens":{"input":500,"output":200},          │
│     │   "cost":0.0042,"reason":"end_turn"}            │
│     │ parseOpenCodeEvent(line)                        │
│     │   → type: "step_finish"                         │
│     │   → yield Chunk{type: Done,                     │
│     │       metadata: {tokens, cost}}                 │
│     │   → break                                       │
│     └──────────────────────────────────────────────── │
│                                                                  │
│  5. await exitCodePromise                                        │
│     └── exitCode !== 0 → yield Chunk{type: Error}               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**配置项：**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `cliPath` | `"opencode"` | `opencode` 二进制路径 |
| `model` | 无 | 模型标识（如 `anthropic/claude-sonnet-4-6`） |
| `timeout` | 无 | 超时毫秒数 |
| `args` | `[]` | 额外 CLI 参数 |

**`opencode run --format json` 事件格式：**

```
type:text         → Chunk{type: Text}
type:tool_use     → Chunk{type: ToolCall}
type:error        → Chunk{type: Error}
type:step_finish  → Chunk{type: Done, metadata: {tokens, cost}}
type:step_start   → 忽略（控制事件）
```

---

### 3.3 CustomAgentAdapter — HTTP 外部 API

```
┌─────────────────────────────────────────────────────────────────┐
│                 CustomAgentAdapter.execute(context)              │
│                                                                  │
│  1. buildMessages(context)                                       │
│     └── history → [{role: "user"|"assistant", content}]         │
│         + {role: "user", content: context.message}               │
│                                                                  │
│  2. POST {config.endpoint}                                       │
│     Headers:                                                     │
│       Content-Type: application/json                             │
│       Authorization: Bearer {config.apiKey}                      │
│     Body: {                                                      │
│       model: config.model,                                       │
│       messages: [...],                                           │
│       stream: true                                               │
│     }                                                            │
│     Signal: AbortSignal.any([abortController.signal, timeout])   │
│                                                                  │
│  3. response.ok?                                                 │
│     ├── No → yield Chunk{type: Error, content: "HTTP 401: ..."} │
│     │        yield Chunk{type: Done}                             │
│     │        return                                              │
│     └── Yes → continue                                           │
│                                                                  │
│  4. response.body.getReader() → 逐块读取                         │
│     buffer += decode(chunk, {stream: true})                      │
│     lines = buffer.split("\n")                                   │
│     ┌──────────────────────────────────────────────── │
│     │ line: "data: {\"choices\":[{\"delta\":{          │
│     │   \"content\":\"Hello\"}}]}"                    │
│     │ parseOpenAIStreamEvent(line)                    │
│     │   → data: 开头                                    │
│     │   → delta.content = "Hello"                     │
│     │   → yield Chunk{type: Text, content: "Hello"}   │
│     ├──────────────────────────────────────────────── │
│     │ line: "data: [DONE]"                            │
│     │ parseOpenAIStreamEvent(line)                    │
│     │   → payload === "[DONE]"                        │
│     │   → yield Chunk{type: Done}                     │
│     │   → break                                       │
│     └──────────────────────────────────────────────── │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**配置项：**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `endpoint` | 必填 | LLM API 端点 URL |
| `apiKey` | 无 | 认证密钥 |
| `model` | 必填 | 模型标识 |
| `timeout` | `120000` | 超时毫秒数（2 分钟） |
| `headers` | `{}` | 自定义请求头 |

**OpenAI SSE 格式（兼容的端点）：**

```
data: {"choices":[{"delta":{"role":"assistant"}}]}
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" World"}}]}
data: [DONE]
```

---

## 四、事件流解析层

三种 Adapter 的事件流格式不同，但核心模式一致：**逐行读取 → 解析 → 映射为 Chunk**。

```
┌─────────────────────────────────────────────────────────┐
│                 parseEventLine(provider, line)           │
│                                                         │
│  provider = "claude"                                    │
│    → parseClaudeStreamJson(line)                        │
│      ├── stream_event / content_block_delta/text_delta  │
│      │   → Chunk{Text}                                  │
│      ├── result                                         │
│      │   → Chunk{Done, metadata: {usage, sessionId}}    │
│      └── 其他                                           │
│          → null                                         │
│                                                         │
│  provider = "opencode"                                  │
│    → parseOpenCodeEvent(line)                           │
│      ├── type: text      → Chunk{Text}                  │
│      ├── type: tool_use  → Chunk{ToolCall}              │
│      ├── type: error     → Chunk{Error}                 │
│      ├── type: step_finish → Chunk{Done}                │
│      └── 其他 (step_start 等) → null                    │
│                                                         │
│  provider = "custom"                                    │
│    → parseOpenAIStreamEvent(line)                       │
│      ├── data: 开头 + delta.content → Chunk{Text}        │
│      ├── data: [DONE]  → Chunk{Done}                   │
│      └── 非 data: 行 → null                             │
└─────────────────────────────────────────────────────────┘
```

**设计要点：** 解析器不依赖 Node.js 特有 API，纯 TypeScript，可在浏览器中复用（供未来 RemoteAdapter 使用）。

---

## 五、中止流程

```
abort() 被调用
    │
    ├── ClaudeAdapter / OpenCodeAdapter
    │     │
    │     ├── 第一级: process.kill("SIGTERM")
    │     │     └── 进程收到 SIGTERM，尝试优雅退出
    │     │
    │     └── 第二级 (5 秒后): process.kill("SIGKILL")
    │           └── 强制终止，防止僵尸进程
    │
    └── CustomAgentAdapter
          └── abortController.abort()
                └── AbortSignal 触发，fetch 抛出 AbortError
                      └── catch → yield Chunk{type: Error}
```

---

## 六、健康检查

```
healthCheck()
    │
    ├── ClaudeAdapter → spawn("claude", ["--version"])
    │     ├── exitCode === 0 → { status: "healthy", latency }
    │     └── exitCode !== 0 → { status: "unhealthy", message }
    │
    ├── OpenCodeAdapter → spawn("opencode", ["--version"])
    │     ├── exitCode === 0 → { status: "healthy", latency }
    │     └── exitCode !== 0 → { status: "unhealthy", message }
    │
    └── CustomAgentAdapter → fetch(endpoint, { messages: ["ping"], max_tokens: 1 })
          ├── response.ok → { status: "healthy", latency }
          └── 异常 → { status: "unhealthy", message }
```

---

## 七、工厂函数

```typescript
createAdapter(provider, config)
    │
    ├── "claude"   → new ClaudeAdapter(config)
    ├── "opencode" → new OpenCodeAdapter(config)
    ├── "custom"   → new CustomAgentAdapter(config)
    └── 其他       → throw Error("Unsupported provider")
```

---

## 八、完整调用示例

### 场景：用户发送消息 → Agent 流式回复

```typescript
import { createAdapter } from "@agenthub/agent-core";

// 1. 创建适配器
const adapter = createAdapter("claude", {
  cliPath: "claude",
  maxTurns: 30,
});

// 2. 构建上下文
const context = {
  conversationId: "conv-abc",
  message: "帮我重构这个函数",
  history: [
    { id: "m1", conversationId: "conv-abc", senderType: "user",
      type: "text", content: "你好", createdAt: "..." },
    { id: "m2", conversationId: "conv-abc", senderType: "contact",
      type: "text", content: "你好！有什么可以帮你的？", createdAt: "..." },
  ],
  agents: [
    { id: "a1", name: "Claude", provider: "claude", ... },
  ],
};

// 3. 执行并消费流式输出
try {
  for await (const chunk of adapter.execute(context)) {
    switch (chunk.type) {
      case "text":
        // 追加到消息气泡中
        appendToMessageBubble(chunk.content);
        break;
      case "tool_call":
        // 显示工具调用信息
        showToolCall(JSON.parse(chunk.content));
        break;
      case "error":
        console.error(chunk.content);
        break;
      case "done":
        console.log("完成，用量:", chunk.metadata?.usage);
        break;
    }
  }
} catch (err) {
  // 处理异常
}

// 4. 用户取消时中止
adapter.abort();
```

---

## 九、端到端调用链路

### 场景 A：桌面端本地 CLI

```
Electron 渲染进程
  → IPC（context）
  → 主进程
    → adapter.execute(context)
      → spawn(claude / opencode CLI)
      → 逐行读取 stdout
      → yield Chunk
    → IPC（Chunk）
  → 渲染进程更新 UI
```

### 场景 B：Web/移动端通过后端 CLI

```
浏览器 / 移动端
  → WebSocket / HTTP POST
  → API Server（模块 6）
    → adapter.execute(context)
      → spawn(服务端 CLI)
      → 逐行读取 stdout
      → yield Chunk
    → WebSocket push / HTTP SSE
  → 客户端接收 Chunk 流
```

### 场景 C：外部 API

```
桌面端: Electron 主进程
  → adapter.execute(context)
    → fetch(https://api.openai.com/...)
    → SSE stream → Chunk

Web 端: 浏览器
  → fetch(https://api.openai.com/...)
  → 直接解析 SSE（不使用 agent-core）
```

---

## 十、文件清单

```
packages/agent-core/
├── package.json              # 包定义，依赖 @agenthub/shared
├── tsconfig.json             # TypeScript 配置
├── tsup.config.ts            # 构建配置（ESM + CJS + DTS）
├── vitest.config.ts          # 测试配置
└── src/
    ├── index.ts              # 统一导出
    ├── factory.ts            # createAdapter 工厂函数
    ├── adapters/
    │   ├── claude.adapter.ts   # Claude CLI 适配器
    │   ├── opencode.adapter.ts # OpenCode CLI 适配器
    │   └── custom.adapter.ts   # 外部 API 适配器 (OpenAI 格式)
    └── utils/
        └── chunk-parser.ts   # 事件流解析层（3 种格式）
```
