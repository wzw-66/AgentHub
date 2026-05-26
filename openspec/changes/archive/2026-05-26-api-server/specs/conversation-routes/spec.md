## ADDED Requirements

### Requirement: Conversation list endpoint
系统应提供 `GET /api/conversations/list` 端点，分页返回当前用户的会话列表，支持偏移分页和归档过滤。

#### Scenario: 分页列出会话
- **WHEN** 调用 `GET /api/conversations/list?offset=0&limit=20`
- **THEN** 返回 `{ data: Conversation[], total: number }`，按最后活跃时间降序排列

#### Scenario: 不包含已归档会话
- **WHEN** 调用 `GET /api/conversations/list`
- **THEN** 默认不返回 `isArchived: true` 的会话

#### Scenario: 包含已归档会话
- **WHEN** 调用 `GET /api/conversations/list?includeArchived=true`
- **THEN** 返回包含已归档会话的列表

#### Scenario: 未认证请求被拒绝
- **WHEN** 调用 `GET /api/conversations/list` 且未携带 Bearer token
- **THEN** 返回 401

### Requirement: Conversation create endpoint
系统应提供 `POST /api/conversations/create` 端点，创建新会话。

#### Scenario: 创建单聊会话
- **WHEN** 使用 `{ title, type: "Single", contactIds }` 调用 `POST /api/conversations/create`
- **THEN** 返回 201 及新创建的会话

#### Scenario: 创建群聊会话
- **WHEN** 使用 `{ title, type: "Group", contactIds }` 调用 `POST /api/conversations/create`
- **THEN** 返回 201 及新创建的群聊会话

#### Scenario: 缺少必需字段被拒绝
- **WHEN** 请求体缺少 `title` 或 `type`
- **THEN** 返回 400

### Requirement: Conversation detail endpoint
系统应提供 `GET /api/conversations/:id/detail` 端点，返回会话详情及最近 50 条消息。

#### Scenario: 获取会话详情
- **WHEN** 调用 `GET /api/conversations/:id/detail`
- **THEN** 返回会话详情，包含最近 50 条消息（含关联产物）

#### Scenario: 会话不存在
- **WHEN** 会话 ID 不存在
- **THEN** 返回 404

### Requirement: Conversation update endpoint
系统应提供 `PATCH /api/conversations/:id/update` 端点，更新会话标题或归档状态。

#### Scenario: 更新会话
- **WHEN** 使用 `{ title?, isArchived? }` 调用 `PATCH /api/conversations/:id/update`
- **THEN** 返回更新后的会话

### Requirement: Conversation delete endpoint
系统应提供 `DELETE /api/conversations/:id/delete` 端点，删除指定会话（级联删除关联消息和产物）。

#### Scenario: 删除会话
- **WHEN** 调用 `DELETE /api/conversations/:id/delete`
- **THEN** 返回 204，关联消息和产物一并级联删除
