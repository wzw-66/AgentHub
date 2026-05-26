## 1. 依赖与基础设施

- [x] 1.1 添加 `@fastify/websocket` 依赖到 `apps/server/package.json`
- [x] 1.2 在 `apps/server/src/app.ts` 中注册 `@fastify/websocket` 插件
- [x] 1.3 创建 `src/realtime/` 目录结构

## 2. 连接管理器

- [x] 2.1 实现 `ConnectionManager` 类：SSE 连接 Map (`Map<conversationId, Set<FastifyReply>>`) 和 WS 连接 Map (`Map<userId, Set<WebSocket>>`)
- [x] 2.2 实现 `addSSEConnection` / `removeSSEConnection` / `pushToConversation` 方法
- [x] 2.3 实现 `addWSConnection` / `removeWSConnection` / `broadcastToConversation` / `broadcastToUser` 方法
- [x] 2.4 在 `buildApp()` 中实例化 `ConnectionManager` 并注入路由

## 3. SSE 端点

- [x] 3.1 实现 `GET /sse/conversations/:conversationId/stream` 路由，使用 `verifyQueryToken` 验证查询参数 token
- [x] 3.2 设置 SSE 响应头：`Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`
- [x] 3.3 连接成功后注册到 `ConnectionManager`
- [x] 3.4 处理客户端断线：监听 `request.raw.on("close")` 并从 ConnectionManager 移除
- [x] 3.5 实现 SSE 事件格式化工具函数：`formatSSEEvent(event: string, data: unknown): string`

## 4. SSE 事件推送

- [x] 4.1 实现 `POST /messages/:id/execute` 端点，验证消息存在性并返回 404（不存在时）
- [x] 4.2 在 `/messages/:id/execute` 中调用 `AgentAdapter.execute()`，遍历 `AsyncIterable<Chunk>`
- [x] 4.3 将 Text/Code/ToolCall 类型的 Chunk 映射为 SSE `chunk` 事件并推送
- [x] 4.4 将 Artifact 类型 Chunk 映射为 SSE `artifact_status` 事件并推送
- [x] 4.5 Agent 执行完成后推送 `done` 事件（含 token 用量元数据）
- [x] 4.6 捕获 Agent 执行异常并推送 `error` 事件

## 5. WebSocket 端点

- [x] 5.1 实现 WebSocket 路由 `/ws`，使用 `verifyQueryToken` 验证查询参数 token
- [x] 5.2 认证通过后注册到 `ConnectionManager`，广播 `status:update (online)`
- [x] 5.3 认证失败时关闭连接并返回 401
- [x] 5.4 实现消息解析和类型派发（按 `type` 字段分发到不同 handler）
- [x] 5.5 处理连接关闭：从 ConnectionManager 移除并广播 `status:update (offline)`

## 6. WebSocket 事件处理

- [x] 6.1 实现 `typing:start` / `typing:end` 事件处理：广播 `typing:indicator` 给会话其他成员
- [x] 6.2 实现 `message:read` 事件处理：记录已读状态（可选，当前可仅接收不处理）
- [x] 6.3 实现新消息创建时的 `notification` 推送（在消息创建路由中联动 WS 广播）

## 7. WebSocket 心跳

- [x] 7.1 实现 `ping` 事件处理并回复 `pong`
- [x] 7.2 实现服务端超时检测：60 秒无消息则主动断开连接
- [x] 7.3 断线时触发完整清理流程（状态广播、连接移除）

## 8. 集成测试

- [x] 8.1 编写 SSE 连接建立和认证测试（有效 token、无效 token、无 token）
- [x] 8.2 编写 SSE 事件推送测试（chunk、done、error 事件）
- [x] 8.3 编写 SSE 多客户端接收测试
- [x] 8.4 编写 `/messages/:id/execute` 端点测试（存在/不存在/未认证）
- [x] 8.5 编写 WebSocket 连接和认证测试
- [x] 8.6 编写 WebSocket typing 指示器广播测试
- [x] 8.7 编写 WebSocket 心跳（ping/pong）测试
- [x] 8.8 编写 WebSocket 在线状态广播测试
- [x] 8.9 编写 WebSocket 超时断开测试
