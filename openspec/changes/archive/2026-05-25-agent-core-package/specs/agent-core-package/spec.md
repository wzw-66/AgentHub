## ADDED Requirements

### Requirement: AgentAdapter 统一接口实现

系统 MUST 提供 `AgentAdapter` 接口的三种具体实现：`ClaudeAdapter`、`OpenCodeAdapter`、`CustomAgentAdapter`。

#### Scenario: ClaudeAdapter 实现 AgentAdapter 接口
- **WHEN** 检查 `ClaudeAdapter` 类定义
- **THEN** 它 MUST 实现 `execute()`、`abort()`、`healthCheck()` 三个方法

#### Scenario: OpenCodeAdapter 实现 AgentAdapter 接口
- **WHEN** 检查 `OpenCodeAdapter` 类定义
- **THEN** 它 MUST 实现 `execute()`、`abort()`、`healthCheck()` 三个方法

#### Scenario: CustomAgentAdapter 实现 AgentAdapter 接口
- **WHEN** 检查 `CustomAgentAdapter` 类定义
- **THEN** 它 MUST 实现 `execute()`、`abort()`、`healthCheck()` 三个方法

### Requirement: ClaudeAdapter 通过 claude CLI 子进程调用

系统 MUST 提供 `ClaudeAdapter`，通过生成 `claude` CLI 子进程与 Claude Code 通信。

#### Scenario: ClaudeAdapter 启动 claude 子进程
- **WHEN** 调用 `execute(context)`
- **THEN** 系统 MUST 使用 `spawn` 启动 `claude` 进程，参数包含 `-p`、`--output-format stream-json`、`--include-partial-messages`

#### Scenario: ClaudeAdapter 流式输出文本 Chunk
- **WHEN** Claude CLI 的 stdout 输出 `stream-json` 事件，其中包含 `content_block_delta` + `text_delta`
- **THEN** Adapter MUST yield 对应的 `Chunk{type: Text}` 对象

#### Scenario: ClaudeAdapter 流式输出完成事件
- **WHEN** Claude CLI 的 stdout 输出 `type: result` 事件（含 `usage` 和 `session_id`）
- **THEN** Adapter MUST yield `Chunk{type: Done}`，metadata 中包含用量信息

#### Scenario: ClaudeAdapter 支持中止
- **WHEN** 调用 `abort()`
- **THEN** 子进程 MUST 收到 `SIGTERM` 信号；5 秒后仍未退出则收到 `SIGKILL`

#### Scenario: ClaudeAdapter 健康检查
- **WHEN** 调用 `healthCheck()`
- **THEN** MUST 执行 `claude --version`，退出码为 0 时返回 `healthy`，否则返回 `unhealthy`

### Requirement: OpenCodeAdapter 通过 opencode CLI 子进程调用

系统 MUST 提供 `OpenCodeAdapter`，通过生成 `opencode` CLI 子进程与 OpenCode 通信。

#### Scenario: OpenCodeAdapter 启动 opencode 子进程
- **WHEN** 调用 `execute(context)`
- **THEN** 系统 MUST 使用 `spawn` 启动 `opencode` 进程，参数包含 `run`、`--format json`、`-m <model>`

#### Scenario: OpenCodeAdapter 解析 NDJSON 文本事件
- **WHEN** OpenCode CLI 的 stdout 输出 `{"type":"text","content":"...","sessionID":"..."}`
- **THEN** Adapter MUST yield `Chunk{type: Text, content: <content>}`

#### Scenario: OpenCodeAdapter 解析 NDJSON tool_use 事件
- **WHEN** OpenCode CLI 的 stdout 输出 `{"type":"tool_use","name":"...","input":{...},"state":{...}}`
- **THEN** Adapter MUST yield `Chunk{type: ToolCall}`，content 包含工具调用的 JSON 序列化

#### Scenario: OpenCodeAdapter 解析 step_finish 事件并结束
- **WHEN** OpenCode CLI 的 stdout 输出 `{"type":"step_finish","tokens":{...},"cost":...}`
- **THEN** Adapter MUST yield `Chunk{type: Done}`，metadata 包含 token 用量和成本

#### Scenario: OpenCodeAdapter 支持中止
- **WHEN** 调用 `abort()`
- **THEN** 子进程 MUST 收到 `SIGTERM` 信号；5 秒后仍未退出则收到 `SIGKILL`

