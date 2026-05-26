## 1. Monorepo 基础搭建

- [x] 1.1 初始化根目录 `package.json`，包含 turborepo 和 TypeScript 开发依赖
- [x] 1.2 创建 `turbo.json`，配置 build/dev/lint/test 流水线
- [x] 1.3 创建 `pnpm-workspace.yaml`，包含 `apps/*`、`packages/*`、`tooling/*`
- [x] 1.4 创建 `.npmrc` 和 `.gitignore`
- [x] 1.5 创建 `tooling/tsconfig/base.json`，配置严格 TypeScript 设置
- [x] 1.6 创建 `tooling/tsconfig/nextjs.json`，继承 base 并添加 JSX 支持
- [x] 1.7 创建 `tooling/tsconfig/node.json`，继承 base 并添加 Node 类型
- [x] 1.8 创建 `tooling/eslint-config` 包，配置 TypeScript 规则
- [x] 1.9 执行 `pnpm install` 并验证工作空间解析

## 2. 共享类型包

- [x] 2.1 创建 `packages/shared/package.json` 和 `tsconfig.json`
- [x] 2.2 定义所有枚举：ConversationType、SenderType、MessageType、ArtifactType、ArtifactStatus、AgentProvider、ChunkType
- [x] 2.3 定义核心接口：Agent、Contact、Conversation、Message、Artifact、User、Chunk、AgentContext
- [x] 2.4 定义 AgentAdapter 接口和 UserCredential 类型
- [x] 2.5 创建 `src/index.ts` 统一导出入口
- [x] 2.6 编写枚举值和类型导出的单元测试
- [x] 2.7 验证零运行时依赖

## 3. 数据库包

- [x] 3.1 创建 `packages/db/package.json` 和 `tsconfig.json`
- [x] 3.2 定义包含 User 模型的 Prisma schema
- [x] 3.3 定义包含 Agent 和 Contact 模型的 Prisma schema
- [x] 3.4 定义包含 Conversation、Message、Artifact 模型的 Prisma schema
- [x] 3.5 定义包含 UserCredential 模型及所有关联关系的 Prisma schema
- [x] 3.6 创建 Prisma 客户端单例（`src/client.ts`）
- [x] 3.7 实现会话 CRUD 函数（创建、获取、列表、更新）
- [x] 3.8 实现消息 CRUD 函数（创建、获取、分页列表、置顶）
- [x] 3.9 创建 `.env.example` 包含 DATABASE_URL
- [x] 3.10 执行 `prisma generate` 并验证编译

## 4. Agent 适配器层

- [x] 4.1 创建 `packages/agent-core/package.json` 和 `tsconfig.json`
- [x] 4.2 实现 `ClaudeAdapter`，通过 Anthropic API HTTP SSE 流式通信
- [x] 4.3 实现 `OpenCodeAdapter`，通过 CLI 子进程生成和 stdout 解析
- [x] 4.4 实现 `CustomAgentAdapter`，用于用户配置的 LLM 端点
- [x] 4.5 实现 `createAdapter` 工厂函数，按提供商类型创建适配器
- [x] 4.6 为每个适配器实现健康检查逻辑
- [x] 4.7 编写适配器工厂和数据块解析的单元测试

## 5. 用户认证

- [x] 5.1 创建 `apps/server/package.json` 和 `tsconfig.json`
- [x] 5.2 初始化 Fastify 服务器，包含 CORS 和 JSON 解析器
- [x] 5.3 实现 JWT 工具函数（签名、验证、刷新）
- [x] 5.4 实现 `POST /auth/register` 路由，包含密码哈希
- [x] 5.5 实现 `POST /auth/login` 路由，返回 access + refresh token
- [x] 5.6 实现 `POST /auth/refresh` 路由，用于令牌刷新
- [x] 5.7 创建 JWT 认证中间件，保护需要认证的路由
- [x] 5.8 实现 SSE/WS 通过查询参数验证 token
- [x] 5.9 编写认证 API 集成测试

## 6. REST API 服务器

