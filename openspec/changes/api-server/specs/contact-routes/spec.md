## ADDED Requirements

### Requirement: Contact list endpoint
系统应提供 `GET /api/contacts/list` 端点，返回当前认证用户的联系人列表，按置顶状态和名称排序。

#### Scenario: 列出联系人
- **WHEN** 调用 `GET /api/contacts/list`
- **THEN** 返回联系人数组，每个联系人包含关联 Agent 的基本信息（id, name, avatarUrl, provider），按置顶优先、名称升序排列

#### Scenario: 未认证请求被拒绝
- **WHEN** 调用 `GET /api/contacts/list` 且未携带 Bearer token
- **THEN** 返回 401

### Requirement: Contact create endpoint
系统应提供 `POST /api/contacts/create` 端点，通过 `agentId` 添加新联系人。

#### Scenario: 添加联系人
- **WHEN** 使用 `{ agentId, displayName? }` 调用 `POST /api/contacts/create`
- **THEN** 返回 201 及新创建的联系人

#### Scenario: 缺少 agentId 被拒绝
- **WHEN** 请求体不包含 `agentId`
- **THEN** 返回 400

### Requirement: Contact update endpoint
系统应提供 `PATCH /api/contacts/:id/update` 端点，更新联系人的显示名或置顶状态。

#### Scenario: 更新联系人
- **WHEN** 使用 `{ displayName?, isPinned? }` 调用 `PATCH /api/contacts/:id/update`
- **THEN** 返回更新后的联系人

#### Scenario: 权限拒绝
- **WHEN** 当前用户不是该联系人的所有者
- **THEN** 返回 403

#### Scenario: 联系人不存在
- **WHEN** 联系人的 ID 不存在
- **THEN** 返回 404

### Requirement: Contact delete endpoint
系统应提供 `DELETE /api/contacts/:id/delete` 端点，删除指定联系人。

#### Scenario: 删除联系人
- **WHEN** 调用 `DELETE /api/contacts/:id/delete`
- **THEN** 返回 204

#### Scenario: 删除他人联系人被拒绝
- **WHEN** 当前用户不是该联系人的所有者
- **THEN** 返回 403