#### Scenario: OpenCodeAdapter 健康检查
- **WHEN** 调用 `healthCheck()`
- **THEN** MUST 执行 `opencode --version`，退出码为 0 时返回 `healthy`，否则返回 `unhealthy`

### Requirement: CustomAgentAdapter 通过 HTTP 调用 LLM 端点

系统 MUST 提供 `CustomAgentAdapter`，通过 HTTP fetch 调用用户配置的 LLM 端点。

#### Scenario: CustomAgentAdapter 发送 OpenAI 格式请求
- **WHEN** 调用 `execute(context)`
- **THEN** 系统 MUST 发送 POST 请求到用户配置的 `endpoint`，请求体为 OpenAI Chat Completions 格式（含 `messages`、`model`、`stream: true`）

#### Scenario: CustomAgentAdapter 使用用户认证信息
- **WHEN** 发送 HTTP 请求
- **THEN** 请求头 MUST 包含 `Authorization: Bearer {apiKey}`

#### Scenario: CustomAgentAdapter 解析 SSE 流
- **WHEN** 收到 SSE `data: {"choices":[{"delta":{"content":"..."}}]}` 行
- **THEN** Adapter MUST yield `Chunk{type: Text, content: <delta content>}`

#### Scenario: CustomAgentAdapter 遇到 HTTP 错误
- **WHEN** HTTP 响应状态码非 2xx
- **THEN** Adapter MUST yield `Chunk{type: Error}` 后接 `Chunk{type: Done}`

#### Scenario: CustomAgentAdapter 支持中止
- **WHEN** 调用 `abort()`
- **THEN** HTTP 请求 MUST 通过 `AbortController` 被取消

#### Scenario: CustomAgentAdapter 健康检查
- **WHEN** 调用 `healthCheck()`
- **THEN** MUST 发送轻量 POST 请求（`max_tokens: 1`），端点响应 2xx 时返回 `healthy`

### Requirement: 工厂函数 createAdapter

系统 MUST 提供 `createAdapter` 工厂函数，按 `AgentProvider` 枚举创建对应的适配器实例。

#### Scenario: 工厂函数创建 ClaudeAdapter
- **WHEN** 调用 `createAdapter(AgentProvider.Claude, config)`
- **THEN** MUST 返回 `ClaudeAdapter` 实例

#### Scenario: 工厂函数创建 OpenCodeAdapter
- **WHEN** 调用 `createAdapter(AgentProvider.OpenCode, config)`
- **THEN** MUST 返回 `OpenCodeAdapter` 实例

#### Scenario: 工厂函数创建 CustomAgentAdapter
- **WHEN** 调用 `createAdapter(AgentProvider.Custom, config)`
- **THEN** MUST 返回 `CustomAgentAdapter` 实例

#### Scenario: 不支持的 provider
- **WHEN** 调用 `createAdapter` 传入不支持的 provider 值
- **THEN** MUST 抛出错误

### Requirement: Chunk 数据块解析工具

系统 MUST 提供一组 Chunk 数据块解析工具函数，处理三种事件流的解析。

#### Scenario: 创建标准 Chunk 对象
- **WHEN** 调用 `createChunk(type, content, metadata?)`
- **THEN** MUST 返回包含 `type`、`content`、`metadata`、`timestamp`（ISO 字符串）的 Chunk 对象

#### Scenario: 解析 Claude stream-json 行
- **WHEN** 调用 `parseClaudeStreamJson(line)`，传入合法的 stream-json 行
- **THEN** MUST 返回对应的 `Chunk` 对象或 `null`（非事件行）

#### Scenario: 解析 OpenCode NDJSON 行
- **WHEN** 调用 `parseOpenCodeEvent(line)`，传入合法的 NDJSON 行
- **THEN** MUST 返回对应的 `Chunk` 对象或 `null`（无法解析的行）

#### Scenario: 解析 OpenAI SSE 行
- **WHEN** 调用 `parseOpenAIStreamEvent(line)`，传入合法的 `data: {...}` SSE 行
- **THEN** MUST 返回对应的 `Chunk` 对象或 `null`（非数据行或 `[DONE]`）

#### Scenario: 判断 Done Chunk
- **WHEN** 调用 `isDoneChunk(chunk)`
- **THEN** Chunk 类型为 `ChunkType.Done` 时返回 `true`，否则返回 `false`
