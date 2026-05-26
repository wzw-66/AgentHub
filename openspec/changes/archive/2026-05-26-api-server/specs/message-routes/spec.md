## ADDED Requirements

### Requirement: Message list endpoint
系统应提供 `GET /api/conversations/:id/messages/list` 端点，支持 cursor 分页获取消息。

#### Scenario: 获取消息列表（第一页）
- **WHEN** 调用 `GET /api/conversations/:id/messages/list?limit=50`
- **THEN** 返回 `{ data: Message[], nextCursor: string | null }`，按创建时间升序排列

#### Scenario: 使用 cursor 翻页
- **WHEN** 使用上一页返回的 `nextCursor` 调用 `GET /api/conversations/:id/messages/list?cursor=<cursor>&limit=50`
- **THEN** 返回下一页消息

#### Scenario: 会话不存在
- **WHEN** 会话 ID 不存在
- **THEN** 返回 404

#### Scenario: 未认证请求被拒绝
- **WHEN** 未携带 Bearer token
- **THEN** 返回 401

### Requirement: Message create endpoint
系统应提供 `POST /api/conversations/:id/messages/create` 端点，发送消息。当前仅持久化消息，SSE 流式推送由模块 7 实现。

#### Scenario: 发送文本消息
- **WHEN** 使用 `{ content, type: "Text", parentId? }` 调用 `POST /api/conversations/:id/messages/create`
- **THEN** 返回 201 及新创建的消息，会话的 `lastActiveAt` 更新为当前时间

#### Scenario: 空内容被拒绝
- **WHEN** `content` 为空字符串
- **THEN** 返回 400

#### Scenario: 回复消息
- **WHEN** 使用包含 `parentId` 的请求体调用
- **THEN** 创建的消息的 `parentId` 指向指定消息

### Requirement: Message pin endpoint
系统应提供 `POST /api/conversations/:id/messages/:messageId/pin` 端点，切换消息的置顶状态。

#### Scenario: 置顶消息
- **WHEN** 调用 `POST /api/conversations/:id/messages/:messageId/pin` 且消息当前未置顶
- **THEN** 消息的 `isPinned` 变为 `true`

#### Scenario: 取消置顶
- **WHEN** 调用 `POST /api/conversations/:id/messages/:messageId/pin` 且消息当前已置顶
- **THEN** 消息的 `isPinned` 变为 `false`

#### Scenario: 消息不存在
- **WHEN** `messageId` 不存在
- **THEN** 返回 404
