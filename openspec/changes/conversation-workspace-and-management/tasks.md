## 1. Conversation Workspace — 数据模型与后端

- [x] 1.1 Prisma: Conversation model 添加 `workspacePath String?` 字段，执行 `db:push`
- [x] 1.2 Conversation Repository: `CreateConversationInput` 增加 `workspacePath` 字段
- [x] 1.3 Conversation Routes: `handleCreate` 中获取 user email，创建 `agent-workspace/{email}/conversations/{id}/` 目录，存入 workspacePath
- [x] 1.4 Message Routes: `runAgentExecution` 优先使用 `conversation.workspacePath` 作为 `cwd`，fallback 到 `agent.workspacePath`

## 2. SSE 事件监听修复（Bug 修复）

- [x] 2.1 `useSSEStream.ts`: 将 `addEventListener("message", ...)` 拆分为 `"chunk"`, `"done"`, `"error"` 三个命名事件监听器
- [x] 2.2 `useSSEStream.ts`: 调整 handleEvent 数据解析逻辑匹配服务端实际数据格式（服务端 chunk 事件 data 包含 `{ type, content, timestamp }`，客户端需根据 ChunkType 渲染）
- [ ] 2.3 验证 SSE 流式输出在前端 ChatPanel 中正常渲染

## 3. 删除 Conversation UI

- [x] 3.1 `Sidebar.tsx`: 在会话列表每个 item 的 hover 状态添加删除按钮（trash icon）
- [x] 3.2 `Sidebar.tsx`: 实现删除确认弹窗 inline（"Confirm?" + Delete/Cancel 按钮）
- [x] 3.3 `Sidebar.tsx`: 删除后自动切换活跃会话（如果删除的是当前会话，跳转到空状态）

## 4. 删除 Contact UI

- [x] 4.1 Agent 详情页 (`apps/web/app/(market)/agents/[id]/page.tsx`): 添加删除按钮 + 确认弹窗，删除后跳转到 agent 列表页
- [ ] 4.2 验证 `/agents/contacts/` 页面的删除功能是否正常（已有实现，需确认可用性）

## 5. 验证与测试

- [ ] 5.1 验证创建单聊会话时 workspace 目录正确创建
- [ ] 5.2 验证创建群聊会话时 workspace 目录正确创建
- [ ] 5.3 验证 AI 执行时使用 conversation workspacePath 作为 cwd
- [ ] 5.4 验证 SSE 连接和 AI 流式输出在前端正常显示
- [ ] 5.5 验证会话删除前后端交互完整流程
- [ ] 5.6 验证 Contact 删除前后端交互完整流程
