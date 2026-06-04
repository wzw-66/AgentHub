## Context

AgentHub 当前已有完整的 Agent 管理体系：`Contact` 模型承载 Agent 概念，用户可以在前端创建/编辑/删除自定义 Agent，并将 Agent 添加为联系人进行聊天。后端 contacts CRUD 路由、`RightPanel` Agent 详情展示、Sidebar Agent 导航均已实现。

本功能在此基础上增加 Agent 配置的发布和导入能力。核心思路是新增一个 `PublishedAgent` 模型，与现有 `Contact` 模型解耦 —— 发布时拍 snapshot，导入时克隆配置创建新 `Contact`。这样发布者修改/删除原始 Agent 不影响已发布的 listing，已导入的用户也不受源下架影响。

## Goals / Non-Goals

**Goals:**
- 用户可以从 Agent 详情页将 Agent 发布到市场，填写描述和标签
- 所有已发布的 Agent 在市场中可见，支持按名称/Provider/标签搜索
- 用户可以浏览市场列表和查看发布详情
- 用户可以一键将市场上的 Agent 配置导入为自己的联系人
- 发布者可以在"我的发布"列表中管理和下架自己的 Agent
- 市场列表按导入次数降序排列，热度驱动发现

**Non-Goals:**
- 不实现审核流程（发布即上架）
- 不实现评分/评价系统
- 不实现多用户共享/协作功能
- 不实现 Agent 版本管理
- 不实现付费/积分体系
- 不修改现有 Contact 数据模型
- 不实现 Agent 的富媒体展示（截图/演示视频等）

## Decisions

### Decision 1: PublishedAgent 作为独立模型，与 Contact 解耦

新增 `PublishedAgent` 模型，发布时从 `Contact` 复制配置数据。

```prisma
model PublishedAgent {
  id           String        @id @default(cuid())
  name         String
  description  String?
  avatarUrl    String?
  provider     AgentProvider
  systemPrompt String?
  model        String?
  config       Json?
  tags         String[]      @default([])
  importCount  Int           @default(0)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  creatorId    String
  creator      User          @relation(fields: [creatorId], references: [id], onDelete: Cascade)

  @@index([creatorId])
  @@index([name])
  @@index([provider])
}
```

**Alternatives considered:**
- 在 `Contact` 上加 `isPublished` 标志位 — 耦合太紧，发布后用户修改/删除 Agent 会影响市场
- `PublishedAgent` 引用 `sourceContactId` 做软关联 — 实时数据同步复杂，且删除原始 Contact 需要额外处理

**Why**: Snapshot 解耦最干净。发布时冻结配置，此后原始 Agent 变更不影响市场。导入时完全独立为新的 Contact，端到端无耦合。

### Decision 2: 市场入口集成到现有 Agent 列表页的 Tab 导航

在 `/(market)/agents/page.tsx` 现有的 "All Agents" / "Contacts" tab 基础上增加 "Market" tab。点击后切换到市场浏览视图。

**Alternatives considered:**
- 独立路由 `/market` — 需要额外侧边栏导航入口，用户需要多一步跳转
- 独立路由群组 `/(market2)/` — 路由群组过多，布局碎片化

**Why**: 与现有的 Agent 相关功能在同一页面层级，切换自然。用户已经在 `/(market)/` 路由群组中，新增 tab 是最小侵入方式。

### Decision 3: 市场详情使用独立页面 `/agents/market/:id`

新建 `/(market)/market/[id]/page.tsx` 作为市场 Agent 详情页。展示发布者信息、描述、标签、统计（导入次数），提供"一键导入"按钮。

**Alternatives considered:**
- 复用现有 `/agents/:id` 详情页 — 页面逻辑不同（现有页面展示编辑/删除/开始聊天，市场页面展示导入），强行复用导致条件分支过多
- Modal 弹窗 — 市场详情内容较多（描述、配置预览、标签），不适合弹窗

**Why**: 独立页面职责清晰，与 Agent 列表页的跳转关系自然（列表→详情），且便于未来扩展（如添加更多市场特有的信息）。

### Decision 4: 导入操作直接创建 Contact 并跳转

点击"一键导入"后:
1. `POST /api/market/:id/import` — 后端将 `PublishedAgent` 的配置克隆为当前用户的 `Contact`
2. `importCount` 自增
3. 前端跳转到 `/agents` 并显示成功提示

**Alternatives considered:**
- 导入前弹出确认 Modal — 额外交互步骤，对"一键"体验有损
- 导入后跳转到聊天 — 用户可能想先查看联系人列表

**Why**: 直接创建 Contact 是最简单的导入语义。跳转到 Agent 列表让用户看到导入结果，然后可以自行选择开始聊天或其他操作。

### Decision 5: 搜索筛选在后端实现

`GET /api/market/list` 支持 `?q=name&provider=Claude&tags=writing` 查询参数。

**Alternatives considered:**
- 前端全量加载后筛选 — 数据量增大后性能差
- 仅前端筛选 — 无法分页

**Why**: 后端筛选支持分页和索引，为后续增长预留空间。初期可以不分页（数据量小），但筛选逻辑在后端便于扩展。

## Risks / Trade-offs

- [发布敏感配置] → 用户可能发布包含 API Key 的 Custom Agent 配置。**Mitigation**: 发布时明确提示用户检查配置，config 字段在前端发布表单中不可见（仅存储 Provider 类型等元信息）
- [市场 Agent 质量参差不齐] → 无审核流程可能导致低质量或恶意 Agent 充斥市场。**Mitigation**: MVP 阶段接受这个 trade-off；后续可考虑简单的举报机制
- [导入次数刷榜] → 用户可能重复导入来刷热度排名。**Mitigation**: 导入按用户去重计数（同一用户多次导入同一 Agent 只计 1 次），或后期添加时间衰减算法
- [导入后配置过时] → 发布者更新了 listing，但已导入的用户仍是旧配置。**Mitigation**: Publishing on MVP 阶段是可接受的，后续可考虑"检查更新"功能
