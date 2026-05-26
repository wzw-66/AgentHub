## Context

当前 `apps/server` 已实现认证模块（register/login/refresh）、JWT 工具链、密码哈希、全局错误处理和 CORS。`packages/db` 所有仓库函数就绪（仅缺 `deleteConversation`）。下一步是补全全部业务 REST API。

模块 6 是模块 7（实时通信）和模块 10（聊天 UI）的前置依赖——前端需要这些 API 来操作资源。

## Goals / Non-Goals

**Goals:**
- 为 6 组业务资源提供完整的 CRUD REST API
- 所有路径使用动词后缀（`/list`、`/create`、`/detail`、`/update`、`/delete`）
- 所有路由通过 JWT Bearer token 保护
- 为每个路由组编写集成测试
- 测试数据独立（通过 `afterEach` 清理测试用户数据）

**Non-Goals:**
- 不实现 SSE 流式推送（留给模块 7）
- 不实现 Agent 编排调度（留给模块 8）
- 不实现前端页面
- 不引入新依赖

## Decisions

### Decision 1: 动词路径风格代替纯 RESTful

不使用传统 REST（`GET /api/agents` 列表、`POST /api/agents` 创建），改为：
```
GET    /api/agents/list
POST   /api/agents/create
GET    /api/agents/:id/detail
```

**Why**: URL 本身表达意图，不依赖 HTTP method 的隐含语义，降低认知负担。

### Decision 2: 统一认证注册模式

在 `app.ts` 中创建一个受保护的插件作用域，统一添加 `preHandler: [authenticate]`，避免每个路由重复写。

```typescript
await app.register(async function (protectedApp) {
  protectedApp.addHook("preHandler", authenticate);
  await protectedApp.register(agentRoutes, { prefix: "/api/agents" });
  await protectedApp.register(contactRoutes, { prefix: "/api/contacts" });
  // ...
});
```

**Why**: 一处修改影响所有路由，新加路由自动继承认证。

### Decision 3: 每个路由文件独立 Fastify plugin

每个路由组是一个独立的 async function，导出到 `routes/` 目录：

```
routes/
├── auth.ts           (existing)
├── agents.ts
├── contacts.ts
├── conversations.ts
├── messages.ts
├── artifacts.ts
└── credentials.ts
```

**Why**: 与现有 auth.ts 模式一致，文件粒度适中，便于独立开发和测试。

### Decision 4: 资源归属验证在各 handler 中显式处理

联系人、凭据等资源需要验证 `resource.userId === request.userId`。在 handler 中通过 `getResource(id)` 获取后检查归属。

**Why**: 当前仓库层没有按 userId 过滤的查询函数，在 handler 层验证更灵活，避免过度抽象。

### Decision 5: 消息创建不做 Agent 调用

`POST /api/conversations/:id/messages/create` 仅保存消息到数据库并返回 `Message` 对象。Agent 调用和 SSE 流式响应在模块 7 实现。

**Why**: 职责分离——模块 6 管持久化，模块 7 管流式推送。

### Decision 6: Credential 返回脱敏

`GET /api/credentials/list` 返回的 `encryptedKey` 字段替换为 `"****"`，不在响应中暴露。

**Why**: 安全最佳实践，凭据密钥应在服务端加密存储，返回时脱敏。

## Risks / Trade-offs

- [测试依赖真实 PostgreSQL] → 所有集成测试需要 TEST_DATABASE_URL 指向的数据库已 push schema。沿用模块 5 的测试模式，每次测试前后清理测试数据。
- [统一认证注册可能不够灵活] → 如果后续某个路由需要绕过认证，可以降级为在路由层面单独控制。当前不存在此需求。
- [消息创建未集成 Agent 响应] → 模块 6 完成时，消息 API 可以正常保存消息，但前端还需要模块 7 才能看到 Agent 的流式回复。这是预期的跨模块依赖。
