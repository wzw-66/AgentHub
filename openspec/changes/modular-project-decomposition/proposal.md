## Why

AgentHub 是一个功能密集的多 Agent 协作平台，当前所有需求集中在一个设计文档和一个实现计划中，缺少清晰的模块边界定义。将整个项目拆解为独立模块，可以让开发并行、测试聚焦、代码复用，并为后续 P2 功能（桌面端、移动端）预留扩展点。

## What Changes

- 将 AgentHub 整体架构拆解为 12 个独立模块，每个模块有明确的职责边界和接口契约
- 每个模块包含独立的 spec（功能规范）、design（设计）、task（实现任务）
- 建立模块间的依赖关系图，确保开发顺序合理
- 按优先级分阶段推进：Foundation Phase → Core Phase → UI Phase → Real-time Phase → Desktop Phase

## Capabilities

### New Capabilities

- `monorepo-foundation`: Turborepo 初始化、TypeScript/ESLint 共享配置、根 package.json 和构建流水线
- `shared-types`: 共享类型定义、枚举、DTO、API 契约——零依赖纯类型包
- `database`: Prisma schema 定义、数据库迁移、CRUD 封装、种子数据
- `agent-adapter`: Agent 抽象接口层，支持 Claude API、OpenCode CLI、自定义 Agent 三种实现
- `user-auth`: 用户注册/登录、JWT 双 token 认证、SSE/WS token 验证中间件
- `api-server`: Fastify REST API 路由（agents、contacts、conversations、messages、artifacts、credentials）
- `real-time-communication`: SSE 流式 Agent 输出 + WebSocket 双向消息推送
- `orchestrator`: 群聊模式下多 Agent 任务拆解、并行/串行调度、失败降级策略
- `chat-ui`: Next.js IM 三栏主界面、消息列表、输入框、@提及、会话管理
- `agent-market`: Agent 列表/详情页、自定义 Agent 创建、联系人管理
- `ui-components`: 共享 UI 组件库（消息气泡、CodeBlock、DiffCard、PreviewCard、ArtifactCard）
- `artifact-preview`: Agent 产物渲染（代码 diff、网页预览、文档展示）+ Monaco 编辑器集成

### Modified Capabilities

<!-- No existing capabilities to modify, this is the initial decomposition. -->

## Impact

- 影响全部代码库：根目录、packages/*、apps/*、tooling/*
- 依赖引入：Prisma、Fastify、Next.js、Turbo、Socket.IO 或 ws 库
- 新增 devDependencies：Vitest、Playwright、ESLint、Prettier