- [ ] 6.1 实现路由注册模式和错误处理中间件
- [ ] 6.2 实现 Agent 路由：`GET /api/agents`、`POST /api/agents`、`GET /api/agents/:id`
- [ ] 6.3 实现联系人路由：`GET /api/contacts`、`POST /api/contacts`、`PATCH /api/contacts/:id`、`DELETE /api/contacts/:id`
- [ ] 6.4 实现会话路由：`GET /api/conversations`、`POST /api/conversations`、`GET /api/conversations/:id`、`PATCH /api/conversations/:id`、`DELETE /api/conversations/:id`
- [ ] 6.5 实现消息路由：`GET /api/conversations/:id/messages`（分页）、`POST /api/conversations/:id/messages`、置顶/回复端点的消息
- [ ] 6.6 实现产物路由：`GET /api/artifacts/:id`、`GET /api/artifacts/:id/preview`
- [ ] 6.7 实现凭证路由：`GET /api/credentials`、`POST /api/credentials`、`DELETE /api/credentials/:id`
- [ ] 6.8 为所有路由组编写 API 集成测试

## 7. 实时通信

- [ ] 7.1 实现 SSE 端点 `GET /sse/conversations/:id/stream`，含 JWT 认证
- [ ] 7.2 实现 SSE chunk 事件推送，用于 Agent 流式输出
- [ ] 7.3 实现 SSE done 事件，包含 token 用量元数据
- [ ] 7.4 实现 WebSocket 端点，包含连接生命周期管理
- [ ] 7.5 实现 WebSocket 输入中状态指示器事件
- [ ] 7.6 实现 WebSocket 消息状态投递通知
- [ ] 7.7 实现 WebSocket 心跳（ping/pong）
- [ ] 7.8 编写 SSE 和 WebSocket 连接的集成测试

## 8. 编排器

- [ ] 8.1 实现消息意图分析，用于任务拆解
- [ ] 8.2 实现并行任务分发，通过独立 SSE 流同时调用多个 Agent
- [ ] 8.3 实现串行任务分发，带依赖链处理
- [ ] 8.4 实现失败处理：重试一次后跳过
- [ ] 8.5 实现所有任务完成后的聚合结果汇总
- [ ] 8.6 编写任务分发策略的单元测试

## 9. 共享 UI 组件

- [ ] 9.1 创建 `packages/ui/package.json` 和 `tsconfig.json`，启用 React 支持
- [ ] 9.2 实现 `MessageBubble` 组件，按发送者类型显示不同样式
- [ ] 9.3 实现 `CodeBlock` 组件，支持语法高亮和复制按钮
- [ ] 9.4 实现 `DiffCard` 组件，支持内联差异渲染（绿色/红色）
- [ ] 9.5 实现 `PreviewCard` 组件，使用 iframe 缩略图
- [ ] 9.6 实现 `ArtifactCard` 组件，支持构建中/已完成/失败三种状态
- [ ] 9.7 实现 `AgentAvatar` 组件，支持图片和首字母兜底显示
- [ ] 9.8 使用 React Testing Library 编写组件测试

## 10. 聊天界面（Next.js Web 应用）

- [ ] 10.1 使用 Next.js App Router 创建 `apps/web` 和基础布局
- [ ] 10.2 实现登录和注册页面
- [ ] 10.3 实现三栏聊天布局（侧边栏、聊天面板、右侧面板）
- [ ] 10.4 实现侧边栏：用户信息、搜索框、会话列表、新建聊天按钮
- [ ] 10.5 实现聊天面板：头部、消息列表、输入框
- [ ] 10.6 实现消息气泡渲染，按发送者区分样式
- [ ] 10.7 实现聊天输入框：文本区域和发送按钮
- [ ] 10.8 实现群聊 @提及弹出框
- [ ] 10.9 实现 Agent 流式响应的输入中状态指示器
- [ ] 10.10 集成 SSE 客户端，用于实时消息流
- [ ] 10.11 集成 WebSocket 客户端，用于在线状态和通知

## 11. Agent 市场界面

- [ ] 11.1 实现 Agent 列表页面（`/agents`），显示头像、名称、提供商
- [ ] 11.2 实现 Agent 详情页面（`/agents/:id`），包含开始聊天操作
- [ ] 11.3 实现自定义 Agent 创建表单
- [ ] 11.4 实现联系人管理界面（添加、重命名、置顶/取消置顶）

## 12. 产物预览

- [ ] 12.1 实现右侧面板 ArtifactFullPreview，使用 iframe 展示内容
- [ ] 12.2 集成 Monaco Editor，用于在右侧面板查看代码产物
- [ ] 12.3 实现消息中内联显示产物构建状态
- [ ] 12.4 实现点击 PreviewCard 展开到全屏预览
