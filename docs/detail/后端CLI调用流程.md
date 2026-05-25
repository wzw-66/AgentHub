# 后端 CLI 调用：完整流程

## 一、场景定义

**后端 CLI 调用** 是指客户端（Web / Desktop / Mobile）不直接调用本地 CLI，而是通过网络请求发送到**后端 API Server**，由服务端使用 `@agenthub/agent-core` 在服务器上 spawn `claude` 或 `opencode` 子进程执行，并将结果流式返回给客户端。

```
┌──────────┐    WebSocket / HTTP     ┌──────────────┐    spawn     ┌──────────┐
│  Client   │ ──────────────────────▶ │  API Server  │ ──────────▶ │  CLI     │
│ (Web/     │                        │              │             │ (claude/ │
│  Desktop/ │ ◀────────────────────── │ (agent-core) │ ◀────────── │ opencode)│
│  Mobile)  │    Chunk stream         │              │    stdout   │          │
└──────────┘                         └──────────────┘             └──────────┘
```

### 适用端

| 端                | 方式                  | 说明                        |
| ---------------- | ------------------- | ------------------------- |
| Web 浏览器          | 后端 CLI              | 浏览器无法直接 spawn 本地进程，必须通过后端 |
| Desktop Electron | 后端 CLI **或** 本地 CLI | 可两者任选                     |
| Mobile           | 后端 CLI              | 无法 spawn 本地 CLI，只能通过后端    |

***

## 二、完整调用链路 

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      后端 CLI 调用完整链路                                  │
│                                                                          │
│  1. 客户端  ──→  WebSocket/HTTP POST  ──→  API Server                    │
│     发送请求        {conversationId, message, history, agents}            │
│                                                                          │
│  2. API Server ──→  parseRequest(context)                                │
│     构建上下文         └── 从请求中提取 AgentContext                       │
│                       └── 根据 provider 选择适配器                         │
│                                                                          │
│  3. API Server ──→  createAdapter(provider, config)                      │
│     创建适配器         ├── "claude"   → ClaudeAdapter({ cliPath })       │
│                       └── "opencode" → OpenCodeAdapter({ model })        │
│                                                                          │
│  4. API Server ──→  adapter.execute(context)                             │
│     执行并消费         ├── spawn(claude/opencode, [...args])              │
│                       ├── 注册 close 处理器                               │
│                       ├── 设置超时定时器                                   │
│                       ├── 逐行读取 stdout                                 │
│                       ├── parseEventLine(provider, line) → Chunk          │
│                       └── yield Chunk                                     │
│                                                                          │
│  5. Chunk 流 ──→  encodeAndSend(chunk, transport)                        │
│     发送给客户端       ├── WebSocket: ws.send(JSON.stringify(chunk))      │
│                       └── HTTP SSE:  res.write(`data: ${json}\n\n`)      │
│                                                                          │
│  6. 执行完成 ──→  send(doneChunk)                                        │
│                     send(usage metadata)                                 │
│                                                                          │
│  7. 清理     ──→  clearTimeout()                                         │
│                   清除 session 状态                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

***

## 三、API Server 的职责

API Server 是后端 CLI 调用的**调度中心**，负责：

### 3.1 接收客户端请求

```
客户端 → API Server:
POST /api/agent/execute
{
  "conversationId": "conv-abc",
  "provider": "claude",        // 或 "opencode"
  "message": "帮我重构这个函数",
  "history": [
    { "senderType": "user", "content": "你好" },
    { "senderType": "contact", "content": "你好！" }
  ],
  "agents": [
    { "id": "a1", "name": "Claude", "provider": "claude" }
  ]
}
```

### 3.2 路由分发

根据请求中的 `provider` 字段选择对应的 Adapter：

```typescript
function handleExecute(req, res) {
  const { provider, message, history, conversationId, agents } = req.body;

  const context: AgentContext = {
    conversationId,
    message,
    history,
    agents,
  };

  const adapter = createAdapter(provider, {
    cliPath: serverConfig.claudePath,   // 服务端 claude 二进制路径
    maxTurns: serverConfig.maxTurns,
    timeout: serverConfig.timeout,
  });

  // 开始流式执行
  streamResponse(res, adapter.execute(context));
}
```

### 3.3 Chunk 序列化与传输

将 agent-core 产出的 Chunk 通过传输协议发送给客户端：

