## MODIFIED Requirements

### Requirement: 消息气泡渲染
消息 SHALL 以气泡形式显示，按发送者类型区分样式。

#### Scenario: 用户消息左对齐
- **WHEN** `senderType` 为 "user"
- **THEN** 消息显示为左对齐气泡，蓝色背景

#### Scenario: Agent 消息右对齐
- **WHEN** `senderType` 为 "contact"
- **THEN** 消息显示为右对齐气泡，灰色背景，显示 Agent 头像

#### Scenario: 系统消息居中
- **WHEN** `senderType` 为 "system"
- **THEN** 消息居中显示，灰色文字，小字号

#### Scenario: 消息内容渲染
- **WHEN** 消息内容包含 `~~~artifact` 标记
- **THEN** 先调用 `parseArtifactMarkers()` 分割为块，再按块类型分别渲染（文本→MarkdownRenderer，code→CodeBlock，web_preview→iframe，diff→DiffCard，document→MarkdownRenderer）

#### Scenario: 流式消息实时渲染
- **WHEN** SSE 收到 `chunk` 事件、内容追加到 `streamingMessages`
- **THEN** 对积累的完整内容调用 `parseArtifactMarkers()` 实时分块渲染

#### Scenario: 历史消息兼容旧格式
- **WHEN** 消息类型为 `message.type === "artifact"` 且内容不含 `~~~artifact` 标记
- **THEN** 仍使用旧 ArtifactCard 组件渲染（向后兼容）
