## 1. 准备工作

- [x] 1.1 补充 `packages/db` 中 `conversation.ts` 缺失的 `deleteConversation` 仓库函数
- [x] 1.2 在 `app.ts` 中创建受保护的插件作用域（统一添加 `authenticate` 中间件），注册所有新路由组
- [x] 1.3 验证 `pnpm build` 编译通过

## 2. Agent 路由

- [x] 2.1 创建 `routes/agents.ts`，实现 `GET /api/agents/list`（支持 `?provider=` 过滤）
- [x] 2.2 实现 `POST /api/agents/create`（验证 name、provider 字段）
- [x] 2.3 实现 `GET /api/agents/:id/detail`（不存在返回 404）

## 3. 联系人路由

- [x] 3.1 创建 `routes/contacts.ts`，实现 `GET /api/contacts/list`
- [x] 3.2 实现 `POST /api/contacts/create`（验证 agentId 字段，返回 201）
- [x] 3.3 实现 `PATCH /api/contacts/:id/update`（验证归属，返回 403）
- [x] 3.4 实现 `DELETE /api/contacts/:id/delete`（验证归属，返回 204）

## 4. 会话路由

- [x] 4.1 创建 `routes/conversations.ts`，实现 `GET /api/conversations/list`（支持 offset/limit/includeArchived 参数）
- [x] 4.2 实现 `POST /api/conversations/create`（验证 title、type 字段）
- [x] 4.3 实现 `GET /api/conversations/:id/detail`（包含最近 50 条消息）
- [x] 4.4 实现 `PATCH /api/conversations/:id/update`（支持 title、isArchived）
- [x] 4.5 实现 `DELETE /api/conversations/:id/delete`（返回 204）

## 5. 消息路由

- [x] 5.1 创建 `routes/messages.ts`，实现 `GET /api/conversations/:id/messages/list`（cursor 分页）
- [x] 5.2 实现 `POST /api/conversations/:id/messages/create`（持久化消息，更新 lastActiveAt）
- [x] 5.3 实现 `POST /api/conversations/:id/messages/:messageId/pin`（切换置顶状态）

## 6. 产物路由

- [x] 6.1 创建 `routes/artifacts.ts`，实现 `GET /api/artifacts/:id/detail`
- [x] 6.2 实现 `GET /api/artifacts/:id/preview`（返回 previewUrl 或 content）

## 7. 凭据路由

- [x] 7.1 创建 `routes/credentials.ts`，实现 `GET /api/credentials/list`（encryptedKey 脱敏为 `"****"`）
- [x] 7.2 实现 `POST /api/credentials/create`（验证 provider、encryptedKey 字段）
- [x] 7.3 实现 `DELETE /api/credentials/:id/delete`（验证归属，返回 204）

## 8. 集成测试

- [x] 8.1 扩展 `__tests__/helpers.ts`（添加 createTestAgent、createTestContact、createTestConversation、getAuthHeader 工厂函数）
- [x] 8.2 创建 `__tests__/agents.test.ts`（覆盖 list/create/detail + 认证/验证错误）
- [x] 8.3 创建 `__tests__/contacts.test.ts`（覆盖 list/create/update/delete + 认证/权限/验证错误）
- [x] 8.4 创建 `__tests__/conversations.test.ts`（覆盖 list/create/detail/update/delete + 分页/归档过滤/认证错误）
- [x] 8.5 创建 `__tests__/messages.test.ts`（覆盖 list/create/pin + cursor 分页/认证错误）
- [x] 8.6 创建 `__tests__/artifacts.test.ts`（覆盖 detail/preview + 404/认证错误）
- [x] 8.7 创建 `__tests__/credentials.test.ts`（覆盖 list/create/delete + 脱敏验证/认证/权限错误）
- [x] 8.8 执行 `pnpm --filter @agenthub/server test` 确认全部通过
