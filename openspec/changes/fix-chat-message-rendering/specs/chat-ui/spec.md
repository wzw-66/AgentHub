## MODIFIED Requirements

### Requirement: 消息气泡渲染
消息 SHALL 以气泡形式显示，按发送者类型区分样式和位置。

#### Scenario: 用户消息右对齐
- **WHEN** `senderType` 为 "user"
- **THEN** 消息显示为右对齐气泡，彩色背景，上方显示 "你" 标签

#### Scenario: Agent 消息左对齐
- **WHEN** `senderType` 为 "contact"
- **THEN** 消息显示为左对齐气泡，深色背景配左侧彩色强调线，上方显示 Agent 名称标签

#### Scenario: 系统消息居中
- **WHEN** `senderType` 为 "system"
- **THEN** 消息居中显示，灰色文字，小字号

#### Scenario: 消息内容渲染
- **WHEN** 消息包含 markdown 格式内容
- **THEN** 使用 `react-markdown` 渲染为格式化内容（代码块使用 `CodeBlock` 组件）
- **WHEN** 消息包含 diff 或 artifact
- **THEN** 分别使用 DiffCard、ArtifactCard 组件渲染
