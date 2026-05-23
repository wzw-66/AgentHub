## 新增需求

### 需求：AgentAdapter 抽象接口
`agent-core` 包应定义一个抽象的 `AgentAdapter` 接口，用于所有 Agent 实现。

#### 场景：Execute 方法已定义
- **当** 在 AgentAdapter 上调用 `execute()`
- **则** 应返回一个 `AsyncIterable<Chunk>` 用于流式输出

#### 场景：Abort 方法已定义
- **当** 在 AgentAdapter 上调用 `abort()`
- **则** 任何正在执行的请求应被取消

#### 场景：HealthCheck 方法已定义
- **当** 在 AgentAdapter 上调用 `healthCheck()`
- **则** 应返回 `{ available: boolean, latency: number }`

### 需求：Claude API 适配器
系统应提供一个 `ClaudeAdapter`，通过 Anthropic HTTP SSE API 与 Claude 通信。

#### 场景：Claude 适配器已存在
- **当** 列出可用适配器
- **则** 应存在一个实现 `AgentAdapter` 的 `ClaudeAdapter`

#### 场景：Claude 适配器流式输出数据块
- **当** Claude API 返回流式响应
- **则** 数据块应以 `type: 'text'` 的 `Chunk` 对象形式发出

### 需求：OpenCode CLI 适配器
系统应提供一个 `OpenCodeAdapter`，通过生成 OpenCode CLI 子进程运行。

#### 场景：OpenCode 适配器已存在
- **当** 列出可用适配器
- **则** 应存在一个实现 `AgentAdapter` 的 `OpenCodeAdapter`

#### 场景：OpenCode 解析标准输出
- **当** OpenCode CLI 写入标准输出
- **则** 输出应逐行解析为 `Chunk` 对象

### 需求：自定义 Agent 适配器
系统应提供一个 `CustomAgentAdapter`，用于用户配置的 LLM 端点。

#### 场景：自定义适配器已存在
- **当** 列出可用适配器
- **则** 应存在一个实现 `AgentAdapter` 的 `CustomAgentAdapter`

#### 场景：自定义适配器使用用户配置
- **当** 执行自定义 Agent
- **则** 应使用用户提供的端点 URL 和 API 密钥

### 需求：Agent 工厂函数
系统应提供一个工厂函数，按提供商类型创建适配器。

#### 场景：工厂创建正确的适配器
- **当** 调用 `createAdapter('claude', config)`
- **则** 应返回一个 `ClaudeAdapter` 实例
- **当** 调用 `createAdapter('opencode', config)`
- **则** 应返回一个 `OpenCodeAdapter` 实例
- **当** 调用 `createAdapter('custom', config)`
- **则** 应返回一个 `CustomAgentAdapter` 实例
