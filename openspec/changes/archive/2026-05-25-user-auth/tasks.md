## 1. 前置条件：补充 User 仓库

- [x] 1.1 在 `packages/db/src/repositories/user.ts` 中实现 `createUser(data)`、`findUserByEmail(email)`、`findUserById(id)`
- [x] 1.2 更新 `packages/db/src/repositories/index.ts`，添加 `export * from "./user"`
- [x] 1.3 更新 `packages/db/src/__tests__/` 添加 user 仓库的单元测试验证 CRUD 操作

## 2. 创建 apps/server 骨架

- [x] 2.1 创建 `apps/server/package.json`，声明 `@agenthub/server`，依赖 `fastify`、`@fastify/cors`、`jsonwebtoken`、`bcryptjs`
- [x] 2.2 创建 `apps/server/tsconfig.json`，继承 `tooling/tsconfig/node.json`
- [x] 2.3 创建 `apps/server/tsup.config.ts`，配置 Node.js 构建
- [x] 2.4 创建 `apps/server/vitest.config.ts`，配置测试环境
- [x] 2.5 更新 `pnpm-workspace.yaml` 添加 `apps/server`
- [x] 2.6 执行 `pnpm install` 验证依赖安装

## 3. 初始化 Fastify 服务器

- [x] 3.1 创建 `src/config/env.ts`，定义环境变量 schema（PORT、HOST、DATABASE\_URL、JWT\_SECRET 等）
- [x] 3.2 创建 `src/app.ts`，实现 Fastify 应用工厂函数（注册 CORS、JSON 解析器、全局错误处理）
- [x] 3.3 创建 `src/index.ts`，实现服务器入口（加载环境变量、创建 app 实例、启动、graceful shutdown）
- [x] 3.4 创建项目根目录 `.env.example`，统一管理所有环境变量（DB + Server + JWT），删除 `apps/server/.env.example`

## 4. 实现 JWT 工具函数

- [x] 4.1 实现 `src/utils/jwt.ts`：`signAccessToken({ userId })`、`signRefreshToken({ userId, jti })`、`verifyAccessToken(token)`、`verifyRefreshToken(token)`
- [x] 4.2 实现 `src/utils/password.ts`：`hashPassword(plain)`、`comparePassword(plain, hash)`（使用 bcryptjs）
- [x] 4.3 编写 JWT 和密码工具函数的单元测试

## 5. 实现认证路由

- [x] 5.1 实现 `src/routes/auth.ts` 注册路由：`POST /auth/register`（输入验证 → 检查重复 → 哈希密码 → 创建用户 → 签发 token → 201）
- [x] 5.2 实现登录路由：`POST /auth/login`（查找用户 → 密码比对 → 签发 token → 200）
- [x] 5.3 实现刷新路由：`POST /auth/refresh`（验证 refreshToken → 查找用户 → 签发新 accessToken → 200）
- [x] 5.4 注册 auth 路由到 Fastify 应用（`app.register(authRoutes, { prefix: "/auth" })`）

## 6. 实现 JWT 认证中间件

- [x] 6.1 实现 `src/middleware/jwt.ts` 的 `authenticate` preHandler（提取 Bearer token → 验证 accessToken → 注入 userId → 放行或 401）
- [x] 6.2 实现 SSE/WS 查询参数 token 验证函数 `verifyQueryToken(query)`（从 query.token 提取并验证 accessToken）
- [x] 6.3 创建受保护路由测试桩，验证中间件正常工作

## 7. 编写集成测试

- [x] 7.1 实现测试辅助函数：创建测试用户、生成测试 token、创建 Fastify 测试实例
- [x] 7.2 编写注册接口测试：成功注册 / 重复邮箱 / 无效输入
- [x] 7.3 编写登录接口测试：成功登录 / 错误密码 / 不存在邮箱
- [x] 7.4 编写刷新接口测试：成功刷新 / 过期 refreshToken / 无效 refreshToken
- [x] 7.5 编写中间件测试：有效 token 通过 / 无 token 拒绝 / 过期 token 拒绝
- [x] 7.6 执行全部测试并确认通过

