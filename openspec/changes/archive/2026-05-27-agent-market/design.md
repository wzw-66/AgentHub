## Context

AgentHub 聊天界面（Module 10）已完成三栏 IM 布局、消息收发、SSE/WS 实时通信集成。当前 Sidebar 已内置新建聊天的 Agent 选择弹窗，RightPanel 有 Agent 详情占位但为空壳。后端 API（`/api/agents/*`、`/api/contacts/*`）和数据库层已全部就绪。

Module 11 在此基础之上，为 Web 前端增加完整的 Agent 浏览、创建和联系人管理功能。由于后端和 UI 组件库已到位，本模块工作范围集中在前端页面和交互上。

## Goals / Non-Goals

**Goals:**
- 用户可以在 `/agents` 浏览所有可用 Agent（内置 + 自定义），内置 Agent 优先显示
- 用户可以查看 Agent 详情并一键开始聊天
- 用户可以创建自定义 Agent（名称、系统提示词、模型）
- 用户可以将 Agent 加为联系人、编辑显示名称、置顶/取消置顶
- 用户可以从聊天界面直接导航到 Agent 市场
- 聊天界面的 RightPanel Agent 详插件展示真实内容

**Non-Goals:**
- 不涉及后端 API 修改（现有路由完全满足需求）
- 不实现 Agent 编辑/删除功能（后期可加）
- 不实现 Agent 分类/标签筛选
- 不实现 Agent 搜索（后期可加）
- 不实现联系人分组
- 不涉及桌面端（Module 12 范围）

## Decisions

### Decision 1: Agent 市场作为独立路由群组 (`/(market)/`)

```
apps/web/app/
├── (auth)/          # 登录/注册（已有）
├── (chat)/          # 聊天界面（已有）
└── (market)/        # Agent 市场（新增）
    ├── layout.tsx
    └── agents/
        ├── page.tsx          # /agents
        └── [id]/page.tsx     # /agents/:id
```

**Why**: Next.js App Router 的路由群组隔离布局、互不干扰。`(market)` 共享 AuthGuard layout，无需重复实现认证逻辑。

### Decision 2: 联系人管理采用独立页面而非侧边栏内嵌

联系人管理功能放在 `/(market)/agents/contacts/page.tsx`，通过 Agent 列表页的导航入口进入。

**Alternatives considered:**
- 在 Sidebar 内嵌联系人列表 — Sidebar 已承载会话列表和新聊天弹窗，再加入联系人管理会使组件过于臃肿
- Modal 弹窗 —— 适合简单操作，但编辑名称、置顶切换等交互不适合弹窗

**Why**: 独立页面职责清晰，与 Agent 列表/详情页同级，导航路径统一。RightPanel 的 Agent 详情后续也可以展示联系人操作入口。

### Decision 3: 创建 Agent 使用 Modal 弹窗而非独立页面

自定义 Agent 创建表单使用 Modal（弹窗）在 Agent 列表页上层展示。

**Why**: 创建 Agent 是一个临时操作，用户填写表单→提交→回到列表看到新 Agent。使用 Modal 避免页面跳转，交互更流畅。创建完成后自动关闭 Modal 并刷新列表。

### Decision 4: 复用 ChatContext 已有的 conversations/agents 状态

Agent 详情页的"开始聊天"操作复用 ChatContext 的 `createConversation` 方法。Agent 列表数据复用 ChatContext 已有的 `agents` 状态或直接调用 API。

**Why**: ChatContext 已在 chat layout 层提供 Provider，Agent 市场页面作为独立路由群组需要额外包裹或通过 api-client 直接调用。采用直接调用 api-client 方式，避免跨 Provider 依赖。

### Decision 5: 联系人数据独立获取，不混入 ChatContext

联系人管理使用独立的数据获取逻辑（直接在联系人页面组件中调用 `api.get('/api/contacts/list')`），不向 ChatContext 注入联系人状态。

**Why**: 联系人数据只在 Agent 市场和 RightPanel 中使用，不涉及聊天核心流程。独立获取保持关注点分离，避免 ChatContext 膨胀。

## Risks / Trade-offs

- [跨路由群组状态不一致] → Agent 市场页添加联系人后，聊天侧边栏不感知。**Mitigation**: 影响很小——联系人变更主要在 Agent 市场页面操作，聊天界面只需在"新建聊天"弹窗时重新加载 Agent 列表即可。
- [RightPanel 与详情页内容重复] → Agent 详情页和 RightPanel 都展示 Agent 详情，可能导致代码重复。**Mitigation**: 提取 AgentDetailContent 为共享组件，详情页和 RightPanel 共同引用。
- [自定义 Agent 缺少验证] → 用户可能输入无效的系统提示词或模型名。**Mitigation**: 表单前端验证（名称非空、提示词长度限制），后端已有输入验证。
- [导航路径增加] → 新增加 `/agents`、`/agents/:id` 、`/agents/contacts` 三条路由。**Mitigation**: 路由结构清晰，`(market)` 群组内所有路径以 `/agents` 为前缀，易于扩展。