```typescript
async function streamResponse(
  transport: WebSocket | ServerResponse,
  iterable: AsyncIterable<Chunk>,
) {
  for await (const chunk of iterable) {
    const payload = JSON.stringify(chunk);

    if (transport instanceof WebSocket) {
      transport.send(payload);
    } else {
      // HTTP SSE
      transport.write(`data: ${payload}\n\n`);
    }
  }
}
```

### 3.4 中止传播

```
客户端断开 / 用户取消
    │
    ├── WebSocket: "close" 事件触发
    │   └── HTTP SSE: 请求连接断开
    │
    └── API Server 检测到断开
          └── adapter.abort()
                ├── ClaudeAdapter / OpenCodeAdapter
                │     ├── process.kill("SIGTERM")
                │     └── 5s → process.kill("SIGKILL")
                │
                └── yield Chunk{type: Error, content: "Request aborted"}
```

***

## 四、agent-core 在服务端的使用

### 4.1 ClaudeAdapter（后端场景）

```typescript
import { ClaudeAdapter } from "@agenthub/agent-core";

const adapter = new ClaudeAdapter({
  cliPath: "/usr/local/bin/claude",  // 服务端 claude 二进制路径
  maxTurns: 25,
  timeout: 300_000,                  // 5 分钟超时
});

const context: AgentContext = {
  conversationId: "conv-abc",
  message: "帮我解释这段代码",
  history: [...],
  agents: [{ id: "a1", name: "Claude", provider: "claude" }],
};

for await (const chunk of adapter.execute(context)) {
  // chunk.type: text | tool_call | error | done
  // 发送给客户端
  sendToClient(chunk);
}
```

**服务端执行流程：**

```
API Server 进程
    │
    ├── spawn("claude", [
    │     "--bare",
    │     "-p", prompt,
    │     "--output-format", "stream-json",
    │     "--include-partial-messages",
    │     "--dangerously-skip-permissions",
    │     "--max-turns", "25",
    │   ])
    │
    ├── 子进程 stdout → 逐行读取
    │     parseClaudeStreamJson(line)
    │       → stream_event / content_block_delta / text_delta → Chunk{Text}
    │       → result → Chunk{Done, metadata: {usage, sessionId}}
    │
    └── 子进程退出
          ├── exitCode === 0 → 正常结束
          └── exitCode !== 0 → yield Chunk{Error}
```

### 4.2 OpenCodeAdapter（后端场景）

```typescript
import { OpenCodeAdapter } from "@agenthub/agent-core";

const adapter = new OpenCodeAdapter({
  cliPath: "/usr/local/bin/opencode",
  model: "anthropic/claude-sonnet-4-6",
  timeout: 300_000,
});
```

**服务端执行流程：**

```
API Server 进程
    │
    ├── spawn("opencode", [
    │     "run",
    │     "--format", "json",
    │     "-m", "anthropic/claude-sonnet-4-6",
    │     prompt,
    │   ])
    │
    ├── 子进程 stdout → 逐行读取
    │     parseOpenCodeEvent(line)
    │       → type: text       → Chunk{Text}
    │       → type: tool_use   → Chunk{ToolCall}
    │       → type: error      → Chunk{Error}
    │       → type: step_finish → Chunk{Done}
    │
    └── 子进程退出
          ├── exitCode === 0 → 正常结束
          └── exitCode !== 0 → yield Chunk{Error}
```

### 4.3 健康检查

API Server 定期对配置好的 CLI 进行健康检查：

```typescript
// 服务端启动时 / 定期执行
async function checkCliHealth() {
  const claudeAdapter = new ClaudeAdapter({ cliPath: serverConfig.claudePath });
  const opencodeAdapter = new OpenCodeAdapter({ cliPath: serverConfig.opencodePath });

  const [claudeHealth, opencodeHealth] = await Promise.all([
    claudeAdapter.healthCheck(),
    opencodeAdapter.healthCheck(),
  ]);

  // claude --version → exitCode 0 → healthy
  // opencode --version → exitCode 0 → healthy

  serverConfig.claudeAvailable = claudeHealth.status === "healthy";
  serverConfig.opencodeAvailable = opencodeHealth.status === "healthy";
}
```

***

## 五、传输协议

### 5.1 WebSocket（推荐）

**适用端：** Web、Desktop、Mobile
**优势：** 双向通信，客户端可随时发送中止信号

