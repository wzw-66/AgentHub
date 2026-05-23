## 新增需求

### 需求：SSE 端点用于 Agent 流式输出
系统应提供一个 Server-Sent Events 端点，用于将 Agent 响应流式推送到客户端。

#### 场景：连接到 SSE 流
- **当** 客户端连接到 `GET /sse/conversations/:id/stream?token=jwt`
- **则** 连接应建立成功并发送 `event: connected`

#### 场景：发出 Chunk 事件
- **当** Agent 产生输出数据块
- **则** 应发出 `event: chunk`，包含 `type` 和 `content` 的 JSON 数据

#### 场景：发出 Done 事件
- **当** Agent 执行完成
- **则** 应发出 `event: done`，包含 token 用量信息

### 需求：WebSocket 端点用于双向消息
系统应提供一个 WebSocket 端点，用于实时双向通信。

#### 场景：WebSocket 连接建立
- **当** 客户端连接到 `ws://host/ws?token=jwt`
- **则** WebSocket 连接应建立成功

#### 场景：输入中状态指示器
- **当** 用户发送 `{ type: "typing", conversationId, isTyping: true }`
- **则** 其他参与者应收到 `typing` 事件

#### 场景：消息状态更新
- **当** 消息投递成功
- **则** 发送方应收到 `{ type: "message_status", messageId, status: "delivered" }`

#### 场景：Agent 输入中通知
- **当** Agent 开始/停止输入
- **则** 会话参与者应收到 `{ type: "agent_typing", agentName }`

#### 场景：心跳/ping
- **当** 客户端发送 `{ type: "ping" }`
- **则** 服务器应响应 `{ type: "pong" }`

### 需求：连接管理
系统应管理客户端连接，支持自动清理和重连。

#### 场景：断开连接时清理
- **当** 客户端断开连接
- **则** 所有关联的流和订阅应被清理

#### 场景：建立连接时验证令牌
- **当** 客户端连接到 SSE 或 WS
- **则** 应在建立连接前验证 JWT 令牌
