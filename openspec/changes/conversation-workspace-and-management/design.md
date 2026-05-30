## Context

当前 Conversation 创建时只写数据库，不创建磁盘工作目录。AI Agent 执行时使用 Contact 的 workspacePath 作为 `cwd`，这意味着同一 Agent 的所有会话共享同一个工作目录，无法隔离不同会话的工作文件。

前端 SSE 流式响应存在监听事件不匹配问题：服务器发送命名事件（`event: chunk`），但客户端监听泛型 `message` 事件，且数据结构不匹配，导致 AI 输出完全无法在前端展示。

UI 层面缺少 Conversation 和 Contact 的删除操作入口。

## Goals / Non-Goals

**Goals:**
- 创建会话时自动建立 `agent-workspace/{email}/conversations/{id}/` 工作目录
- Conversation 记录存储 `workspacePath`，替代 Contact 级别的 workspacePath 作为 AI 执行的工作目录
- 修复 SSE 事件监听，使 AI 流式输出正常显示
- 在 Sidebar 添加会话删除功能
- 在 Contact 列表页和 Agent 详情页完善删除功能

**Non-Goals:**
- 不涉及多用户共享 workspace
- 不修改 AI 适配器本身的执行逻辑
- 不涉及文件上传/下载等文件管理功能
- 不修改 WebSocket 连接管理

## Decisions

### Decision 1: Conversation model 新增 workspacePath 字段
- **选择**: 在 Prisma `Conversation` model 添加可选的 `workspacePath String?` 字段
- **理由**: 与 Contact 的 workspacePath 模式一致，保持数据模型统一。ConversationRepository 只需少量修改
- **替代方案**: 运行时动态拼接路径（无持久化）— 不选因为 AI 执行时路径信息不稳定，且无法在重启后恢复

### Decision 2: 创建会话时同步创建目录
- **选择**: 在 `handleCreate` 中使用 `fs.mkdir({ recursive: true })` 同步创建目录，失败则返回 500
- **理由**: 目录创建是会话创建的核心流程，异步或重试模式会增加复杂度
- **替代方案**: 目录按需延迟创建（第一次执行 AI 时创建）— 不选因为路径信息需要提前写入数据库

### Decision 3: runAgentExecution 改用 conversation.workspacePath
- **选择**: 优先使用 `conversation.workspacePath`，fallback 到 `agent.workspacePath`，再 fallback 到 `undefined`
- **理由**: 向后兼容已有数据（旧 Conversation 没有 workspacePath）。新会话自动获得 per-conversation workspace
- **替代方案**: 完全移除 agent.workspacePath 的 cwd 逻辑 — 破坏现有功能

### Decision 4: SSE 事件监听修复方案
- **选择**: 移除泛型 `"message"` 监听器，改用 `es.addEventListener("chunk/done/error")` 分别监听
- **理由**: 严格遵循 EventSource 规范，精确匹配服务端事件类型
- **替代方案**: 服务端改为发送无命名事件 — 但服务端其他事件类型也需要命名区分，改服务端影响更大

### Decision 5: 删除 Conversation 的级联清理
- **选择**: 删除对话时不清除磁盘 workspace 目录（仅删除数据库记录）
- **理由**: 用户可能误删后需要恢复工作区文件；磁盘清理可以后续由管理脚本处理
- **替代方案**: 级联删除磁盘目录 — 数据永久丢失风险大

### Decision 6: 删除 Contact 的处理
- **选择**: Contact 是独立的数据库记录，删除时仅删除 Contact 本身，不级联删除关联的 Conversation
- **理由**: Prisma schema 中 Conversation 的 `contactIds` 是 `String[]` 而非外键关联，删除 Contact 不会影响已有会话记录。用户可能仍需要查看历史会话
- **替代方案**: 级联删除所有关联 Conversation — 可能丢失有价值的对话记录

## Risks / Trade-offs

- [旧 Conversation 缺少 workspacePath] → runAgentExecution 保留 fallback 逻辑，使用 agent.workspacePath 或 undefined
- [SSE 修复可能引入新的连接问题] → 保留重连机制和错误日志，方便调试
- [删除 Contact 后，会话列表中的 @mention 可能显示已删除的名称] → 存储层面保留 conversation.contactIds 中的 ID 字符串，渲染时按 ID 查找 contact 名称，找不到则显示 "Deleted Agent"
