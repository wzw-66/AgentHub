## Why

Agent 级别的 `workspacePath`（`agent-workspace/{邮箱}/{Agent名}/`）在创建 Agent 时生成目录，但运行时无论是单聊还是群聊都优先使用 Conversation 级别的 `workspacePath`（`agent-workspace/{邮箱}/conversations/{对话ID}/`）。Agent 级别的 workspacePath 实际上永远不会被用到，属于死代码。

## What Changes

- **删除** Agent 创建时的工作目录生成逻辑（`contacts.ts` 中的 `mkdir` 和 `workspacePath` 设置）
- **删除** `messages.ts` 中两处 `agent.workspacePath` 回退逻辑
- **删除** `executor.ts` 中 `resolveWorkspace()` 的 `agent.workspacePath` 回退逻辑
- **删除** 前端 `CreateAgentModal.tsx` 中的工作区路径预览
- **保留** DB 字段 `Contact.workspacePath` 和类型定义（向后兼容，不破坏已有数据）
- **保留** Conversation 级别的工作目录创建逻辑（`conversations.ts`）

## Capabilities

### New Capabilities

无新 capability。

### Modified Capabilities

无现有 capability 变更（此改动仅为实现层清理，不影响功能规约）。

## Impact

- `apps/server/src/routes/contacts.ts` — 移除 workspacePath 生成和 mkdir
- `apps/server/src/routes/messages.ts` — 两处 cwd 解析去掉 agent.workspacePath fallback
- `apps/server/src/orchestrator/executor.ts` — resolveWorkspace 去掉 agent 参数和 fallback
- `apps/web/components/CreateAgentModal.tsx` — 移除工作区路径预览 UI
