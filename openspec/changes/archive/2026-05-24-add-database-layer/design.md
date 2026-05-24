## Context

AgentHub 当前已完成 monorepo 基础搭建和共享类型包（`@agenthub/shared`），shared 包已定义了所有枚举和核心领域实体类型。数据库层需要将这些类型定义映射为 Prisma schema，并提供完整的 CRUD 仓储函数。

技术栈已确定：Prisma ORM + PostgreSQL 16。开发环境通过 Docker Compose 管理本地 PostgreSQL 实例。项目使用 Turborepo 管理多包构建。

## Goals / Non-Goals

**Goals:**
- 定义 7 个数据模型的 Prisma schema（User、Agent、Contact、Conversation、Message、Artifact、UserCredential）
- 6 个枚举映射（AgentProvider、ConversationType、SenderType、MessageType、ArtifactType、ArtifactStatus）
- 实现 6 个仓储的完整 CRUD 函数（Agent、Contact、Conversation、Message、Artifact、UserCredential）
- Prisma 客户端单例模式，防止热重载多实例
- 基于真实 PostgreSQL 数据库的集成测试，使用事务回滚隔离
- Docker Compose 管理开发数据库
- Seed 脚本用于开发环境快速填充

**Non-Goals:**
- 不包含数据库连接池调优（生产环境按需配置）
- 不包含跨表复杂查询（如消息全文搜索）
- 不包含数据迁移回滚策略开发场景
- 不包含数据库备份和恢复方案

## Decisions

### Decision 1: 包构建使用 tsup 输出 ESM + CJS 双格式

**Why**: 与 `@agenthub/shared` 包构建方式一致，server 端需要 CJS，UI 端需要 ESM。tsup 基于 esbuild，构建速度快，配置简洁。

### Decision 2: 仓储函数接受可选的 PrismaClient 参数

```typescript
export function createConversation(
  data: CreateConversationInput,
  tx: PrismaClient | Omit<PrismaClient, '$transaction' | '$connect' | '$disconnect' | '$on' | '$use' | '$extends'> = prisma
)
```

**Why**: 集成测试需要注入 test client 或 transaction client，生产环境使用默认全局单例。这个模式让测试无需 mock，直接操作真实数据库。

### Decision 3: 消息使用游标分页，会话使用 offset 分页

**Why**: 消息列表是无限滚动场景，游标分页在 deep page 性能更优且避免插入新数据导致偏移。会话列表通常不超过几十条，offset 分页实现简单且支持跳页。

### Decision 4: Conversation 使用 contactIds String[] 数组字段代替中间表

**Why**: Prisma 原生支持 PostgreSQL 的数组类型。会话-联系人关系简单，不需要额外的关联属性。避免 join 中间表的查询开销。

### Decision 5: 集成测试使用事务回滚实现数据隔离

```
┌─ Test 1 ─────────────────┐
│  prisma.$transaction()   │
│    → 插入测试数据          │
│    → 断言结果              │
│    → rollback (抛异常)    │
└──────────────────────────┘
```

**Why**: 每个测试用例在一个独立事务中执行，测试结束时主动回滚，数据自动清理。比 beforeEach drop 表或 truncate 快得多，且支持并行测试。

### Decision 6: UserCredential.encryptedKey 存储为明文（加密在调用方）

**Why**: 加密逻辑属于 user-auth 模块职责，db 包只负责存储。保持单一职责，避免 db 包引入加密依赖。

### Decision 7: 开发环境使用 `prisma db push` 替代 `prisma migrate`

**Why**: 开发阶段 schema 迭代频繁，`db push` 无需生成迁移文件，快速同步 schema。正式发布时再使用 `prisma migrate` 管理迁移版本。

## Risks / Trade-offs

- **[测试数据库并发冲突]** → 每个测试用例在事务中运行，结束后回滚，数据完全隔离。Vitest 顺序执行测试文件，避免跨文件数据竞争。
- **[Prisma 数组字段兼容性]** → `contactIds` 使用 PostgreSQL 数组类型，不可移植到 SQLite。当前已确定使用 PostgreSQL，风险可控。
- **[游标分页实现复杂度]** → 相比 offset 分页，游标分页需要前端配合传递 lastCursor。Message list 返回 `{ data: Message[], nextCursor: string | null }` 结构。
