## ADDED Requirements

### Requirement: LLM 意图分析

系统 SHALL 使用 LLM 分析用户消息，自动理解用户意图并分配到合适的 Agent。

#### Scenario: 用户消息含 @ 指代

- **WHEN** 用户在群聊中发送 "@前端 @后端 帮我开发一个登录页面"
- **THEN** LLM 理解 @前端 对应 "前端开发" agent，@后端 对应 "后端开发" agent
- **AND** 系统将任务分配给这两个 agent，并生成各自的 instruction

#### Scenario: 用户消息无 @

- **WHEN** 用户在群聊中发送 "帮我写个登录页面"
- **THEN** LLM 分析消息内容，自动判断需要哪些 agent 参与
- **AND** 系统将任务分配给匹配的 agent(s)

#### Scenario: 群聊发送非任务消息

- **WHEN** 用户在群聊中发送 "大家好" 或 "今天天气不错"
- **THEN** LLM 判断无需任何 agent 参与
- **AND** 系统不触发 orchestrator

### Requirement: LLM 指令分配

系统 SHALL 为每个被选中的 Agent 生成具体的 instruction，描述其负责的任务内容。

#### Scenario: 多 Agent 分工

- **WHEN** LLM 识别需要多个 agent 协作
- **THEN** 每个 agent 获得独立的 instruction，描述其具体职责
- **AND** instruction 应具体可执行，而非简单重复用户消息

### Requirement: 执行顺序判断

系统 SHALL 根据任务依赖关系判断 agent 执行顺序（串行或并行）。

#### Scenario: 无依赖并行执行

- **WHEN** 多个 agent 的任务没有先后依赖关系
- **THEN** LLM 设置 order 为 "parallel"
- **AND** 所有 agent 在同一 DAG 层中并行执行

#### Scenario: 有依赖串行执行

- **WHEN** 任务存在先后依赖关系（如先设计后开发）
- **THEN** LLM 设置 order 为 "serial"
- **AND** agent 按依赖顺序分层执行，前一层结果注入后一层 context

### Requirement: LLM Fallback

系统 SHALL 在 LLM 调用失败时降级到规则引擎。

#### Scenario: LLM API 超时

- **WHEN** LLM API 调用超时或返回非 JSON
- **THEN** 系统使用当前消息中所有群成员作为目标 agent
- **AND** 按并行方式执行，instruction 为原始用户消息
