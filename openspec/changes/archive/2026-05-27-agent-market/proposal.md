## Why

AgentHub 的聊天界面（Module 10）已实现 IM 三栏布局、消息收发和实时通信，但缺少面向 Agent 的管理入口。用户无法浏览可用 Agent、查看 Agent 详情、创建自定义 Agent 或管理联系人列表。Module 11 填补这个空白，让用户可以探索、选择和管理 Agent，使 AgentHub 从一个"能用"的聊天工具变成可扩展的 Agent 协作平台。

## What Changes

- 在 `apps/web` 中新增 Agent 市场页面（`/agents`），展示所有可用 Agent（内置 + 用户创建）
- 在 `apps/web` 中新增 Agent 详情页面（`/agents/:id`），含"开始聊天"和"添加到联系人"操作
- 在 `apps/web` 中新增自定义 Agent 创建功能（表单弹窗）
- 在 `apps/web` 中新增联系人管理界面（列表、编辑名称、置顶/取消置顶、删除）
- 在 `apps/web` Sidebar 中增加 Agent 市场导航入口
- 将 `RightPanel` 的 Agent 详情占位替换为实际内容
- 不需要修改后端 API——已有路由完全覆盖

## Capabilities

### New Capabilities

- `agent-list`: 显示所有可用 Agent 的列表页面，支持内置 Agent 优先排序
- `agent-detail`: Agent 详细信息展示页面，包含开始聊天和添加到联系人操作
- `agent-create`: 自定义 Agent 创建表单，支持名称、系统提示词、模型配置
- `contact-management`: 联系人管理功能（列表、添加、编辑显示名称、置顶/取消置顶、删除）

### Modified Capabilities

<!-- 无现有 capability 需要修改，此为纯新增模块 -->

## Impact

- **新增** `apps/web/app/(market)/` 路由目录（Agent 市场相关页面）
- **新增** 自定义 Agent 创建表单组件
- **新增** 联系人管理列表组件
- **修改** `apps/web/components/Sidebar.tsx` —— 增加 Agent 市场导航入口
- **修改** `apps/web/components/RightPanel.tsx` —— 替换 Agent 详情占位为真实内容
- 不需要新增 npm 依赖
- 不需要修改后端 API
- 涉及的新增文件约 8-10 个，修改文件约 2-3 个
