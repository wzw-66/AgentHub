## Why

模块 5（用户认证）和前置包（shared/db/agent-core）已全部完成，应用层完全具备开发条件。当前 `apps/server` 仅有认证路由和健康检查接口，需要补全完整的 REST API，为前端（聊天 UI、Agent 市场）提供 Agent、联系人、会话、消息、产物、凭据的增删改查能力。

## What Changes

- 在 `apps/server` 中新增 6 组 REST API 路由，覆盖所有核心业务资源
- 所有路由路径采用动词后缀风格（`/list`、`/create`、`/detail`、`/update`、`/delete`），确保 URL 见名知意
- 所有业务路由通过 JWT 中间件保护，需要 Bearer token 认证
- 补充 `@agenthub/db` 中缺失的 `deleteConversation` 仓库函数
- 为每个路由组编写完整的 API 集成测试
- 消息创建端点仅做持久化保存，SSE 流式推送留给模块 7（实时通信）

## Capabilities

### New Capabilities

- `agent-routes`: Agent 的列表、创建、详情接口
- `contact-routes`: 联系人的列表、创建、更新、删除接口
- `conversation-routes`: 会话的分页列表、创建、详情、更新、删除接口
- `message-routes`: 消息的 cursor 分页、发送、置顶接口
- `artifact-routes`: 产物的详情、预览接口
- `credential-routes`: 凭据的列表（脱敏）、创建、删除接口

### Modified Capabilities

<!-- No existing capabilities are being modified. -->

## Impact

- `apps/server/src/app.ts` — 注册新路由组
- `apps/server/src/routes/` — 新增 6 个路由文件
- `apps/server/src/__tests__/` — 新增 6 个测试文件 + 修改 helpers
- `packages/db/src/repositories/conversation.ts` — 补充 `deleteConversation`
- 不引入新依赖，全部使用已有依赖（Fastify + @agenthub/db + @agenthub/shared）
