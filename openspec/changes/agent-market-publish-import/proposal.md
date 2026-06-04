## Why

AgentHub 当前支持用户创建自定义 Agent 并在自己的联系人中使用，但这些 Agent 无法被其他用户发现或复用。用户创建的优质 Agent 配置（系统提示词、模型选择、Provider 配置）被局限在单个账号内，缺乏流通机制。本功能建立一个轻量级的 Agent 市场，让用户可以发布自己创建的 Agent 配置，其他用户一键导入到自己的联系人中，实现 Agent 能力的共享和复用。

## What Changes

- 新增 `PublishedAgent` 数据库模型，存储发布到市场的 Agent 配置 snapshot
- 新增市场浏览页面 `/agents/market`，展示所有已发布的 Agent
- 新增市场详情页面 `/agents/market/:id`，展示发布详情并提供一键导入
- Agent 详情页增加"发布到市场"入口，支持填写描述和标签后发布
- 发布者可在"我的发布"列表中管理和下架自己的 Agent
- 新增市场相关 API 路由（发布/下架/列表/详情/导入/更新）
- Agent 列表页增加 "Market" 标签页切换入口
- 不需要修改现有 Agent/Contact 数据模型

## Capabilities

### New Capabilities
- `agent-publish`: 用户将自己创建的 Agent 发布到市场，包含名称、Provider、模型、系统提示词、描述、标签等配置的 snapshot
- `agent-market-browse`: 浏览所有已发布的 Agent，支持按名称/Provider/标签搜索筛选
- `agent-import`: 一键导入市场上 Agent 的配置到自己的联系人列表，创建独立的 Contact

### Modified Capabilities

<!-- 无现有 capability 需要修改 -->

## Impact

- **新增** `packages/db/prisma/schema.prisma` — PublishedAgent 模型定义
- **新增** `packages/db/src/repositories/market.ts` — 数据库 CRUD
- **新增** `apps/server/src/routes/market.ts` — API 路由（发布/下架/列表/详情/导入）
- **新增** `apps/web/app/(market)/market/` — 市场浏览和详情页面
- **新增** `apps/web/components/PublishAgentModal.tsx` — 发布弹窗组件
- **修改** `apps/server/src/app.ts` — 注册市场路由
- **修改** `apps/web/app/(market)/agents/page.tsx` — 增加 Market tab
- **修改** `apps/web/app/(market)/agents/[id]/page.tsx` — 增加发布按钮
- **修改** `apps/web/lib/i18n/translations/{zh,en}.ts` — 市场相关文案
- 不需要新增 npm 依赖
- 不需要修改现有数据模型
