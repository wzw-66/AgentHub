## Why

当前聊天系统有 5 个体验问题：单聊重复创建（每次 Start Chat 都新建）、单聊和群聊在 UI 上无区分、SSE 流因 CORS 配置缺失导致连接失败且 agentIds 参数名不对导致消息发送后无响应、已发送消息无法编辑或删除、用户创建的 Agent 无法修改。这些问题影响核心聊天流程的完整性和可用性。

## What Changes

- **单聊去重**：点击 Start Chat 时先查是否已有同 agent 的活跃单聊，有则复用，无则新建
- **群聊创建入口**：Sidebar New Chat 面板增加单聊/群聊模式切换，群聊模式支持多选 agent
- **单聊/群聊视觉区分**：Sidebar 列表和 ChatPanel 头部增加图标和标签区分
- **SSE CORS 修复**：SSE endpoint 的 `writeHead` 补上 `Access-Control-Allow-Origin` 头
- **agentIds 参数修复**：Agent 详情页 Start Chat 发送 `contactIds` 而非 `agentIds`（后端期望 `contactIds`）
- **消息编辑/删除**：最后一条用户消息支持 hover 出现编辑和删除按钮，编辑态切换到 textarea
- **Agent 编辑**：Agent 详情页增加 Edit 按钮，弹窗编辑 name 和 systemPrompt，provider 只读展示

## Capabilities

### New Capabilities
- `single-conversation-dedup`: 单聊查重复用——Start Chat 时查找已有单聊避免重复创建
- `message-edit`: 消息编辑与删除——最后一条用户消息可 hover 编辑/删除
- `agent-edit`: Agent 编辑——编辑已创建 Agent 的 name 和 systemPrompt

### Modified Capabilities
- `chat-ui`: 新增群聊创建模式（多选 agent）、单聊/群聊列表视觉区分、SSE 连接 CORS 修复

## Impact

- **packages/db**: 新增 `findSingleConversationByAgentId` 查询、`updateMessage` 函数
- **apps/server**: SSE 路由加 CORS 头；消息路由加 `PATCH /:messageId/update` 和 `DELETE /:messageId/delete`；会话路由加 `GET /find-by-agent/:agentId`
- **apps/web**: Sidebar 新聊天弹窗加群聊模式；Agent 详情页加 Edit 按钮；CreateAgentModal 改造为可复用的编辑模式；ChatPanel 增加消息 hover 操作菜单和编辑态；Agent 详情页 Start Chat 修正 `agentIds` → `contactIds`
- **packages/shared**: 无变更
- **packages/agent-core**: 无变更