```
客户端 → 服务端:
{
  "type": "execute",
  "payload": { "provider": "claude", "message": "你好", ... }
}

服务端 → 客户端 (流式):
{"type":"chunk","payload":{"type":"text","content":"你好！"}}
{"type":"chunk","payload":{"type":"text","content":"有什么可以帮你的？"}}
{"type":"chunk","payload":{"type":"done","metadata":{"usage":{...}}}}

客户端 → 服务端 (中止):
{"type":"abort"}
```

**连接生命周期：**

```
1. 客户端  ──→  WebSocket 连接建立
2. 客户端  ──→  发送 execute 消息
3. 服务端  ──→  循环发送 chunk 消息
4. 客户端  ──→  发送 abort（可选）
5. 服务端  ──→  发送 done chunk
6. 连接关闭
```

### 5.2 HTTP SSE（备选）

**适用端：** Web（简单场景）
**局限：** 单向通信，客户端无法发送中止（需用 HTTP/2 或独立 abort 端点）

```
POST /api/agent/execute

Response:
Content-Type: text/event-stream

data: {"type":"text","content":"你好！"}
data: {"type":"text","content":"有什么可以帮你的？"}
data: {"type":"done","metadata":{"usage":{...}}}
```

**Abort 策略：** 客户端断开 TCP 连接 → 服务端 `req.on("close")` → `adapter.abort()`

***

## 六、会话与进程管理

### 6.1 Session 状态

```
┌────────────────────────────────────────────┐
│           Session 状态机                     │
│                                            │
│  ┌─────────┐     execute()     ┌────────┐  │
│  │ PENDING │ ────────────────▶ │ RUNNING│  │
│  └─────────┘                   └────────┘  │
│                                    │        │
│                      ┌─────────────┼──────┐ │
│                      ▼             ▼      ▼ │
│                  ┌──────┐   ┌──────┐  ┌────┐│
│                  │DONE  │   │ERROR │  │ABORT││
│                  └──────┘   └──────┘  └────┘│
│                                            │
└────────────────────────────────────────────┘
```

### 6.2 进程资源管理

服务端需要管理多个并发的子进程：

```typescript
interface Session {
  id: string;
  conversationId: string;
  provider: "claude" | "opencode";
  adapter: AgentAdapter;
  process: ChildProcess;
  createdAt: number;
  status: "pending" | "running" | "done" | "error" | "aborted";
}

class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private maxConcurrent: number;
  private queue: Array<{ sessionId: string; context: AgentContext }> = [];

  async createSession(provider, context): Promise<string> {
    if (this.sessions.size >= this.maxConcurrent) {
      // 排队或拒绝
      throw new Error("Server busy, max concurrent processes reached");
    }

    const adapter = createAdapter(provider, serverConfig[provider]);
    const session: Session = {
      id: crypto.randomUUID(),
      conversationId: context.conversationId,
      provider,
      adapter,
      process: null,  // 由 execute() 内部创建
      createdAt: Date.now(),
      status: "pending",
    };

    this.sessions.set(session.id, session);
    this.executeSession(session, context);

    return session.id;
  }

  abortSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && (session.status === "pending" || session.status === "running")) {
      session.adapter.abort();
      session.status = "aborted";
    }
  }

  cleanupStaleSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      // 清理超过 10 分钟没有更新的 session
      if (now - session.createdAt > 600_000) {
        session.adapter.abort();
        this.sessions.delete(id);
      }
    }
  }
}
```

### 6.3 并发控制策略

| 策略      | 说明             | 适用场景     |
| ------- | -------------- | -------- |
| 限制最大并发数 | 超出排队或拒绝        | 服务端资源有限时 |
| 会话队列    | FIFO 队列等待执行    | 长时间运行任务  |
| 按用户隔离   | 每个用户独立配额       | 多租户场景    |
| 空闲超时清理  | 超过 N 分钟无活动自动中止 | 防止僵尸进程   |

***

## 七、错误处理

### 7.1 错误分类与处理

| 错误类型        | 产生阶段                | Chunk 内容                          | 客户端感知  |
| ----------- | ------------------- | --------------------------------- | ------ |
| CLI 未安装     | healthCheck / spawn | `"claude CLI not found"`          | 服务不可用  |
| CLI 退出码非零   | 进程退出                | `"claude CLI exited with code 1"` | 执行失败   |
| 请求超时        | execute 中           | `"Request timed out"`             | 超时提示   |
| 客户端断开       | 传输层                 | `"Client disconnected"`           | 自动重连提示 |
| 超出并发限制      | 请求入队                | `"Server busy"`                   | 稍后重试   |
| 无效 provider | 路由分发                | `"Unsupported provider: xxx"`     | 配置错误   |

