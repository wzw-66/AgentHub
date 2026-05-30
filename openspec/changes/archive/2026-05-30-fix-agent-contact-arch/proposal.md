## Why

当前 AgentHub 中 `Agent` 和 `Contact` 两张表功能完全重叠。用户创建的 Agent 本身就是"我的联系人"：

- `Agent.creatorId` 标识归属，`Contact.userId` 同样标识归属
- `Contact` 的 `agentId` 是多余的间接层 — 同一个 Agent 目前只有唯一创建者
- 两表各存一份名称/配置类字段，维护成本高

合并后才符合直觉：**Contact = 我的 Agent**，一切围绕 Contact。

而 workspace 路径使用 `process.cwd()` 解析，在 `turbo dev` 下指向 `apps/server/` 而非预期位置。

## What Changes

1. **Agent 表合并进 Contact** — `Agent` 的 `name`、`provider`、`systemPrompt`、`model`、`workspacePath`、`config` 字段直接加入 `Contact` 表，删除 `Agent` 表
2. **Conversation.agentIds → contactIds** — 会话存储的参与者 ID 语义上改为 Contact ID
3. **API 路由统一为 `/api/contacts/`** — 创建/列出 Agent 实际走 Contact 路由
4. **Workspace 路径改为 `__dirname` 解析** — 不再依赖 `process.cwd()`
5. **前端 Agent 列表支持刷新** — `chat-context.tsx` 添加 `refreshAgents()` 方法
6. **AgentMarket 表预留** — 为未来的 agent market/publish 功能准备（当前 schema 不创建）

## Capabilities

### New Capabilities
- `contact-agent-merge`: Agent 和 Contact 表合并，消除冗余
- `agent-list-ownership`: 按用户过滤的 Agent（Contact）列表查询
- `workspace-path-resolve`: 基于 `__dirname` 的稳定工作区路径解析机制

### Modified Capabilities
无 — 这是结构性重构，不修改外部 API 契约（前端路径改为 `/api/contacts/` 但功能等价）

## Impact

- **packages/db/prisma/schema.prisma**: 删除 Agent 模型，Contact 增加 name/provider/systemPrompt/model/workspacePath/config 字段，Conversation.agentIds 重命名为 contactIds
- **packages/db/src/repositories/**: 删除 `agent.ts`，增强 `contact.ts`，更新 `conversation.ts`
- **packages/shared/src/types/**: 更新 Contact 类型（合并 Agent 字段），Conversation 类型 agentIds → contactIds
- **apps/server/src/routes/**: agents.ts 逻辑合并入 contacts.ts，messages.ts 不再引用 Agent，conversations.ts 用 contactIds
- **apps/web/lib/chat-context.tsx**: API 路径改为 `/api/contacts/`，contactIds
- **packages/db/prisma/seed.ts**: Contact 代替 Agent
