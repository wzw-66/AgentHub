## Why

当前 AgentHub 的 Agent 执行是纯单向的：用户发消息 → Agent 执行 → 流式返回结果。Agent 无法在执行过程中向用户反问、给出选项、或请求确认。这限制了多 Agent 协作平台的核心体验——真正的对话应该是双向的。Claude Code CLI 原生支持 `AskUserQuestion` 工具，实验已验证该工具可用，但当前架构未利用此能力。

## What Changes

- **新增 `ChunkType.Interactive`**：在 shared 包的 ChunkType 枚举中增加交互类型，用于表示 Agent 需要用户输入的场景
- **ClaudeAdapter 保持 stdin 打开**：不再调用 `this.process.stdin?.end()`，允许在 Agent 执行过程中写入回复
- **AgentHarness 新增交互拦截**：检测 `AskUserQuestion` 类型的 ToolCall，暂停执行、等待用户回复、将回复写入 stdin 后继续
- **ConnectionManager 新增 pending interaction 机制**：维护挂起的交互请求 Map，支持超时和取消
- **WebSocket 新增 `user:interact` 入站消息类型**：接收前端的交互回复
- **新增 `POST /api/conversations/:id/interact/respond` REST 端点**：作为 WebSocket 的备选通道
- **前端 ChatContext 新增交互状态**：渲染交互 UI（按钮组、确认框、输入框），收集用户选择后发送回服务器
- **实验确认**：不加 `--input-format stream-json`，保持普通 stdin 文本输入即可工作。AskUserQuestion 以标准 `tool_use` 形式输出

## Capabilities

### New Capabilities

- `agent-interactive-execution`: Agent 执行过程中的双向交互——Agent 可以反问问题、提供选项（A/B/C）、请求确认，用户回复后 Agent 继续执行

### Modified Capabilities

- (无变更：现有 capabilities 的 requirement 不变)

## Impact

- **packages/shared**: 新增 `ChunkType.Interactive` 枚举值
- **packages/agent-core**: ClaudeAdapter 保留 stdin 流；AgentHarness 新增交互拦截逻辑
- **apps/server**: ConnectionManager 新增 pendingInteraction；messages.ts 中 runAgentExecution 新增交互处理；ws.ts 新增 `user:interact` handler；新增 REST 端点
- **apps/web**: ChatContext 新增 pendingInteraction 状态；ChatPanel 新增交互 UI 卡片
- **不涉及**：db、ui 组件库、intent-analyzer/dispatcher/aggregator 等编排层（交互只在单 Agent 执行路径生效，编排层暂不涉及）
