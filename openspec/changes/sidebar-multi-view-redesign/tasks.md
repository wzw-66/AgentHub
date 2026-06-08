## 1. Sidebar 视图状态机

- [x] 1.1 在 Sidebar 中添加 `sidebarView` state（类型: `'chats' | 'add-agent' | 'agents'`），替换 `showNewChatDialog` state
- [x] 1.2 修改 Header：`chats` 视图显示 "AgentHub" + "+" + "🤖"；`add-agent`/`agents` 视图显示 "← 返回" + 视图标题
- [x] 1.3 Header "🤖" 按钮点击切换到 `agents` 视图
- [x] 1.4 Header "←" 按钮点击返回 `chats` 视图

## 2. 提取 ChatListView 组件

- [x] 2.1 从 Sidebar.tsx 中提取会话列表相关 JSX 为独立的 `ChatListView` 子组件
- [x] 2.2 将搜索框提取为 ChatListView 的组成部分（contact pills 保留在父组件，因跨视图可见）
- [x] 2.3 确保 ChatListView 在 `chats` 视图下正常渲染

## 3. 实现 AddAgentView 组件

- [x] 3.1 新建 `AddAgentView` 子组件，接收 `contacts`、`createConversation`、`onSelectConversation` 等 props
- [x] 3.2 添加搜索框，通过 `useMemo` 按名称过滤 contacts
- [x] 3.3 添加单聊/群聊模式切换 UI（按钮组），默认单聊
- [x] 3.4 渲染 Agent 列表（avatar + name + provider），支持滚动，不限 6 个
- [x] 3.5 单聊模式：点击 Agent 直接 `createConversation` + 跳转 + 返回 `chats` 视图
- [x] 3.6 群聊模式：勾选 Agent（`Set<string>` 管理选中状态），显示已选数量
- [x] 3.7 群聊模式：2+ Agent 选中后启用「创建群聊」按钮，点击执行 `createConversation` + 跳转 + 返回
- [x] 3.8 空搜索结果时显示空状态提示

## 4. 实现 AgentManageView 组件

- [x] 4.1 新建 `AgentManageView` 子组件，接收 `contacts` 等 props
- [x] 4.2 添加搜索框过滤当前用户的 Agent
- [x] 4.3 渲染 Agent 卡片列表：avatar + name + provider + displayName + tags + 编辑/删除按钮
- [x] 4.4 编辑按钮：打开 EditAgentModal（内部管理状态）
- [x] 4.5 删除按钮：点击显示确认提示，确认后调用 `DELETE /api/contacts/:id/delete` + 刷新列表
- [x] 4.6 底部「创建新 Agent」按钮保留在 Sidebar 父组件底部
- [x] 4.7 空状态：无 Agent 时显示提示 + 引导创建

## 5. 清理旧的 New Chat Dialog

- [x] 5.1 删除 `showNewChatDialog` 相关 state 和 JSX（absolute 定位的 Dialog 代码块）
- [x] 5.2 清理 `showArchived` 相关死代码（已移至 ChatListView 内部管理）
- [x] 5.3 验证无遗留的 Dialog 相关死代码

## 6. 视图切换动画

- [x] 6.1 为视图容器添加 CSS transition（opacity + transform translateY，~200ms ease）
- [x] 6.2 确保动画不影响交互（使用 `pointerEvents` 控制隐藏视图不可交互）
- [ ] 6.3 验证切换流畅度，调整动画曲线

## 7. 验证与测试

- [ ] 7.1 验证 "+" → 添加 Agent → 选择 Agent → 创建会话 → 返回会话列表 完整流程
- [ ] 7.2 验证 "+" → 群聊模式 → 选择多个 Agent → 创建群聊 → 返回会话列表 完整流程
- [ ] 7.3 验证 "🤖" → Agent 管理视图 → 编辑 Agent → 保存 → 列表刷新
- [ ] 7.4 验证 "🤖" → Agent 管理视图 → 删除 Agent → 确认删除 → 列表刷新
- [ ] 7.5 验证 Contact pills 快速创建会话依然正常工作
- [ ] 7.6 验证视图切换动画流畅，无卡顿
