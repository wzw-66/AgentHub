## Context

当前 Agent 和 Contact 两表功能重叠。Agent 存 AI 配置（name, provider, systemPrompt, model, config），Contact 存用户关联（userId, agentId, displayName, tags, isPinned）。每个 Agent 目前只有唯一创建者，Contact 的 `agentId` 是多余的间接层。

合并方案：Contact 吸收 Agent 的全部字段，删除 Agent 表。Contact 直接代表"我的 Agent"。

Workspace 路径问题：`process.cwd()` 在 `turbo dev` 下指向 `apps/server/` 而非仓库根目录。

## Goals / Non-Goals

**Goals:**
- Agent 表合并进 Contact，消除冗余
- Conversation.agentIds → contactIds
- API 路由统一为 `/api/contacts/`
- Workspace 路径改用 `__dirname` 固定解析
- 前端 Agent 列表支持手动刷新
- AgentMarket 表预留

**Non-Goals:**
- 不改变 `SenderType.Contact` 枚举值（Messsage 的发送者类型语义不变）
- 不改变 agent-core 层的 `Agent` 抽象类型（adapter 的 Agent = AI agent 的概念，不绑定 DB）
- 不涉及 agent market 功能（仅预留表名）
- 不删除旧数据迁移脚本（force-reset 后 seed 重建）

## Decisions

### D1: Agent 合并进 Contact

**方案：** Contact 表新增 Agent 的所有字段，删除 Agent 表。

**合并后的 Contact 模型：**
```
Contact
├── id          (原)
├── userId      (原 — 创建者/拥有者)
├── name        (新增 — 从 Agent)
├── avatarUrl   (新增 — 从 Agent)
├── provider    (新增 — 从 Agent, Claude|OpenCode|Custom)
├── systemPrompt (新增 — 从 Agent)
├── model       (新增 — 从 Agent)
├── workspacePath (新增 — 从 Agent)
├── config      (新增 — 从 Agent, JSON)
├── displayName (原 — 用户别名, optional)
├── tags        (原)
├── isPinned    (原)
├── createdAt   (原)
├── updatedAt   (原)
```

`@@unique([userId, agentId])` 约束删除（不再有 agentId 字段）。

**替代方案对比：**
| 方案 | 优点 | 缺点 |
|------|------|------|
| **Agent 合并进 Contact（选定）** | 单表，无冗余，语义清晰 | 迁移量大 |
| 保留两表，业务只走 Agent | 改动小 | 冗余长期存在 |
| 反着来，Agent 吸收 Contact | 保留 Agent 名称 | 未来市场时语义别扭 |

### D2: Conversation.contactIds

**方案：** `Conversation.agentIds` 重命名为 `contactIds`，存储的是 Contact 记录的 ID。

```
Conversation
├── contactIds String[]   // 参与者 Contact ID 列表
```

**理由：** 现在 Agent 表已不存在，会话参与者本质上是 Contact。名称跟随数据语义。

### D3: API 路由统一为 `/api/contacts/`

**方案：** 原 `/api/agents/create` → `/api/contacts/create`，原 `/api/agents/list` → `/api/contacts/list`。服务器端不再有 agents 路由模块，所有逻辑在 contacts 路由中完成。

前端相应更新 API 调用路径。

### D4: 用 `__dirname` 固定 workspace 路径

**方案：** 通过 `import.meta.url` 获取 `apps/server/src/` 的绝对路径，然后 `path.resolve(__dirname, "..")` 得到 `apps/server/`，以此为基础解析 workspace 路径。DB 仍存相对路径以保证可移植性。

参见 `openspec/changes/agent-creation-workspace/` 的已有设计。

### D5: Agent 抽象类型保留

`packages/shared/src/types/agent.ts` 的 `Agent` 接口保留不变。这是 agent-core 层使用的抽象概念（代表一个 AI 助手的配置），与数据库模型解耦。合并后服务器路由在需要传给 adapter 时，从 Contact 记录构造 Agent 对象即可。

### D6: 前端 AgentInfo 改为 ContactInfo

前端 `chat-context.tsx` 中的 `AgentInfo` 接口改名为 `ContactInfo`（可选），API 调用路径改为 `/api/contacts/`。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 大范围重构引入回归 | 更新所有测试，优先跑通 |
| 前端 `SenderType.Contact` 语义混淆 | 保留枚举值，Contact = 我的 Agent 即正确语义 |
| AgentMarket 发布的是 Contact 而非 Agent，需设计新表 | 暂不创建 AgentMarket 表，仅预留概念 |
