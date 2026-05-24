## 1. Docker 数据库环境

- [x] 1.1 在项目根目录创建 `docker-compose.yaml`，定义 PostgreSQL 16 服务
- [x] 1.2 执行 `docker compose up -d` 启动数据库
- [x] 1.3 验证数据库连接：`docker compose exec postgres psql -U agenthub -d agenthub -c "SELECT 1"`

## 2. 包脚手架

- [x] 2.1 创建 `packages/db/package.json`，声明 `@agenthub/db` 包、依赖 `@prisma/client` + `@agenthub/shared`、devDeps `prisma` + `tsup` + `vitest` + `@types/node`
- [x] 2.2 创建 `tsconfig.json`，继承 `tooling/tsconfig/base.json`
- [x] 2.3 创建 `tsup.config.ts`，输出 ESM + CJS 双格式
- [x] 2.4 创建 `vitest.config.ts`
- [x] 2.5 创建 `.env` 和 `.env.example`，包含 `DATABASE_URL` 和 `TEST_DATABASE_URL`

## 3. Prisma Schema

- [x] 3.1 创建 `prisma/schema.prisma`，配置 PostgreSQL datasource 和 prisma-client-js generator
- [x] 3.2 定义 6 个枚举：`AgentProvider`、`ConversationType`、`SenderType`、`MessageType`、`ArtifactType`、`ArtifactStatus`
- [x] 3.3 定义 `User` 模型（id, name, email, passwordHash, avatarUrl, timestamps）
- [x] 3.4 定义 `Agent` 模型（id, name, avatarUrl, provider, systemPrompt, model, config Json, timestamps）
- [x] 3.5 定义 `Contact` 模型（id, userId→User, agentId→Agent, displayName, tags String[], isPinned），加 `@@unique([userId, agentId])`
- [x] 3.6 定义 `Conversation` 模型（id, title, type ConversationType, ownerId→User, contactIds String[], isArchived, lastActiveAt）
- [x] 3.7 定义 `Message` 模型（id, conversationId→Conversation, senderType, senderId, type, content, parentId 自引用, isPinned, metadata Json?）
- [x] 3.8 定义 `Artifact` 模型（id, messageId→Message, type, url?, content?, previewUrl?, status ArtifactStatus）
- [x] 3.9 定义 `UserCredential` 模型（id, userId→User, provider, encryptedKey）
- [x] 3.10 补全所有模型的关联关系声明和级联删除配置
- [x] 3.11 在 package.json 中添加 `db:generate`、`db:push` 脚本
- [x] 3.12 执行 `pnpm install`，执行 `prisma generate` 验证编译
- [x] 3.13 执行 `prisma db push` 同步 schema 到开发数据库和测试数据库

## 4. Prisma 客户端单例

- [x] 4.1 创建 `src/client.ts`：PrismaClient 全局单例，开发环境缓存到 globalThis
- [x] 4.2 创建 `src/index.ts` 统一导出入口

## 5. Agent 仓储

- [x] 5.1 创建 `src/repositories/agent.ts`：实现 `listAgents`（支持 provider 筛选）、`getAgent`、`createAgent`、`updateAgent`、`deleteAgent`
- [x] 5.2 创建 `src/repositories/index.ts` 统一导出
- [x] 5.3 创建 `src/__tests__/agent.test.ts`：集成测试每个 CRUD 函数

## 6. Contact 仓储

- [x] 6.1 创建 `src/repositories/contact.ts`：实现 `listContacts`（isPinned 排序）、`getContact`、`createContact`、`updateContact`、`deleteContact`
- [x] 6.2 创建 `src/__tests__/contact.test.ts`：集成测试，含唯一约束冲突测试

## 7. Conversation 仓储

- [x] 7.1 创建 `src/repositories/conversation.ts`：实现 `createConversation`、`getConversation`、`listConversations`（offset 分页、归档筛选）、`updateConversation`
- [x] 7.2 创建 `src/__tests__/conversation.test.ts`：集成测试，含分页和归档筛选

## 8. Message 仓储

- [x] 8.1 创建 `src/repositories/message.ts`：实现 `createMessage`（$transaction 更新会话时间）、`getMessage`、`listMessages`（游标分页）、`pinMessage`
- [x] 8.2 创建 `src/__tests__/message.test.ts`：集成测试，含游标分页和事务验证

## 9. Artifact 仓储

- [x] 9.1 创建 `src/repositories/artifact.ts`：实现 `listArtifacts`、`getArtifact`、`createArtifact`、`updateArtifact`
- [x] 9.2 创建 `src/__tests__/artifact.test.ts`：集成测试

## 10. UserCredential 仓储

- [x] 10.1 创建 `src/repositories/credential.ts`：实现 `listCredentials`、`getCredential`、`createCredential`、`deleteCredential`
- [x] 10.2 创建 `src/__tests__/credential.test.ts`：集成测试

## 11. 测试辅助基础设施

- [x] 11.1 创建 `src/__tests__/setup.ts`：全局 setup，`beforeAll` 连接测试库并 `db push`，`afterAll` 断开连接
- [x] 11.2 实现 `createTestClient` 辅助函数：创建连接到测试数据库的 PrismaClient
- [x] 11.3 配置 vitest 全局 setup 文件路径

## 12. Seed 脚本

- [x] 12.1 创建 `src/seed.ts`：创建默认用户（demo@agenthub.dev）、3 个预制 Agent（Claude/OpenCode/Custom）、示例联系人、示例会话和消息
- [x] 12.2 在 `package.json` 添加 `db:seed` 脚本，添加 `tsx` devDep
- [x] 12.3 执行 seed 脚本验证可用性

## 13. 全量验证

- [x] 13.1 `pnpm --filter @agenthub/db db:generate` 验证 schema 编译
- [x] 13.2 `pnpm --filter @agenthub/db build` 验证 tsup 构建
- [x] 13.3 `pnpm --filter @agenthub/db test` 验证全部集成测试通过
- [x] 13.4 `pnpm --filter @agenthub/db db:seed` 验证 seed 脚本执行成功
