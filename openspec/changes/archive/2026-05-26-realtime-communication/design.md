## Context

AgentHub 当前在 `@agenthub/server` 中实现了 Fastify REST API + JWT 认证。所有聊天相关操作（创建消息、获取消息列表等）通过 HTTP 请求-响应模式完成。缺少实时推送能力：

- Agent 执行结果只能等客户端轮询
- "正在输入"、"在线状态"等实时体验无法实现
- 消息通知依赖前端轮询

已有基础设施：
- `@agenthub/shared` 定义了 `Chunk`、`ChunkType`、`AgentAdapter` 接口
- `@agenthub/agent-core` 实现了 `AgentAdapter.execute()` 返回 `AsyncIterable<Chunk>`
- `@agenthub/server` 已有 JWT 认证和 `verifyQueryToken` 函数（为 SSE/WS 预留）
- Fastify v5 已集成，CORS 已配置

## Goals / Non-Goals

**Goals:**
- 实现 SSE 端点，用于 Agent 流式输出的单向后端到前端推送
- 实现 WebSocket 端点，用于 typing 指示器、已读回执、在线状态、消息通知
- 实现连接管理器，统一管理 SSE 和 WebSocket 连接生命周期
- 实现 JWT 查询参数认证（复用 `verifyQueryToken`）
- 实现心跳保活和断线检测
- 实现 `POST /messages/:id/execute` 端点（触发 Agent 执行并推送结果）
- 编写 SSE 和 WebSocket 的集成测试

**Non-Goals:**
- 不提取为独立推送服务（保持单进程，后续可解耦）
- 不实现消息持久化之外的离线消息队列（断线期间的消息不独立缓存）
- 不实现多节点广播（单实例，后续需要 Redis pub/sub 做跨节点）
- 不实现视频/音频等实时媒体通道

## Decisions

### Decision 1: SSE 和 WebSocket 双通道共存

SSE 负责 Agent 流式内容推送（Server → Client，单向），WebSocket 负责状态交互（双向）。

**Alternatives considered:**
| 方案 | 缺点 |
|------|------|
| 纯 WebSocket | Agent 流式输出本为单向，WS 协议开销更大；SSE 有原生事件类型和断线重连支持 |
| 纯 SSE | 无法实现 typing/已读等客户端→服务器双向交互 |
| 长轮询 | 延迟高、资源浪费、无法做"正在输入" |

### Decision 2: 使用 @fastify/websocket

Fastify 官方插件，与现有框架无缝集成，自动处理 HTTP Upgrade。

**Alternatives:**
| 方案 | 缺点 |
|------|------|
| ws 库 + 手动 upgrade | 需要自行处理 Fastify 集成，重复造轮子 |
| socket.io | 太重，自带 room/namespace 等本场景不需要的抽象，且协议不标准 |
| uWebSockets.js | 性能更好，但与 Fastify 集成复杂 |

### Decision 3: 连接管理器单例模式

创建一个 `ConnectionManager` 类，持有 SSE 和 WebSocket 的活跃连接映射。在 `buildApp()` 时实例化并注入路由。

```
ConnectionManager
├── sse: Map<conversationId, Set<FastifyReply>>
│   └── pushToConversation(convId, event, data)
│
└── ws: Map<userId, Set<WebSocket>>
    ├── broadcastToConversation(convId, message)
    ├── broadcastToUser(userId, message)
    └── broadcastToAll(message)
```

**Why**: 避免全局变量，便于测试时替换。

### Decision 4: SSE/WS 查询参数认证

SSE 和 WebSocket 无法在建立连接时发送自定义 HTTP header，因此 token 通过查询参数传递：`?token=<jwt>`。复用已有的 `verifyQueryToken` 函数。

**Why**: 已有的 `verifyQueryToken` 就是为此场景设计的，无需额外改动 auth 层。

### Decision 5: /messages/:id/execute 独立端点

消息创建（`POST /messages/create`）和 Agent 执行分离为两个端点：

1. 用户发消息 → `POST /messages/create` → 存入 DB，返回 201（5ms）
2. 触发 Agent → `POST /messages/:id/execute` → 调用 `AgentAdapter.execute()`，通过 SSE 推送 chunk

**Why**: 职责分离，Orchestrator（Module 8）可以直接接管 execute 做多 Agent 调度；用户发消息无需等待 Agent。

### Decision 6: WebSocket 消息格式规范化

所有 WebSocket 消息使用统一 JSON 格式：

```typescript
{
  type: string;       // 事件类型，如 "typing:start"
  payload: unknown;   // 事件数据
  timestamp: string;  // ISO 时间戳
}
```

**Why**: 统一格式便于客户端和服务端的事件派发器处理。

## Risks / Trade-offs

- [单实例连接容量] → 单进程最多支撑数万并发长连接。**缓解**：初期够用，后续可通过反向代理（Nginx）水平扩展。
- [SSE 断线重连] → 浏览器原生 `EventSource` 支持自动断线重连，但可能丢失断线期间的 chunk。**缓解**：客户端记录最后收到的 chunk index，重连时从断点续传（二期实现）。
- [WebSocket 连接泄漏] → 客户端意外断开时可能未走正常关闭流程。**缓解**：心跳超时自动清理 + connection-manager 的 remove 方法兜底。
- [Token 在 URL 中泄露] → 查询参数可能被服务器日志记录。**缓解**：生产环境使用 HTTPS，配置日志过滤器屏蔽 token 参数。
