## 1. 路由框架与导航入口

- [x] 1.1 创建 `apps/web/app/(market)/layout.tsx`，包裹 AuthGuard，与 `(chat)` layout 同级
- [x] 1.2 创建 `apps/web/app/(market)/agents/page.tsx`，作为 Agent 列表页（初始骨架）
- [x] 1.3 创建 `apps/web/app/(market)/agents/[id]/page.tsx`，作为 Agent 详情页（初始骨架）
- [x] 1.4 创建 `apps/web/app/(market)/agents/contacts/page.tsx`，作为联系人管理页（初始骨架）
- [x] 1.5 在 `Sidebar.tsx` 用户信息区下方增加"Agent 市场"导航按钮，点击跳转 `/agents`

## 2. Agent 列表页面

- [x] 2.1 实现 Agent 列表 API 调用（`GET /api/agents/list`），包含 loading/empty/error 三种状态
- [x] 2.2 实现 Agent 卡片组件 `AgentCard`（头像 + 名称 + 提供商），点击跳转到 `AgentDetailContent`
- [x] 2.3 实现内置 Agent 优先排序（按 `createdAt` 或特定规则区分内置和自定义）
- [x] 2.4 在列表页顶部添加"创建 Agent"按钮，点击弹出创建 Modal

## 3. Agent 详情页面

- [x] 3.1 实现 `AgentDetailContent` 共享组件（头像、名称、提供商、模型、系统提示词展示），供详情页和 RightPanel 复用
- [x] 3.2 实现详情页数据加载（`GET /api/agents/:id/detail`）及 404 处理
- [x] 3.3 实现"开始聊天"按钮：调用 `POST /api/conversations/create` → 跳转 `/chat`
- [x] 3.4 实现"添加到联系人"按钮：调用 `POST /api/contacts/create`，成功后切换为"已是联系人"禁用状态

## 4. 自定义 Agent 创建

- [x] 4.1 实现创建 Agent Modal 组件 `CreateAgentModal`（名称、系统提示词、模型字段）
- [x] 4.2 实现表单前端验证（名称必填、提示词长度限制）
- [x] 4.3 实现表单提交（`POST /api/agents/create`），成功后关闭 Modal 并刷新列表

## 5. 联系人管理

- [x] 5.1 实现联系人列表 API 调用（`GET /api/contacts/list`），含 loading/empty/error 状态
- [x] 5.2 实现联系人列表 UI（头像、显示名称、提供商、置顶图标、编辑/删除操作按钮）
- [x] 5.3 实现置顶/取消置顶切换（`PATCH /api/contacts/:id/update` 更新 isPinned）
- [x] 5.4 实现编辑显示名称功能（行内编辑或弹窗编辑，调用 `PATCH /api/contacts/:id/update`）
- [x] 5.5 实现删除联系人（确认对话框 → `DELETE /api/contacts/:id/delete`）

## 6. RightPanel 集成

- [x] 6.1 将 `RightPanel.tsx` 中 `content.type === "agent"` 的占位替换为 `AgentDetailContent` 组件
- [x] 6.2 在 RightPanel Agent 详情底部增加"开始聊天"和"添加到联系人"操作按钮

## 7. 测试

- [x] 7.1 编写 Agent 列表页渲染测试（mock API，验证卡片渲染和排序）
- [x] 7.2 编写创建 Agent 表单测试（表单验证、提交成功/失败场景）
