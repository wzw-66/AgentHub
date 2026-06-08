## Context

当前 Sidebar 使用一个 absolute 定位的 Dialog 来处理「新建会话」流程，该 Dialog 从 Sidebar 底部弹出，空间受限（最多展示 6 个 Agent）、无搜索能力、视觉突兀。同时，用户缺少一个集中查看和管理已创建 Agent 的入口 — 目前只有一个「创建新 Agent」按钮，没有「浏览我的 Agent」的功能。

本次设计将 Sidebar 重构为多视图模式，类似微信左边栏的上下文切换体验。

## Goals / Non-Goals

**Goals:**
- Sidebar 支持三个视图的无缝切换：会话列表（默认）、添加 Agent、Agent 管理
- 点击 "+" 从 Dialog 弹出改为 Sidebar 视图切换
- 新增 Agent 管理视图，展示所有已创建 Agent，支持搜索、编辑、删除
- Agent 管理视图中的编辑复用现有 EditAgentModal，删除调用现有 API
- 纯前端改动，不涉及后端 API 变更

**Non-Goals:**
- 不改变现有 Conversation 列表的交互和视觉
- 不涉及后端 API 或数据库改动
- 不涉及移动端适配
- 不涉及 Agent 的创建流程改动（CreateAgentModal 保持不变）

## Decisions

### 1. Sidebar 内部视图状态机（而非路由）

**选择**：使用 React state (`sidebarView: 'chats' | 'add-agent' | 'agents'`) 控制 Sidebar 内部渲染哪个视图，而非使用 Next.js 路由或 URL 参数。

**理由**：
- 三个视图都是 Sidebar 的内部状态，不影响主内容区（ChatPanel/RightPanel）
- 使用路由会导致 URL 与 UI 状态不同步（ChatPanel 内容不变但 URL 变了）
- 视图切换非常轻量，不需要路由的参与

### 2. CSS 过渡而非动画库

**选择**：使用 CSS `transition` 处理视图切换动画（opacity + transform），不使用 framer-motion 等动画库。

**理由**：
- 切换效果简单（淡入 + 轻微滑动），CSS 原生支持
- 避免引入额外依赖
- 保持与现有代码风格一致（现有组件已在使用 inline style transition）

### 3. 视图组件提取为独立子组件

**选择**：将每个视图提取为独立子组件：`ChatListView` / `AddAgentView` / `AgentManageView`。

**理由**：
- Sidebar.tsx 目前已 717 行，提取后每个视图独立管理自己的状态
- 视图间不共享复杂状态，每个视图的 state 完全独立
- `AddAgentView` 替代现有的 Dialog 逻辑，代码更清晰

### 4. 保留 Contact Strip + 底部区域在所有视图中

**选择**：Contact pills 和底部「创建新 Agent」按钮 + 用户信息在所有视图中保持一致。

**理由**：
- Contact pills 提供快速入口，在所有视图中都有价值
- 底部区域提供一致的用户操作入口
- 类似微信底部导航栏在所有页面中保持一致的设计

## Risks / Trade-offs

- **[交互复杂度]** 三个视图之间的导航逻辑（返回、跳转）需要清晰的状态机设计，避免用户迷失 → 使用简单的 view stack 而非 flat state，支持返回上一级
- **[性能]** 视图切换时频繁重渲染 → 每个视图组件使用 `React.memo` + 保持视图挂载但用 CSS 控制显示/隐藏（而非条件渲染），切换更流畅
- **[现有交互兼容]** Contact pill 快速创建会话的流程需要保留 → 提取到公共 hook 或保持在父组件中
