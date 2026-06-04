## ADDED Requirements

### Requirement: Single conversation deduplication
系统 SHALL 在创建单聊前检查是否已有该用户与该 agent 的活跃单聊，有则复用。

#### Scenario: 已有单聊时复用
- **WHEN** 用户点击 Agent 的 Start Chat 按钮
- **THEN** 系统先调用 `GET /api/conversations/find-by-agent/:agentId` 查询已有单聊
- **AND** 如果返回非空结果，直接跳转到该已有会话

#### Scenario: 无单聊时新建
- **WHEN** 用户点击 Start Chat 且不存在该 agent 的已有单聊
- **THEN** 系统调用 `POST /api/conversations/create` 创建新单聊后跳转

#### Scenario: 查找端点查不到已归档会话
- **WHEN** 查询 `find-by-agent` 时
- **THEN** 仅返回 `isArchived=false` 的活跃会话

#### Scenario: 同一 agent 可在不同用户间拥有独立单聊
- **WHEN** 用户 A 和用户 B 分别与同一 agent 创建单聊
- **THEN** 各自拥有独立的 conversation，互不影响
