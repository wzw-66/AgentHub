## Context

AgentHub 已完成 monorepo-foundation、shared-types、database、agent-core 四个底层模块。当前代码库中尚无服务器端应用目录（`apps/` 不存在），也缺少用户认证系统。

用户认证是服务器端开发的第一步——它既是 `apps/server` 的基础骨架，也为模块 6（REST API）和模块 7（实时通信）提供身份验证能力。在数据库层，User 模型已在 Prisma schema 中定义，但缺少对应的 CRUD 仓库实现。

## Goals / Non-Goals

**Goals:**
- 创建 `apps/server` 包，作为后端 Fastify 服务器的载体
- 实现 JWT 双 Token 认证（accessToken 15 分钟 + refreshToken 7 天）
- 实现注册、登录、刷新三个认证路由
- 创建 JWT 认证中间件，保护所有受保护路由
- 提供 SSE/WebSocket 通过查询参数验证 token 的能力
- 在 `packages/db` 中补齐 User 仓库（createUser、findUserByEmail、findUserById）

**Non-Goals:**
- 不实现完整的 REST API 路由（留给模块 6）
- 不实现 SSE 和 WebSocket 端点（留给模块 7）
- 不实现前端登录/注册页面（留给模块 10）
- 不处理 OAuth 或第三方登录（未来考虑）
- 不实现用户角色和权限体系（未来考虑）

## Decisions

### Decision 1: `apps/server` 作为单一服务器应用而非独立 auth 包

```
架构方案对比：
  A) user-auth 作为独立包 (packages/user-auth)
     → apps/server 引用它
     → 优点：高内聚，可独立测试
     → 缺点：auth 路由需要访问 Fastify 实例，抽象层过厚

  B) user-auth 直接作为 apps/server 的一部分 ✓
     → apps/server 既包含服务器基建也包含 auth 逻辑
     → 后续模块 6/7 继续往 apps/server 加路由
     → 优点：减少不必要的抽象，Fastify 插件体系天然支持功能分层
     → 缺点：apps/server 会随模块增多而变大，但可通过路由文件拆分管理
```

**选择 B**。auth 路由直接注册到 `apps/server` 的 Fastify 实例中，后续 REST API 路由通过 Fastify 插件或路由文件拆分到不同模块。这避免了创建仅薄薄一层的中间包。

### Decision 2: 使用 `jsonwebtoken` 手动管理 JWT，而非 `@fastify/jwt`

| 方案 | 优点 | 缺点 |
|------|------|------|
| `jsonwebtoken` 手动 ✓ | 纯函数，可独立测试；SSE/WS token 验证不依赖 Fastify 上下文 | 需要额外代码管理 |
| `@fastify/jwt` 插件 | 与 Fastify 深度集成，request 装饰器开箱即用 | 耦合 Fastify 生命周期；SSE/WS 场景（无 Fastify request）需要额外适配 |

**选择 `jsonwebtoken`**。核心原因是 SSE 和 WebSocket 的 token 验证发生在连接建立阶段，没有 Fastify request 对象可用。手动管理 JWT 让签名/验证逻辑成为纯函数，既能在 Fastify 中间件中使用，也能在 SSE/WS 中复用。

### Decision 3: 双 Token 机制使用 refresh token rotation

**选择标准 rotation**：每次 refresh 时签发新的 accessToken，refreshToken 保持不变。这简化了客户端实现，安全性在可接受范围内。

未来如果需要更高的安全性（如修改密码后即时撤销），可通过维护 JWT 黑名单（`Set<jti>`）来实现。但初期不引入 token 持久化存储的复杂度。

### Decision 4: 密码哈希使用 `bcryptjs` 而非 `bcrypt`

| 方案 | 优点 | 缺点 |
|------|------|------|
| `bcryptjs` ✓ | 纯 JavaScript，无编译依赖，Windows 友好 | 比原生 C++ 略慢（但注册不是高频操作） |
| `bcrypt` | 原生 C++ 绑定，性能更高 | 需要编译工具链，Windows 配置复杂 |

**选择 `bcryptjs`**。用户注册不是高频操作，纯 JS 实现的性能完全足够。避免原生模块带来的跨平台编译问题。

### Decision 5: User 仓库放在 `packages/db` 而非 `apps/server`

遵循已有 Repository 模式（agent、contact、conversation 等仓库都在 `packages/db/src/repositories/` 中），保持数据库操作层的统一。User 仓库只是补齐之前缺失的模块，不引入新的架构模式。

## Risks / Trade-offs

- [JWT 无法主动撤销] → AccessToken 短时效（15 分钟）缩小风险窗口。紧急场景（如密码泄露）可通过修改密码后清除所有 refreshToken 的 jti 来实现下线。
- [refreshToken 被窃取] → refreshToken 不随 API 请求传输，仅在 `/auth/refresh` 的请求体中出现。HTTPS 是基础要求。
- [apps/server 会逐渐膨胀] → 通过 Fastify 插件/路由文件按功能拆分。模块 5 的 auth 路由在 `routes/auth.ts`，模块 6 的 REST 路由在 `routes/api/` 下。
- [测试需要真实数据库] → 复用 `db` 包的 `agenthub_test` 数据库和已有的测试基础设施。
