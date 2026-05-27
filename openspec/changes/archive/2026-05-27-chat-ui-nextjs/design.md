## Context

AgentHub 目前已完成后端全部模块（server、agent-core、db、shared）和 UI 组件库（packages/ui），但缺少面向用户的 Web 界面。模块 10 是实现 AgentHub 产品化的关键一环——提供一个完整的 IM 聊天 Web 应用。

现有可供 Chat UI 使用的资源：
- `@agenthub/shared` — User、Message、Conversation、Agent 等类型定义和枚举
- `@agenthub/ui` — AgentAvatar、MessageBubble、CodeBlock、DiffCard 等 6 个预置组件
- `@agenthub/server` — 全部 REST API + SSE/WS 端点已就绪
- `tooling/tsconfig/nextjs.json` — Next.js TypeScript 配置模版
- `tooling/eslint-config` — 共享 ESLint 配置

## Goals / Non-Goals

**Goals:**
- 创建 `apps/web` Next.js 应用，作为 AgentHub 的 Web 端入口
- 实现完整的 IM 聊天体验：三栏布局、会话管理、消息发送/接收
- 集成 SSE 实现 Agent 流式输出的实时展示
- 集成 WebSocket 实现在线状态和消息通知
- 实现用户认证流程：登录、注册、token 管理
- 复用 `@agenthub/ui` 的现有组件
- 支持群聊 @提及 Agent

**Non-Goals:**
- 不实现桌面端（Electron/Tauri）——这是模块 12 的范围
- 不实现 Agent 市场页面（`/agents`）——这是模块 11 的范围
- 不实现产物预览右侧面板（ArtifactFullPreview、Monaco Editor）——这是模块 12 的范围
- 不实现 PWA/离线功能
- 不实现移动端自适应布局（Phase 2 范围）
- 不实现国际化（i18n）

## Decisions

### Decision 1: 使用 Tailwind CSS 作为样式方案

Tailwind CSS 是 Next.js 生态的事实标准，与 React Server Components 兼容，且 Turborepo 项目中无需额外配置即可共享设计 token。

**Alternatives considered:**
- CSS Modules — 组件内隔离更好，但缺乏设计系统一致性
- styled-components — RSC 兼容性差，运行时开销

### Decision 2: Token 存储使用 localStorage + 拦截器模式

Access token 存储在 localStorage，refresh 逻辑在 HTTP 客户端拦截器中自动处理。

**Alternatives considered:**
- httpOnly cookie — 更安全（防 XSS），但需要服务端配合设置 cookie，且 SSE/WS 的 token 传递更复杂
- 内存存储 — 刷新页面后需要重新登录，体验差

**Why**: localStorage 方案实现简单，与现有 SSE query token 验证机制兼容，且对 SPA 刷新友好。

### Decision 3: 状态管理使用 React Context + useReducer

应用状态分为三个独立的 context：
- `AuthContext` — 认证状态（user, token, login/logout）
- `ChatContext` — 聊天状态（活跃会话、消息列表、输入中状态）
- `WSContext` — 实时连接状态（在线联系人、连接生命周期）

**Alternatives considered:**
- Zustand — 更少的样板代码，但模块 10 的状态范围有限，不值得引入依赖
- Redux Toolkit — 过于重量级，不适合中等复杂度的单模块应用

### Decision 4: SSE 和 WebSocket hook 独立封装

创建 `useSSEStream(conversationId)` 和 `useWebSocket()` 两个独立 hook：
- `useSSEStream` — 专注于 Agent 响应的流式读取，只有主动读取语义
- `useWebSocket` — 专注于双向通信（在线状态、输入中指示、通知）

**Why**: 两个协议的连接生命周期和关注点不同。SSE 只在活跃会话中连接，WS 在应用整个生命周期保持连接。独立 hook 职责更清晰。

### Decision 5: 三栏布局使用 CSS Grid

```
┌─────────┬───────────────────┬──────────────┐
│ w-72    │ flex-1            │ w-96         │
│ Sidebar │ Chat Panel        │ Right Panel  │
│         │                   │ (隐藏)        │
│ 搜索框   │ ▷ 会话名称         │              │
│ 会话列表 │ ○ 消息列表         │ 产物/Agent   │
│ [新建]   │ ○ 滚动             │ 详情         │
│         │ ┌ 输入框 ────────┐ │              │
│         │ └────────────────┘ │              │
└─────────┴───────────────────┴──────────────┘
```

右侧面板默认隐藏（`hidden`），通过 `selectedArtifact` 或 `selectedAgent` 触发显示。

## Risks / Trade-offs

- [SSE 连接数过多] → 每个会话一个 SSE 连接，大量会话同时打开可能导致浏览器连接数限制（通常 6 个/域名）。**Mitigation**: 同一时间只保持活跃会话的 SSE 连接，切换会话时关闭旧连接。
- [token 过期导致 SSE/WS 断开] → localStorage 中的 token 过期后，EventSource 和 WebSocket 自动断开。**Mitigation**: HTTP 拦截器在检测到 401 时自动刷新 token；SSE/WS 在 token 刷新后需要用户重新进入会话触发重连。
- [消息分页与实时流冲突] → 用户滚动查看历史消息时，新消息到达可能导致列表跳动。**Mitigation**: 新消息到达时不自动滚动（auto-scroll 仅在用户位于列表底部时触发）。
- [@提及与输入框状态冲突] → @提及弹出框需要管理输入框的 cursor 位置。**Mitigation**: 使用 contenteditable div 或 textarea + overlay 方案管理 @提及。
