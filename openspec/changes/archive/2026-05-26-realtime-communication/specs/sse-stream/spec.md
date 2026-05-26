## ADDED Requirements

### Requirement: SSE 端点认证

SSE 端点 SHALL 通过 JWT 查询参数验证客户端身份，无效 token 时 SHALL 返回 401。

#### Scenario: 有效 token 建立连接
- **WHEN** 客户端使用有效 JWT token 作为查询参数连接 `GET /sse/conversations/:conversationId/stream?token=<jwt>`
- **THEN** 服务端验证 token 成功，保持连接打开，返回 `Content-Type: text/event-stream`

#### Scenario: 无效 token 被拒绝
- **WHEN** 客户端使用无效或过期的 JWT token 连接 SSE 端点
- **THEN** 服务端返回 401 状态码并关闭连接

#### Scenario: 缺少 token 被拒绝
- **WHEN** 客户端未提供 token 参数连接 SSE 端点
- **THEN** 服务端返回 401 状态码并关闭连接

### Requirement: SSE 事件格式

服务端 SHALL 使用标准 SSE 格式推送事件，每条事件包含 event 类型和 JSON 格式的 data。

#### Scenario: 推送 Agent 文本块
- **WHEN** Agent 执行产生 Text 类型 Chunk
- **THEN** 服务端通过 SSE 推送 `event: chunk`，data 包含 `{ "type": "text", "content": "...", "timestamp": "..." }`

#### Scenario: 推送 Agent 完成事件
- **WHEN** Agent 执行完成
- **THEN** 服务端推送 `event: done`，data 包含 `{ "messageId": "...", "tokenUsage": { "input": number, "output": number } }`

#### Scenario: 推送 Agent 错误事件
- **WHEN** Agent 执行过程中发生异常
- **THEN** 服务端推送 `event: error`，data 包含 `{ "message": "...", "code": "..." }`

#### Scenario: 推送产物构建状态
- **WHEN** Agent 开始构建或完成产物
- **THEN** 服务端推送 `event: artifact_status`，data 包含 `{ "id": "...", "status": "building|completed|failed", "title": "..." }`

### Requirement: SSE 断线检测

服务端 SHALL 检测客户端 SSE 断线并清理连接资源。

#### Scenario: 客户端断开清理
- **WHEN** 客户端断开 SSE 连接
- **THEN** 服务端从连接管理器中移除该连接并释放资源

### Requirement: SSE 多客户端推送

同一会话的多个 SSE 客户端 SHALL 都能收到该会话的 Agent 推送事件。

#### Scenario: 多客户端接收流
- **WHEN** 两个客户端同时连接同一会话的 SSE
- **THEN** Agent 执行产生的所有 chunk、done、error 事件 SHALL 被推送到两个客户端

### Requirement: /messages/:id/execute 端点

服务端 SHALL 提供独立端点用于触发 Agent 执行，并通过 SSE 推送结果。

#### Scenario: 执行 Agent 并推送
- **WHEN** 客户端发送 `POST /messages/:id/execute` 且该消息存在
- **THEN** 服务端调用 `AgentAdapter.execute()`，产生的 Chunk 通过 SSE 推送给该会话的已连接客户端

#### Scenario: 消息不存在返回 404
- **WHEN** 客户端对不存在的 messageId 调用 `/messages/:id/execute`
- **THEN** 服务端返回 404 状态码

#### Scenario: 未认证请求被拒绝
- **WHEN** 未认证客户端调用 `/messages/:id/execute`
- **THEN** 服务端返回 401 状态码
