## ADDED Requirements

### Requirement: Agent list endpoint
系统应提供 `GET /api/agents/list` 端点，返回所有可用 Agent 的列表。可通过 `provider` 查询参数过滤。

#### Scenario: 列出所有 Agent
- **WHEN** 调用 `GET /api/agents/list`
- **THEN** 返回 Agent 数组，按创建时间降序排列

#### Scenario: 按提供商过滤
- **WHEN** 调用 `GET /api/agents/list?provider=Claude`
- **THEN** 仅返回提供商为 Claude 的 Agent

#### Scenario: 未认证请求被拒绝
- **WHEN** 调用 `GET /api/agents/list` 且未携带 Bearer token
- **THEN** 返回 401

### Requirement: Agent create endpoint
系统应提供 `POST /api/agents/create` 端点，用于创建自定义 Agent。

#### Scenario: 创建自定义 Agent
- **WHEN** 使用有效请求体 `{ name, provider, systemPrompt?, model? }` 调用 `POST /api/agents/create`
- **THEN** 返回 201 及新创建的 Agent

#### Scenario: 缺少 name 被拒绝
- **WHEN** 请求体不包含 `name`
- **THEN** 返回 400

#### Scenario: 无效 provider 被拒绝
- **WHEN** 请求体包含无效的 `provider` 值
- **THEN** 返回 400

### Requirement: Agent detail endpoint
系统应提供 `GET /api/agents/:id/detail` 端点，返回指定 Agent 的详情。

#### Scenario: 获取 Agent 详情
- **WHEN** 调用 `GET /api/agents/:id/detail`
- **THEN** 返回 Agent 详情及联系人计数

#### Scenario: Agent 不存在
- **WHEN** 调用 `GET /api/agents/:id/detail` 且 ID 不存在
- **THEN** 返回 404
