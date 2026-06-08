## Why

创建会话的 UI 交互不直观 — 点击 "+" 后 Dialog 从 Sidebar 底部弹出，空间受限、视觉突兀，且缺少浏览和搜索 Agent 的能力。同时，用户缺少一个统一查看和管理所有已创建 Agent 的入口。

## What Changes

- **"+ "按钮交互重构**：点击 "+" 不再弹出 Dialog，而是将 Sidebar 切换到「添加 Agent」视图，展示所有可用 Agent 供选择
- **新增 Sidebar 多视图模式**：Sidebar 支持三个视图 — 会话列表（默认）、添加 Agent、Agent 管理，视图间通过 Header 按钮和返回导航切换
- **新增 Agent 管理入口**：Sidebar Header 新增 🤖 按钮，点击进入「我的 Agent」视图，可浏览、搜索、编辑、删除所有已创建的 Agent
- **添加 Agent 视图支持搜索**：在添加 Agent 视图中提供搜索框，可按名称搜索可用 Agent
- **移除旧的 New Chat Dialog**：删除 Sidebar 中 `showNewChatDialog` 相关的弹出层代码（absolute 定位的 bottom Dialog）
- **Agent 管理视图支持编辑/删除**：在 Agent 管理视图中，每个 Agent 卡片提供编辑和删除操作

## Capabilities

### New Capabilities
- `sidebar-multi-view`: Sidebar 三视图切换，包括会话列表、添加 Agent、Agent 管理三个视图
- `agent-management`: Agent 管理视图，展示所有已创建 Agent，支持搜索、编辑、删除
- `add-agent-flow`: 新增的添加 Agent 交互流程，支持搜索、单聊/群聊模式切换

### Modified Capabilities
- *(none — 不涉及现有 capability 的 spec 级别行为变更)*

## Impact

- **apps/web/components/Sidebar.tsx** — 核心修改文件，重构 Sidebar 为多视图模式
- **apps/web/components/CreateAgentModal.tsx** — 可能需要在 Agent 管理视图中复用编辑/创建逻辑
- **apps/web/components/EditAgentModal.tsx** — Agent 管理视图中的编辑操作
- **无 API/DB 变更** — 纯前端 UI 重构，不涉及后端和数据层改动
