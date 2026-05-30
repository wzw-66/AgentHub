## Context

Agent创建功能目前存在多条未对齐的问题：Provider 枚举值在前后端三套不同（Prisma PascalCase / Shared 小写 / Server PascalCase），导致创建请求被 400 拒绝；Agent 模型缺少 creatorId，无法查询"用户创建了哪些 agent"；Conversation 模型使用 `contactIds` 但实际存储的是 agent ID，语义混乱；消息执行链路无法正确定位目标 agent；缺少工作区目录机制。

前端 CreateAgentModal 目前硬编码 `provider: "custom"` 和 `model: "gpt-4"`，不符合"只连接后端内部 Claude Code 和 OpenCode" 的实际需求。

本次设计覆盖从数据模型 → API → 前端表单 → 工作区目录 → 消息执行的全链路修正。

## Goals / Non-Goals

**Goals:**
- Provider 枚举统一为 PascalCase（匹配 Prisma），adapter factory 内部 normalize
- Agent 模型增加 `creatorId` 和 `workspacePath`，User 增加 `agents` 反向关系
- Conversation 模型 `contactIds` 改名为 `agentIds`
- 重新设计创建 Agent 表单：三段式 provider 选择（Claude Code / OpenCode / Custom），Custom 才显示 URL/Key/Model
- 创建 Agent 时自动在 `agent-workspace/{email}/{name}/` 创建目录
- 单 agent 会话的消息正确路由到目标 agent，并传递 workspace 作为 cwd
- Conversation type `"Single"/"Group"` 统一为 `"single"/"group"`

**Non-Goals:**
- 不涉及多 agent 编排（orchestrator）的改造（当前逻辑保留），仅修复单 agent 执行
- 不涉及前端 contacts/agent-market 页面的 UI 改造（仅 CreateAgentModal 改版）
- 不涉及 SSE/WS 实时通信层的改动
- 不涉及 seed 数据变更

## Decisions

### Decision 1: Provider 枚举统一方案

选择 PascalCase（匹配 Prisma），因为 Prisma enum 是 schema 的事实标准，且 DB 层不应被应用层命名风格牵着走。

```
Shared enum:     Claude = "Claude"    OpenCode = "OpenCode"    Custom = "Custom"
Server validate: ["Claude", "OpenCode", "Custom"]
Adapter factory: switch → toLowerCase() 保持内部归一
Frontend:        发送 "Claude" | "OpenCode" | "Custom"
```

Adapter factory 加一行 normalize 做防御：

```typescript
const normalized = String(provider).toLowerCase();
switch (normalized) {
  case "claude": ...
  case "opencode": ...
  case "custom": ...
}
```

这样即使未来有人传小写，也能正常工作。

**Alternatives considered:**
- 全小写（Shared 现状）：需要改 Prisma enum 和 DB migration，改动更大且 Prisma 生成的 TS 类型也需手动 map
- 保持三套：复杂度持续累积，每次新增 provider 都要注意三处同步

### Decision 2: CreatorId 直接关联 User

```prisma
model User {
  agents Agent[]  // 新增
}

model Agent {
  creatorId  String   // 新增，必填
  creator    User     @relation(fields: [creatorId], references: [id], onDelete: Cascade)
}
```

Cascade delete：用户注销时，其创建的 agent 自动级联删除。

**为什么不在 Contact 上加 isCreator 标记？** Contact 是"用户将哪些 agent 添加为联系人"，与"用户创建了哪些 agent"是两件不同的事。用 CreatorId 语义清晰，查询直接，无需 JOIN Contact。

### Decision 3: Conversation.contactIds → agentIds

当前 `contactIds` 字段实际存储的是 agent ID（前端传 `[agentId]`），改名消除语义歧义。

```prisma
model Conversation {
  agentIds String[]  // 原 contactIds
}
```

消息执行时直接通过 `agentIds[0]` 查询 Agent 记录，不绕 Contact 表。

### Decision 4: 工作区目录由 Server 创建

Agent 创建时 Server 端同步创建目录：

```typescript
// handler 中
const user = await getUser(request.userId!);
const safeEmail = user.email.replace(/[^a-zA-Z0-9@.-]/g, "_");
const safeName = body.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_");
const workspacePath = `agent-workspace/${safeEmail}/${safeName}`;
const fullPath = resolve(process.cwd(), workspacePath);
await mkdir(fullPath, { recursive: true });
```

- 路径存到 `Agent.workspacePath`
- 不创建 `.workspace` 标记文件（已确认不需要）
- 项目根路径取 `process.cwd()`（dev/start 均在项目根执行）

### Decision 5: 消息执行路由修复

`runAgentExecution` 修正逻辑：

```typescript
if (conv.type === "Single") {
  const agentId = conv.agentIds[0];
  const agent = await getAgent(agentId);
  if (!agent) return;

  const cwd = agent.workspacePath
    ? resolve(process.cwd(), agent.workspacePath)
    : undefined;

  const provider = agent.provider; // "Claude" | "OpenCode"
  const adapter = createAdapter(provider, { cwd });

  for await (const chunk of adapter.execute({...})) {
    pushChunk(cm, conversationId, chunk);
  }
}
```

### Decision 6: 表单 UI 三段式 Provider 选择

CreateAgentModal 重新设计为：

| Provider | 显示字段 |
|----------|---------|
| Claude Code | 名称 + 系统提示词 |
| OpenCode | 名称 + 系统提示词 |
| Custom | 名称 + 系统提示词 + Provider名称 + API URL + API Key + 模型 |

Provider 用 Segmented Control（三段切换），切换时动态隐藏/显示对应的字段区域。

## Risks / Trade-offs

- **[CreatorId 级联删除]** 用户注销会删除其创建的所有 agent → 影响其他将该 agent 加为联系人的用户。**Mitigation:** 当前阶段 agent 只有创建者可用，尚未支持 agent 共享/市场分发，接受此行为
- **[workspacePath 文件系统操作]** 文件系统写入可能失败（权限不足、磁盘满）→ 创建 Agent 失败。**Mitigation:** handler 捕获 mkdir 错误，返回 500 + 错误信息
- **[agentIds 改名]** 现有 database 中 `contactIds` 字段会被 Prisma migration 处理。**Mitigation:** 开发阶段无生产数据，直接 rename 即可
- **[Provider enum 值变更]** 共享 enum 值从 `"claude"` 改为 `"Claude"`，影响所有引用到 enum 字面量的代码。**Mitigation:** 类型系统会标记编译错误，逐处修正
