## ADDED Requirements

### Requirement: Agent 交互执行

Agent 在执行过程中 SHALL 支持通过 `AskUserQuestion` 工具与用户进行双向交互。Agent 发出交互请求后 SHALL 暂停执行，等待用户回复后继续。

#### Scenario: Agent 向用户提问并提供选项
- **WHEN** Agent 需要用户选择方向时调用 `AskUserQuestion` 工具
- **THEN** 系统 SHALL 检测到 `tool_use` 类型为 `AskUserQuestion`
- **THEN** 系统 SHALL 提取 `input.questions` 数组中的问题文本和选项列表
- **THEN** 系统 SHALL 将交互事件推送到前端，前端渲染为带选项按钮的交互卡片
- **THEN** 用户选择一个选项后，系统 SHALL 将用户的选择文本写入 Agent 的 stdin
- **THEN** Agent 收到回复后 SHALL 继续执行并流式输出后续内容

#### Scenario: Agent 请求用户确认
- **WHEN** Agent 需要用户确认某操作时调用 `AskUserQuestion` 工具（仅一个问题，无选项）
- **THEN** 系统 SHALL 在前端渲染为确认对话框（确认/取消）
- **THEN** 用户确认后，系统 SHALL 将 "Yes" 或类似确认文本写入 Agent 的 stdin
- **THEN** Agent 继续执行

#### Scenario: 交互超时处理
- **WHEN** Agent 发出交互请求后用户超过 120 秒未回复
- **THEN** 系统 SHALL 超时并终止 Agent 执行
- **THEN** 系统 SHALL 向前端推送错误事件
- **THEN** 系统 SHALL 清理 Agent 子进程

#### Scenario: WebSocket 断连时使用 REST 备选通道
- **WHEN** 前端 WebSocket 连接断开
- **THEN** 系统 SHALL 通过 REST 端点 `POST /api/conversations/:id/interact/respond` 接收用户回复
- **THEN** 该端点 SHALL 验证请求属于正确的 conversation
- **THEN** 系统 SHALL 通过 ConversationManager 的 `resolveInteraction()` 恢复执行

#### Scenario: 交互取消
- **WHEN** 用户选择取消交互（关闭交互卡片）
- **THEN** 系统 SHALL 终止当前 Agent 执行
- **THEN** 系统 SHALL 清理 Agent 子进程

#### Scenario: 普通文本回复（非选项选择）
- **WHEN** 用户输入自定义文本而非选择预设选项
- **THEN** 系统 SHALL 将用户输入的文本直接写入 Agent 的 stdin
- **THEN** Agent 将收到该文本作为下一轮对话的 user message
- **THEN** Agent 正常继续执行

### Requirement: ChunkType.Interactive 定义

系统 SHALL 在 `packages/shared/src/enums/chunk.ts` 中新增 `Interactive` 枚举值。

#### Scenario: 新增枚举值
- **WHEN** 系统加载 `ChunkType` 枚举
- **THEN** `ChunkType` SHALL 包含 `Interactive = "interactive"` 值

#### Scenario: Interactive Chunk 数据结构
- **WHEN** Agent 发出交互请求
- **THEN** Chunk 的 `type` SHALL 为 `"interactive"`
- **THEN** Chunk 的 `content` SHALL 为交互提示文本
- **THEN** Chunk 的 `metadata` SHALL 包含 `toolUseId`、`options`（选项数组）、`multiSelect` 标志

### Requirement: WebSocket 双向交互协议

系统 SHALL 在 WebSocket 协议中新增 `user:interact` 入站消息类型。

#### Scenario: 前端发送交互回复
- **WHEN** 用户在交互卡片上做出选择
- **THEN** 前端 SHALL 通过 WebSocket 发送 `{"type": "user:interact", "payload": {"conversationId": "...", "response": "..."}}`
- **THEN** 服务端收到后 SHALL 调用 `ConnectionManager.resolveInteraction()` 传递回复内容
- **THEN** 被挂起的 Agent 执行 SHALL 恢复
