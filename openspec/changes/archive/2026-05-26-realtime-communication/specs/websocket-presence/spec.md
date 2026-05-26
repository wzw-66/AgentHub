## ADDED Requirements

### Requirement: WebSocket 端点认证

WebSocket 端点 SHALL 通过 JWT 查询参数验证客户端身份，无效 token 时 SHALL 关闭连接。

#### Scenario: 有效 token 建立连接
- **WHEN** 客户端使用有效 JWT token 作为查询参数连接 `GET /ws?token=<jwt>`
- **THEN** 服务端验证 token 成功并建立 WebSocket 连接

#### Scenario: 无效 token 被拒绝
- **WHEN** 客户端使用无效或过期的 JWT token 连接 WebSocket 端点
- **THEN** 服务端关闭 WebSocket 连接并返回 401

### Requirement: WebSocket 消息格式

所有 WebSocket 消息 SHALL 使用统一 JSON 格式：`{ "type": string, "payload": unknown, "timestamp": string }`。

#### Scenario: 发送消息
- **WHEN** 服务端向客户端推送事件
- **THEN** 消息体为符合上述格式的 JSON 字符串

#### Scenario: 收到消息
- **WHEN** 服务端收到客户端消息
- **THEN** 服务端解析 JSON 后按 type 分发处理

### Requirement: Typing 指示器

WebSocket SHALL 支持 typing 状态的双向通知。

#### Scenario: 用户开始输入
- **WHEN** 用户开始输入消息
- **THEN** 客户端发送 `{ "type": "typing:start", "conversationId": "..." }`

#### Scenario: 用户停止输入
- **WHEN** 用户停止输入超过 3 秒或发送消息
- **THEN** 客户端发送 `{ "type": "typing:end", "conversationId": "..." }`

#### Scenario: 广播输入状态
- **WHEN** 服务端收到 `typing:start` 或 `typing:end` 事件
- **THEN** 服务端向同一会话的所有其他客户端广播 `{ "type": "typing:indicator", "payload": { "conversationId": "...", "userId": "...", "isTyping": true|false } }`

### Requirement: 在线状态

WebSocket SHALL 支持用户在线/离线状态广播。

#### Scenario: 用户上线
- **WHEN** 用户建立 WebSocket 连接
- **THEN** 服务端广播 `{ "type": "status:update", "payload": { "userId": "...", "status": "online" } }` 给该用户所在会话的其他成员

#### Scenario: 用户离线
- **WHEN** 用户断开 WebSocket 连接
- **THEN** 服务端广播 `{ "type": "status:update", "payload": { "userId": "...", "status": "offline" } }` 给该用户所在会话的其他成员

### Requirement: 消息通知

服务端 SHALL 通过 WebSocket 推送新消息通知给相关会话成员。

#### Scenario: 新消息通知
- **WHEN** 会话中创建了新消息
- **THEN** 服务端向该会话所有在线客户端推送 `{ "type": "notification", "payload": { "conversationId": "...", "senderId": "...", "preview": "..." } }`，除发送者本人外

#### Scenario: 已读回执
- **WHEN** 用户阅读了消息
- **THEN** 客户端发送 `{ "type": "message:read", "payload": { "conversationId": "...", "messageId": "..." } }`

### Requirement: 心跳保活

WebSocket 连接 SHALL 实现心跳机制以检测断线。

#### Scenario: 客户端心跳
- **WHEN** 客户端保持连接
- **THEN** 客户端每 30 秒发送 `{ "type": "ping" }`
- **AND** 服务端回复 `{ "type": "pong" }`

#### Scenario: 服务端超时断开
- **WHEN** 服务端超过 60 秒未收到客户端任何消息
- **THEN** 服务端主动关闭该 WebSocket 连接
- **AND** 触发离线状态广播

### Requirement: 连接生命周期管理

WebSocket 连接 SHALL 被统一注册、追踪和清理。

#### Scenario: 连接注册
- **WHEN** WebSocket 连接建立并认证通过
- **THEN** 连接被注册到连接管理器中，关联到对应用户 ID

#### Scenario: 连接清理
- **WHEN** WebSocket 连接关闭（正常关闭或超时断开）
- **THEN** 服务端从连接管理器中移除该连接
