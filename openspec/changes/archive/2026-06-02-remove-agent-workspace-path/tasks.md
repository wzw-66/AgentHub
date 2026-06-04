## 1. Server: contacts.ts — 移除 Agent 工作目录创建

- [x] 1.1 删除 `contacts.ts` 中的 `workspacePath` 变量构建（`safeEmail`、`safeName`、`workspacePath` 相关代码）
- [x] 1.2 删除 `mkdir` 调用及其错误处理
- [x] 1.3 从 `dbCreateContact` 参数中移除 `workspacePath` 字段
- [x] 1.4 清理不再需要的 import（`mkdir`、`resolve`、`SERVER_ROOT`）

## 2. Server: messages.ts — 移除 agent.workspacePath fallback

- [x] 2.1 `runAgentExecution` 中第一处 cwd 解析（约第 423-427 行）去掉 `agent.workspacePath` fallback
- [x] 2.2 第二处 cwd 解析（约第 588-592 行）去掉 `agent.workspacePath` fallback

## 3. Server: executor.ts — 移除 agent.workspacePath fallback

- [x] 3.1 `resolveWorkspace()` 去掉 `agent` 参数和 `agent.workspacePath` fallback
- [x] 3.2 更新 `execute()` 中对 `this.resolveWorkspace(subtask, agent)` 的调用，改为 `this.resolveWorkspace(subtask)`

## 4. Server: conversations.ts — 删除对话时清理工作目录

- [x] 4.1 `handleDelete` 中先通过 `existing.workspacePath` 拿到目录路径
- [x] 4.2 调用 `rm(resolve(WORKSPACE_ROOT, existing.workspacePath), { recursive: true, force: true })` 删除磁盘目录
- [x] 4.3 引入 `rm` import（来自 `node:fs/promises`）和 `resolve` + `WORKSPACE_ROOT`

## 5. Web: CreateAgentModal — 移除工作区路径预览

- [x] 5.1 移除 `CreateAgentModal.tsx` 中的 `safeEmail`、`safeName`、`workspacePreview` 变量计算
- [x] 5.2 移除 UI 中工作区路径的渲染代码
