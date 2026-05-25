## Why

AgentHub 目前已完成底层基础设施（monorepo、shared-types、database、agent-core），但缺乏用户认证系统和服务器端运行环境。模块 5（user-auth）是服务器端开发的起点——它创建 `apps/server` 包作为所有后端服务的载体，并实现 JWT 双 Token 认证系统，为后续 REST API（模块 6）和实时通信（模块 7）提供身份验证基础。

## What Changes

- 创建 `apps/server` 包，初始化 Fastify 服务器骨架（CORS、错误处理、插件体系）
- 实现基于 JWT 的双 Token 认证：accessToken（15 分钟）+ refreshToken（7 天）
- 实现三个认证路由：注册（`POST /auth/register`）、登录（`POST /auth/login`）、刷新令牌（`POST /auth/refresh`）
- 创建 JWT 认证中间件，保护所有 `/api/*` 路由
- 实现 SSE/WebSocket 通过查询参数验证 token 的函数（供模块 7 使用）
- 在 `packages/db` 中补充 User 仓库（user CRUD），这是前置依赖缺失项
- 编写认证 API 集成测试

## Capabilities

### New Capabilities
- `user-auth`: 用户注册/登录、JWT 双 Token 认证、访问控制中间件、SSE/WS token 验证

### Modified Capabilities

<!-- No existing capabilities to modify. -->

## Impact

- 新增 `apps/server/` 目录，作为后端 Fastify 服务器
- 新增依赖：fastify、@fastify/cors、jsonwebtoken、bcryptjs 及其类型定义
- 补充 `packages/db/src/repositories/user.ts`（User CRUD），补齐数据库层缺失
- 更新 `pnpm-workspace.yaml` 注册 `apps/server`
- `.env.example` 增加 JWT 相关环境变量（JWT_SECRET、JWT_ACCESS_EXPIRES_IN、JWT_REFRESH_EXPIRES_IN）
- 后续模块 6（REST API）和模块 7（实时通信）将在此基础上扩展
