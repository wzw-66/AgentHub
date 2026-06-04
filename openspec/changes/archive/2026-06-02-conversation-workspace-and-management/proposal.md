## Why

当前项目存在两个 Bug 和两个缺失的管理功能：(1) 创建会话时没有在磁盘上建立对应的工作目录，导致 AI Agent 没有可操作的工作区；(2) 前端 SSE 事件监听与服务器端事件命名不匹配，导致 AI 流式输出无法显示在会话中。同时，用户缺少删除 Contact 和删除 Conversation 的基本管理功能。

## What Changes

1. **Conversation 工作目录创建** — 创建会话时，在 `agent-workspace/{email}/conversations/{id}/` 建立目录，并将路径存入 Conversation 记录；`runAgentExecution` 中使用该路径作为 `cwd`
2. **修复 SSE 事件监听 Bug** — 修复 `useSSEStream.ts` 中 EventSource 监听器未正确匹配服务器端命名事件的问题，使 AI 输出能在前端正常显示
3. **删除 Conversation UI** — 在 Sidebar 会话列表中添加删除按钮（含确认弹窗）
4. **删除 Contact UI** — 在 Contact 列表页和 Agent 详情页添加删除按钮

## Capabilities

### New Capabilities
- `conversation-workspace`: 会话级别的工作目录管理，包括目录创建、路径存储、AI 执行时的工作目录解析
- `conversation-delete`: 侧边栏会话列表的删除操作，包含确认弹窗和前端状态更新
- `contact-delete`: Contact 列表页和 Agent 详情页的删除操作，包含确认弹窗和级联清理

### Modified Capabilities
<!-- 无现有 capability 变更 -->

## Impact

- **packages/db/prisma/schema.prisma**: Conversation model 新增 `workspacePath` 字段
- **packages/db/src/repositories/conversation.ts**: CreateConversationInput 增加 `workspacePath`
- **apps/server/src/routes/conversations.ts**: handleCreate 增加目录创建逻辑
- **apps/server/src/routes/messages.ts**: runAgentExecution 改为使用 conversation.workspacePath
- **apps/web/hooks/useSSEStream.ts**: 修复 SSE 事件监听逻辑（重大 Bug 修复）
- **apps/web/components/Sidebar.tsx**: 添加会话删除功能
- **apps/web/app/(market)/agents/contacts/page.tsx**: Contact 列表页已有删除，需确认是否需要补充
- **apps/web/app/(market)/agents/[id]/page.tsx**: Agent 详情页添加删除按钮
