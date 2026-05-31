## ADDED Requirements

### Requirement: SSE 事件名统一

系统 SHALL 使用统一的事件名推送 SSE 消息，与单聊路径保持一致。

#### Scenario: Orchestrator 推送文本块

- **WHEN** orchestrator 中的 agent 输出文本内容
- **THEN** SSE 事件名使用 "chunk"
- **AND** data 中包含 `agentId` 字段标识来源 agent

#### Scenario: Orchestrator 推送完成事件

- **WHEN** orchestrator 中的 agent 执行完成
- **THEN** SSE 事件名使用 "done"
- **AND** data 中包含 `agentId` 和 `messageId` 字段

#### Scenario: Orchestrator 推送错误事件

- **WHEN** orchestrator 中的 agent 执行出错
- **THEN** SSE 事件名使用 "error"
- **AND** data 中包含 `message` 和 `code` 字段

### Requirement: Workspace 路径传递

系统 SHALL 在 orchestrator 执行 agent 时传递 conversation 的工作目录。

#### Scenario: Executor 创建 adapter

- **WHEN** `SubTaskExecutor.createAdapterForAgent` 被调用
- **THEN** 从 `SubTask.conversationId` 查询 `conversation.workspacePath`
- **AND** 将 `cwd` 传递给 `createAdapter`

### Requirement: 群成员过滤

系统 SHALL 仅使用 conversation 中的群成员进行任务分配。

#### Scenario: 群聊触发 orchestrator

- **WHEN** 群聊中收到用户消息
- **THEN** 从 `conversation.contactIds` 获取群成员列表
- **AND** 仅将这些成员作为候选 agent

### Requirement: 触发条件放宽

系统 SHALL 允许单 @ 或无 @ 消息触发 orchestrator。

#### Scenario: 单 @ 消息

- **WHEN** 用户在群聊中仅 @1 个 agent
- **THEN** 系统仍触发 orchestrator 进行意图分析
- **AND** LLM 决定是否需要其他 agent 参与

#### Scenario: 无 @ 消息触发

- **WHEN** 用户在群聊中发送无 @ 消息
- **THEN** 系统触发 orchestrator
- **AND** LLM 判断是否需要分配 agent
