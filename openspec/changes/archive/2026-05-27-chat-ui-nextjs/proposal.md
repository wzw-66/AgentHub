## Why

AgentHub 的 REST API、实时通信、Orchestrator、共享 UI 组件均已实现，但缺少面向用户的 Web 界面。没有聊天 UI，整个平台无法被终端用户使用。Module 10 是实现 AgentHub 作为可用产品的最后关键模块——将后端能力转化为可交互的 IM 聊天体验。

## What Changes

- 在 `apps/web` 下创建 Next.js 应用，使用 App Router
- 实现登录/注册页面，连接现有 JWT 认证 API
- 实现三栏 IM 聊天布局（侧边栏 + 聊天面板 + 右侧面板）
- 实现会话列表、消息气泡渲染、聊天输入框等核心聊天功能
- 实现群聊 @提及 Agent 功能
- 集成 SSE 客户端实现 Agent 流式输出的实时展示
- 集成 WebSocket 客户端实现在线状态和消息投递通知
- 在 turbo.json 中添加 `apps/web` 的构建/测试流水线

## Capabilities

### New Capabilities
- `chat-ui`: Next.js Web 聊天应用，包含用户认证、三栏 IM 布局、会话管理、消息发送/接收、@提及、实时通信集成。覆盖 Module 10 的全部功能范围。

### Modified Capabilities

<!-- 无现有 capability 需要修改，此为新模块创建 -->

## Impact

- 新增 `apps/web` 目录，依赖 `@agenthub/shared`、`@agenthub/ui`、`@agenthub/server`
- 依赖引入：`next`、`react`、`react-dom`、`tailwindcss`
- 新增 devDependencies：`@types/react`、`@types/node`、`tailwindcss`、`postcss`、`autoprefixer`
- turbo.json 需加入 `apps/web` 的 build/dev/lint/test 任务
