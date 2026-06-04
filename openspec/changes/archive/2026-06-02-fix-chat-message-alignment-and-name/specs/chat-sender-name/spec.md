## ADDED Requirements

### Requirement: 用户消息显示当前用户名
系统 SHALL 在用户消息的气泡上方显示当前登录用户的 `username`，而非硬编码的 "YOU"。

#### Scenario: 已登录用户发送消息
- **WHEN** 用户已登录且 `user.username` 不为空
- **THEN** 用户消息的发送者标签显示 `user.username`

#### Scenario: 用户信息不可用
- **WHEN** 当前用户信息为 null（未登录状态）
- **THEN** 用户消息的发送者标签回退显示 "YOU" / "你"

### Requirement: Contact 消息显示 contact name
系统 SHALL 在 Contact 消息的气泡上方显示对应 contact 的 `name` 字段。

#### Scenario: Contact 存在于 contacts 列表中
- **WHEN** 消息的 `senderId` 匹配 `contacts` 数组中某个 contact 的 `id`
- **THEN** 显示该 contact 的 `name`

#### Scenario: Contact 不存在于 contacts 列表中
- **WHEN** 消息的 `senderId` 未匹配到任何 contact
- **THEN** 显示 `senderId` 作为回退

### Requirement: Streaming 消息使用正确的 senderId
系统 SHALL 在流式输出（streaming）过程中使用正确的 agent ID 作为 senderId，而非硬编码的 "agent"。

#### Scenario: SSE chunk 包含 agentId
- **WHEN** SSE 收到 chunk 事件且包含 `agentId` 字段
- **THEN** streaming 消息的 senderId 使用该 agentId

#### Scenario: SSE chunk 不包含 agentId
- **WHEN** SSE 收到 chunk 事件但不包含 `agentId` 字段
- **THEN** streaming 消息的 senderId 使用默认值 "agent"
