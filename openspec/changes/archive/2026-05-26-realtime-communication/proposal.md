## Why

AgentHub 使用 IM 聊天作为核心交互范式，Agent 的流式输出、用户的输入状态、消息通知等场景都需要实时通信能力。当前 REST API 只能通过轮询获取新消息，无法支撑"正在输入"、"流式输出"、"在线状态"等核心体验。需要引入 SSE 和 WebSocket 两条实时通道，让聊天体验从"刷新看看"变为"实时推送"。

## What Changes

- 在 `@agenthub/server` 中引入 SSE (Server-Sent Events) 端点，用于 Agent 流式输出的实时推送
- 在 `@agenthub/server` 中引入 WebSocket 端点，用于 typing 指示器、已读回执、在线状态、消息通知等双向实时交互
- 新增 `@fastify/websocket` 依赖
- 实现连接管理器，统一管理 SSE 和 WebSocket 连接的注册、推送和清理
- 实现心跳机制（ping/pong）和断线检测
- 所有实时连接通过 JWT 查询参数认证（复用已有 `verifyQueryToken`）
- 新增 `/messages/:id/execute` 独立端点，用于触发 Agent 执行并通过 SSE 推送结果（与消息创建职责分离）

## Capabilities

### New Capabilities

- `sse-stream`: SSE 端点 `GET /sse/conversations/:conversationId/stream`，JWT 认证，推送 Agent 流式 Chunk、done、error 事件
- `websocket-presence`: WebSocket 端点 `/ws`，支持 typing 指示器、已读回执、在线状态广播、消息通知、心跳保活

### Modified Capabilities

<!-- No existing specs need modification. -->

## Impact

- **Affected package**: `@agenthub/server` (apps/server)
- **New dependency**: `@fastify/websocket`
- **New routes**: `GET /sse/conversations/:conversationId/stream`, `POST /messages/:id/execute`, WebSocket `/ws`
- **New module**: `src/realtime/` — 连接管理器、SSE 推送工具、WS 事件类型
- **Auth reuse**: 已有 `verifyQueryToken` 处理 SSE 和 WS 的 token 验证，无需改动 auth 层
- **Agent-core integration**: 调用 `AgentAdapter.execute()` 产生 `AsyncIterable<Chunk>` 流，通过 SSE 推送给客户端