### 7.2 客户端重连策略

```
客户端断线重连流程：

1. 客户端检测到 WebSocket 断开
2. 进入重连等待（指数退避: 1s, 2s, 4s, 8s...）
3. 重新建立 WebSocket 连接
4. 发送 Resume 请求（携带 sessionId）
5. 服务端:
   ├── Session 仍存活 → 从断点继续发送 Chunk
   └── Session 已过期 → 返回错误，客户端重新执行
```

***

## 八、安全与鉴权

### 8.1 API 鉴权

```
客户端请求
    │
    ├── Header: Authorization: Bearer <user_token>
    │
    └── API Server 中间件
          ├── 验证 token 有效性
          ├── 提取用户身份
          ├── 检查调用权限
          └── 请求通过 → 进入执行流程
```

### 8.2 CLI 访问控制

服务端应限制 CLI 的执行权限：

- `claude` 和 `opencode` 二进制应有**独立的系统用户**运行
- 使用容器（Docker）隔离 CLI 进程
- 禁止 CLI 访问宿主机敏感文件
- 通过 `seccomp` / `AppArmor` 限制系统调用

***

## 九、与其它调用方式的对比

| 维度     | 后端 CLI             | 本地 CLI    | 外部 API      |
| ------ | ------------------ | --------- | ----------- |
| 执行位置   | 服务端                | 客户端本地     | 第三方 API     |
| 网络依赖   | 依赖网络               | 不依赖       | 依赖网络        |
| CLI 安装 | 服务端需要安装            | 客户端需要安装   | 不需要         |
| 客户端支持  | Web/Desktop/Mobile | Desktop 仅 | Web/Desktop |
| 延迟     | 中等（网络+服务端）         | 低         | 中等（网络）      |
| 可扩展性   | 服务端资源决定            | 单机        | 取决于 API 配额  |
| 数据隐私   | 数据到服务端             | 数据在本地     | 数据到第三方      |

***

## 十、当前实现状态

| 组件                     | 状态            | 说明                                         |
| ---------------------- | ------------- | ------------------------------------------ |
| `@agenthub/agent-core` | ✅ 已完成         | 包含 ClaudeAdapter、OpenCodeAdapter、Chunk 解析器 |
| API Server             | ❌ 未实现         | 独立的服务端模块，需新建                               |
| 传输协议封装                 | ❌ 未实现         | WebSocket / SSE 客户端 SDK                    |
| Session 管理             | ❌ 未实现         | 并发控制、队列、重连                                 |
| 健康检查集成                 | ⚡ adapter 已完成 | 需集成到服务端启动流程                                |
| 鉴权中间件                  | ❌ 未实现         | 用户认证、权限检查                                  |

***

## 十一、示例：完整调用流程

```typescript
// 服务端伪代码：处理客户端请求

import { createAdapter } from "@agenthub/agent-core";
import type { AgentContext, Chunk } from "@agenthub/shared";

async function handleWebSocketExecute(ws, request) {
  const { provider, message, history, conversationId } = request;

  // 1. 构建上下文
  const context: AgentContext = {
    conversationId,
    message,
    history,
    agents: [{ id: "server-cli", name: provider, provider }],
  };

  // 2. 创建适配器
  const adapter = createAdapter(provider, {
    cliPath: provider === "claude"
      ? "/usr/local/bin/claude"
      : "/usr/local/bin/opencode",
    timeout: 300_000,
  });

  // 3. 监听客户端中止
  ws.on("close", () => adapter.abort());

  // 4. 执行并流式返回
  for await (const chunk of adapter.execute(context)) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(chunk));
    }
  }
}
```

***

## 十二、文件清单（计划中的 API Server）

```
apps/api-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # 入口，启动 HTTP / WebSocket 服务
│   ├── routes/
│   │   ├── agent.execute.ts      # POST /api/agent/execute (SSE)
│   │   └── agent.health.ts       # GET  /api/agent/health
│   ├── websocket/
│   │   ├── handler.ts            # WebSocket 连接处理
│   │   └── protocol.ts           # 消息协议定义
│   ├── session/
│   │   ├── manager.ts            # Session 管理器
│   │   └── types.ts              # Session 类型
│   ├── middleware/
│   │   ├── auth.ts               # 鉴权中间件
│   │   └── rate-limit.ts         # 限流
│   └── config/
│       └── index.ts              # 服务端配置
```

