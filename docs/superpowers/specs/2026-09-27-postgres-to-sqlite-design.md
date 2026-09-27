# PostgreSQL → SQLite 迁移设计

## 1. 概述

将业务数据库从 PostgreSQL 迁移到 SQLite，与长期记忆模块统一存储引擎，移除 PostgreSQL 容器依赖。

**核心理念**：统一**引擎**与**目录约定**，但保持**两个独立的数据库文件**。

长期记忆模块已经用 SQLite（better-sqlite3 + FTS5）存储，业务库却另起一个 PostgreSQL 容器 —— 对一个本地开发/演示为主的项目，这是纯粹的运维负担。迁移后 `docker compose up` 不再是启动前置条件。

**为什么是两个文件而不是一个**：Prisma 的 `db push` 不认识 FTS5 的影子表，会把它判定为 schema drift 并删除。这不是偏好问题，是实测出来的硬约束 —— 证据见 §7.1。

### 非目标

- ❌ 改造长期记忆模块（`packages/memory` 保持 better-sqlite3 + FTS5 现状，零改动）
- ❌ 弃用 Prisma 改写裸 SQL
- ❌ 支持 server 多实例横向扩展（SQLite 单写者，见 §7.6）
- ❌ 存量数据迁移（当前库中无真实数据，可直接重建）

## 2. 决策记录

| 决策点 | 选择 | 理由 |
|---|---|---|
| 统一程度 | 同引擎、双文件 | `db push` 会删 FTS5 影子表（§7.1） |
| 数组字段落地方式 | `Json` 列 | 读写形状不变，Prisma 负责序列化（§4.2） |
| 存量数据 | 不迁移，直接重建 | 无真实数据，省掉 ETL 与旧值兼容 |
| 迁移机制 | 保持 `db push` | 单人开发、无 `migrations/` 历史、可随时重建（§9） |
| `db:up` / `db:down` | 删除 | 语义失效，留着是误导 |
| SQLite 文件位置 | `<repo root>/.agenthub/` | 与 `memory.db` 同目录，`.agenthub/` 已在 `.gitignore` |

## 3. 存储布局

```
<repo root>/
└── .agenthub/                     ← 整个目录已在 .gitignore，本方案无需为其新增规则
    ├── agenthub.db                ← 新增：业务库，Prisma 管理
    ├── memory.db                  ← 现状：记忆库，better-sqlite3 管理
    ├── *.db-wal                   ← SQLite WAL 副产物，与数据文件同目录
    └── *.db-shm
```

### 3.1 环境变量

```bash
# ─── Database ─────────────────────────────────────────────────────────────────
# 注意：SQLite 的 file: 相对路径相对「schema.prisma 所在目录」解析，
#       不是相对 cwd。packages/db/prisma/ 往上三层即仓库根。
DATABASE_URL="file:../../../.agenthub/agenthub.db"
# 测试库同样相对 schema 目录，落在 packages/db/prisma/test.db
TEST_DATABASE_URL="file:./test.db"
```

`.env.example` 同步更新，**保留该注释** —— 这个路径基准不踩一次是猜不到的（§7.7）。

另需在 `.gitignore` 补充（当前只忽略了 `.agenthub/`）：

```
packages/db/prisma/*.db
packages/db/prisma/*.db-wal
packages/db/prisma/*.db-shm
```

### 3.2 路径的来源不一致说明

`apps/server/src/index.ts:14` 用 `path.resolve(__dirname, "../../../.agenthub/memory.db")` 显式指定记忆库路径，落在仓库根。业务库通过 `DATABASE_URL` 落在同一目录。两者一致。

> 注：`docs/superpowers/specs/2026-06-30-long-term-memory-design.md` 写的默认路径是 `~/.agenthub/memory.db`，与实际代码（`process.cwd()` 相对、server 显式覆盖为仓库根）不符。本设计以**代码实际行为**为准，该文档漂移不在本次范围内。

## 4. Schema 变更

### 4.1 provider

```diff
 datasource db {
-  provider = "postgresql"
+  provider = "sqlite"
   url      = env("DATABASE_URL")
 }
```

### 4.2 三个标量数组字段

SQLite 不支持标量数组，`prisma validate` 会报 P1012（证据见 §7.2）。改为 `Json`：

```diff
 model Contact {
-  tags          String[]      @default([])
+  tags          Json          @default("[]")
 }

 model PublishedAgent {
-  tags         String[]      @default([])
+  tags         Json          @default("[]")
 }

 model Conversation {
-  contactIds   String[]
+  contactIds   Json          @default("[]")
 }
```

**读写形状实测不变**：写入 `["a","b"]` 读回来是**真正的 JS 数组**（`Array.isArray` 为 `true`），不是 JSON 字符串。因此所有**写入点无需改动**。

变的是 **TypeScript 类型**：`string[]` → `JsonValue`，以及**过滤能力**（§7.3）。

### 4.3 经实测无需改动的部分

在 Prisma 6.19.3 上逐项验证通过：

| 特性 | 用法 | SQLite 下的表现 |
|---|---|---|
| `enum`（7 个） | `provider AgentProvider` | 落库为 `TEXT`，写入与 `where` 过滤均正常 |
| `Json` | `config` / `metadata` | 支持，列类型 `JSONB` |
| `String @id @default(cuid())` | 所有主键 | 正常 |
| `@updatedAt` | 多处 | 正常 |
| `@@index` | 多处 | 正常 |
| `onDelete: Cascade` | 关系 | 正常（需 `foreign_keys = ON`，Prisma 默认开启） |
| `onDelete: SetNull` | `Message.parent` | 正常 |
| 自引用关系 | `MessageParent` | 正常 |

## 5. 代码变更

### 5.1 新增 helper：`asStringArray`

`Json` 列读回来是 `JsonValue`，需要夹回 `string[]`。放在 `packages/shared/src/types/common.ts`（db 与 server 都依赖 `@agenthub/shared`）：

```typescript
/**
 * 把 Json 列读回的 JsonValue 收窄成 string[]。
 * 非数组或含非字符串元素时返回空数组 —— Json 列的值不受 schema 约束，
 * 不能假设它一定是合法数组。
 */
export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
```

放在 `types/common.ts` 而非新建文件，因为它是通用类型收窄工具，与 `ApiResponse` 同层。注意 `packages/shared` 目前通过 `export * from "./types/index.js"` 导出，`common.ts` 已在其中，无需改 index。

### 5.2 逐文件改动

| 文件 | 改动 |
|---|---|
| `packages/db/prisma/schema.prisma` | §4.1 + §4.2，共 4 行 |
| `packages/shared/src/types/common.ts` | 新增 `asStringArray` |
| `packages/db/src/repositories/market.ts:40` | **必须改** 删除 `mode: "insensitive"`（SQLite 无此参数，§5.4） |
| `packages/db/src/repositories/market.ts:46` | **必须重写** `where.tags = { has: options.tag }`（§5.3） |
| `packages/db/src/repositories/conversation.ts:135-161` | `addMembers` / `removeMembers` 中 `existing.contactIds` 包 `asStringArray()`。集合合并逻辑本身不变 |
| `apps/server/src/routes/messages.ts:365, 512, 907` | `conversation.contactIds` 包 `asStringArray()` |
| `apps/server/src/routes/conversations.ts:107` | 同上 |
| `.env` / `.env.example` | 两个 URL 换 `file:`（§3.1） |
| `docker-compose.yaml` | 删 `postgres` service 与 `pgdata` volume；**保留** `sandbox-init` profile |
| `package.json`（根） | 删 `db:up` / `db:down`（§2） |
| `.gitignore` | 补 `packages/db/prisma/*.db*`（§3.1） |
| `CLAUDE.md` | 更新 Commands 段（`db:up`/`db:down` 条目、Provider 说明） |
| `README.md` | 更新启动步骤：不再需要 `docker compose up` |
| `docs/architecture/Prisma与DB初始化流程.md` | 更新为 SQLite 流程 |

**无需改动**：`packages/db/src/seed.ts`、`repositories/contact.ts:78`、`repositories/market.ts:102` —— 写入侧形状不变。

### 5.3 market.ts 标签过滤的重写

现状（`packages/db/src/repositories/market.ts:45-47`）：

```typescript
if (options.tag) {
  where.tags = { has: options.tag };
}
```

SQLite 的 `Json` 过滤器**不支持** `array_contains` / `has`（可用选项全集见 §7.3）。**且备选方案也不成立** —— 对 Json 数组用 `string_contains` 做成员匹配实测返回空（见 §7.4），故**应用层过滤是唯一可行路径**：

```typescript
// Json 列在 SQLite 上无数组成员过滤能力，改为取回后在应用层过滤。
// 市场列表数据量小（PublishedAgent），且 listPublishedAgents 本就无分页，可接受。
if (options.tag) {
  const rows = await prisma.publishedAgent.findMany({ where, orderBy: [...], include: {...} });
  return rows.filter((r) => asStringArray(r.tags).includes(options.tag!));
}
```

**已确认无分页语义问题**：`listPublishedAgents` 是纯 `findMany`，带 `orderBy` 与 `include`，**没有 `take` / `skip`**。所以在 `findMany` 之后过滤不会造成「页内条数不足」—— 只需把过滤放在 `return` 前，保持 `orderBy` 顺序不变。

### 5.4 market.ts 删除 `mode: "insensitive"`

现状（`packages/db/src/repositories/market.ts:40`）：

```typescript
if (options.q) {
  where.name = { contains: options.q, mode: "insensitive" };
}
```

`mode: "insensitive"` 是 PostgreSQL / MongoDB 连接器专属的 `QueryMode`。SQLite 上运行会抛 `Unknown argument 'mode'`（见 §7.5）。改为：

```typescript
if (options.q) {
  where.name = { contains: options.q };
}
```

**行为不丢失**：SQLite 的 `LIKE` 对 ASCII 默认不区分大小写，实测 `contains: "claude"` 与 `contains: "Claude"` 都能命中 `"ClaudeCode"`（§7.5）。原意图（大小写不敏感搜索）得以保留。非 ASCII 无大小写概念，不受影响。

## 6. 测试策略

### 6.1 `fileParallelism` —— 结论：**不需要关闭**（初稿判断错误，已更正）

> **更正说明**：本节初稿要求给 `packages/db/vitest.config.ts` 补 `fileParallelism: false`，
> 理由是「并发的 7 个 `db push` 打同一个 SQLite 文件，**必然** SQLITE_BUSY」。
> 该结论是**推理而非实测**，实测后证明**是错的**，该配置已撤销。
> 保留这段以免后人重蹈。

实测（Prisma 6.19.3）：

| 模式 | 墙钟 | 结果 |
|---|---|---|
| 并行（`fileParallelism` 默认） | **1.5s** | 连跑 5 次，49 passed ×5，零冲突 |
| 串行（`fileParallelism: false`） | 4.1s | 49 passed |

关闭并行只是让测试**慢 2.7 倍**，没有换来任何稳定性。

**为什么推理错了**：Prisma 的 SQLite 连接器设置了 busy timeout，并发连接会**等待**而不是立即报错。
`db push` 本身很快，7 个文件的争用强度远不足以触发超时。我把「单写者」理解成了「立即失败」。

**留下的教训**：`SQLITE_BUSY` 是**可能出现**的，不是**必然出现**的。若将来换到更慢的机器或 CI、
测试量增大后真的出现 `SQLITE_BUSY` / `database is locked`，那时再加这个开关 —— 它是解药，但不是默认配置。

**`apps/server/vitest.config.ts` 的 `fileParallelism: false` 保持不动**：它在迁移前就存在，非本次引入。
实测并行也能全绿（1.49s vs 4.24s），所以它的存在理由不是 SQLite 争锁；更可能是防多个测试文件
对同一批表做 `deleteMany` 时的互相干扰（未复现）。改动既有行为不在本次范围，仅在配置里加了说明注释。

### 6.2 `packages/db/src/__tests__/setup.ts`

默认 URL 从 PG 连接串改为 `file:`；`db push` 调用与 `cwd` 不变（`cwd` 已是 `packages/db`，相对路径基准是 schema 目录，彼此独立）：

```diff
 export const TEST_DATABASE_URL =
   process.env["TEST_DATABASE_URL"] ||
-  "postgresql://agenthub:agenthub_dev@localhost:5432/agenthub_test";
+  "file:./test.db";
```

`--accept-data-loss` **建议保留**：测试库是一次性的，每次重建正是所需语义。但它与 §7.1 的共存风险相关 —— 测试库不含 memory 表，所以安全。

### 6.3 7 个 server 测试文件

`auth` / `credentials` / `contacts` / `conversations` / `messages` / `artifacts` / `agents`.test.ts 以及 `apps/server/vitest.config.ts` 里各有一份 hardcoded 的 PG 默认连接串，共 **8 处**（`packages/db/src/__tests__/setup.ts` 那处见 §6.2），统一改为 `"file:./test.db"`。

**不抽共享常量，就地把字面量改掉即可。** 理由：`apps/server` 与 `packages/db` 是两个独立包，为测试常量建一条跨包依赖，收益（少 8 处重复字面量）小于多出的耦合与间接层；且这些默认值只在「未设置 `TEST_DATABASE_URL` 环境变量」时才会用到 —— 正常情况下由 vitest 配置注入。

### 6.4 回归护栏

`pnpm --filter @agenthub/memory test` **必须保持全绿**。该模块零改动，它的测试通过即证明双文件方案没有误伤记忆存储。

## 7. 风险与实测证据

以下每条均为在 Prisma 6.19.3 上实际执行得到的结果，非推测。

### 7.1 `db push` 会删除 FTS5 影子表（双文件的根本原因）

在同一个 SQLite 文件中建好 Prisma 管理的表 + memory 的 `memory_records` / `memory_fts` 后执行 `prisma db push`：

```
⚠️  There might be data loss when applying the changes:

  • You are about to drop the `memory_fts_config` table, which is not empty (1 rows).

  • You are about to drop the `memory_fts_data` table, which is not empty (2 rows).


Error: Use the --accept-data-loss flag to ignore the data loss warnings like prisma db push --accept-data-loss
```

Prisma 不认识 FTS5 的内部影子表（`_data` / `_idx` / `_content` / `_config` / `_docsize`），把它当 schema drift。

**影响**：任何人跑一次 `db push --accept-data-loss` 就会清掉记忆索引。这是不可接受的单点风险，因此**必须双文件**。

### 7.2 标量数组不被支持

原 schema 直接切 provider 后 `prisma validate`：

```
Error: Prisma schema validation - (validate wasm)
Error code: P1012
error: Field "tags" in model "Contact" can't be a list. The current connector does not support lists of primitive types.
error: Field "tags" in model "PublishedAgent" can't be a list. ...
error: Field "contactIds" in model "Conversation" can't be a list. ...
Validation Error Count: 3
```

改掉这 3 处后 `validate` 通过、`db push` 成功。

### 7.3 SQLite 的 `Json` 不支持数组成员过滤

对 `Json` 字段尝试 `array_contains` 时，Prisma 返回的可用过滤器全集为：

```
?     equals?: Json | JsonFieldRefInput | JsonNullValueFilter,
?     path?: String,
?     mode?: QueryMode | EnumQueryModeFieldRefInput,
?     string_contains?: String | StringFieldRefInput,
?     string_starts_with?: String | StringFieldRefInput,
?     string_ends_with?: String | StringFieldRefInput,
?     array_starts_with?: Json | JsonFieldRefInput | Null,
?     array_ends_with?: Json | JsonFieldRefInput | Null,
?     not?: Json | JsonFieldRefInput | JsonNullValueFilter
```

**没有** `array_contains` 与 `has`。`array_starts_with` 只匹配数组开头，不适用于「包含某标签」。故 `market.ts` 必须重写（§5.3）。

### 7.4 `string_contains` 无法匹配 Json 数组成员

作为 §5.3 的备选方案验证：对 `Json` 数组字段用 `string_contains` 做带引号的精确成员匹配，**返回空结果**，即使标签确实存在：

```
string_contains '"coding"'   → []
string_contains '"favorite"' → []
string_contains '"co"'       → []
string_contains '"cod"'      → []
```

数据为 `A: ["coding","favorite"]` / `B: ["writing"]` / `C: ["co"]`。精确匹配 `"coding"` 都命不中，说明该过滤器**不作用于数组元素的序列化文本**。

**结论**：不存在 DB 层过滤 `Json` 数组成员的可行方案，应用层过滤是唯一路径（§5.3）。

### 7.5 `mode: "insensitive"` 在 SQLite 上不存在

`contains` 带 `mode` 传入时：

```
Unknown argument `mode`. Did you mean `lte`? Available options are marked with ?
```

**同时验证了去掉 `mode` 后行为仍符合原意** —— SQLite 的 `LIKE` 对 ASCII 默认不区分大小写：

```
contains "claude" → ["ClaudeCode"]     ← 小写查命中大驼峰
contains "Claude" → ["ClaudeCode"]     ← 大写查同样命中
```

故 §5.4 的处理是「删参数」，不是「接受功能降级」。

### 7.6 单写者

一个 SQLite 文件同一时刻只允许一个写事务。因此：

- server 不能多实例横向扩展（当前是单进程，可接受）
- 未来若 eval / sandbox 等新服务也要写业务库，必须与 server 同进程，或改用 client-server 型数据库

这是**已知且接受**的限制，需写入 `CLAUDE.md`，而非留作隐性知识。

### 7.7 `file:` 相对路径的解析基准

实测：`DATABASE_URL="file:../../../.agenthub/agenthub.db"` + schema 位于 `/tmp/p2/packages/db/prisma/` 时，文件落在 `/tmp/p2/.agenthub/agenthub.db`。

**基准是 schema.prisma 所在目录，不是 cwd。** 这意味着：

- 从仓库根还是 `packages/db` 执行 `db:push`，结果一致（好事）
- 但 `file:./agenthub.db` 会落到 `packages/db/prisma/` 而非 `.agenthub/`（易踩的坑，故 §3.1 要求保留注释）

### 7.8 enum 支持是版本相关的

Prisma 历史版本中 SQLite 不支持 `enum`。本次实测 6.19.3 **支持**（落库 `TEXT`，读写与过滤正常），故 7 个 enum 无需改动。

**这意味着 `package.json` 里的 `^6.0.0` 若被降到较低版本，schema 会验证失败。** 建议将 `packages/db/package.json` 与 `apps/server/package.json` 的 `prisma` / `@prisma/client` 收紧到 `^6.19.3`，或至少在 `CLAUDE.md` 记录该下限。

## 8. 验证清单

```bash
# 1. Schema 层
pnpm --filter @agenthub/db db:generate
pnpm --filter @agenthub/db db:push
pnpm --filter @agenthub/db db:seed

# 2. 单测全绿
pnpm --filter @agenthub/db test          # 7 个测试文件
pnpm --filter @agenthub/server test      # 共 15 个，其中 7 个用 DB
pnpm --filter @agenthub/memory test      # 回归护栏：必须仍全绿

# 3. 全仓
pnpm build && pnpm lint
```

**端到端**（核心收益断言）：**全程不启动 `docker compose`**

1. 起 server + web
2. 注册 / 登录
3. 建单聊 → 发消息 → 收到流式回复
4. 建**群聊**（走 `contactIds`，覆盖 Json 数组路径）→ 发消息
5. 查记忆接口，确认 `memory.db` 有写入（覆盖双文件并存）
6. `pnpm --filter @agenthub/db db:studio` 能打开并看到数据

任何一步需要 Docker，即为失败。

## 9. 何时切换到 `prisma migrate`

**本次不切换**，保持 `db push`。理由：单人开发、无 `migrations/` 历史、数据可随时重建 —— `migrate` 真正解决的问题当前都不存在。

**出现以下任一信号时切换**：

1. 需要把库部署到第二台机器（另一位开发者 / staging / 线上）
2. 库中出现不能丢的数据
3. 第二个人开始改 schema

**切换步骤**（届时成本不高）：

1. `pnpm --filter @agenthub/db exec prisma migrate dev --name init` —— 基于当前 schema 生成 baseline 迁移
2. 提交 `packages/db/prisma/migrations/`
3. `setup.ts` 的 `db push` 改为 `prisma migrate deploy --skip-generate`
4. 更新 `CLAUDE.md` 与 `.env.example`

**注意**：SQLite 的 `ALTER TABLE` 能力弱，Prisma 会用「建新表 → 拷数据 → 删旧表」实现加列/改类型。真走 `migrate` 时，生成的 SQL **需逐行 review**，尤其涉及数据回填时。（此项未实测，是使用 `migrate` 时才需关注的点。）

## 10. 实现阶段

### Phase 1：Schema 与存储（阻塞其余全部）

1. `schema.prisma` 改 provider + 3 个字段（§4）
2. `.env` / `.env.example` 改 URL 并加路径基准注释（§3.1）
3. `.gitignore` 补规则
4. `db:generate` + `db:push` + `db:seed` 跑通

### Phase 2：类型收窄

5. `packages/shared` 新增 `asStringArray`（§5.1）
6. `conversation.ts` / `messages.ts` / `conversations.ts` 包 helper（§5.2）

### Phase 3：market 过滤重写

7. 按 §5.3 改标签过滤为应用层过滤（已确认 `listPublishedAgents` 无分页，直接 `filter` 即可）
8. 按 §5.4 删除 `mode: "insensitive"`
9. 补/改 market 测试：标签过滤仍命中、大小写不敏感搜索仍生效

### Phase 4：测试基础设施

10. `packages/db/vitest.config.ts` 补 `fileParallelism: false`（§6.1）
11. 9 处 hardcoded URL 全改 `file:`：`packages/db/src/__tests__/setup.ts` + `apps/server` 的 8 处（§6.2 / §6.3）
12. 三个包测试全绿，含 memory 回归护栏

### Phase 5：清理与文档

13. `docker-compose.yaml` 删 postgres / pgdata
14. 根 `package.json` 删 `db:up` / `db:down`
15. 更新 `CLAUDE.md` / `README.md` / `docs/architecture/Prisma与DB初始化流程.md`
16. 记录 §7.6 单写者限制与 §7.8 Prisma 版本下限
17. 端到端验证（§8），确认全程无需 Docker

## 11. 实现记录（与设计的偏差）

本节记录实现过程中发现的、设计阶段未预见或判断有误之处。留档以免后人重复踩坑。

### 11.1 `db:push` / `db:seed` / `db:push:test` 在改造前就是坏的

§8 把「`pnpm db:push` 跑通」写成了验证前提，**这个前提本身不成立**。实测三个脚本全部失败：

```
db:push      → ❌ Environment variable not found: DATABASE_URL
db:seed      → ❌ Environment variable not found: DATABASE_URL
db:push:test → ❌ DATABASE_URL resolved to an empty string
```

根因：**Prisma CLI 只读 `(cwd)/.env` 和 `(schema 目录)/.env`，不会向上查找仓库根的 `.env`**，
而 `packages/db/` 下只有 `.env.example`（无 `.env`）。`db:push:test` 里的
`DATABASE_URL=$TEST_DATABASE_URL` 依赖 shell 展开，同样拿不到根 `.env` 的值。

这与 SQLite 无关 —— 在 PostgreSQL 时代就已经是坏的，只是没人从干净环境跑过。

**解法（设计外新增）**：新增 `packages/db/scripts/with-env.mjs`，显式加载根 `.env` 再转发命令；
`packages/db` 增加 `dotenv` devDependency（与 `apps/server` 同版本 `^16`）。脚本改为：

```json
"db:push":      "node scripts/with-env.mjs prisma db push",
"db:push:test": "node scripts/with-env.mjs --test prisma db push",
"db:seed":      "node scripts/with-env.mjs tsx src/seed.ts"
```

选这个方案而非 `dotenv-cli`（多一个依赖、`db:push:test` 要套 `sh -c`）或
`packages/db/.env`（制造第二份真相源），是为了守住「根 `.env` 单一配置来源」。

**同时删除 `packages/db/.env.example`** —— PG 时代的遗留（端口 5432，而根 `.env` 用的是 5433），
与单一来源设计直接冲突。

### 11.2 §5.2 漏掉了一处 `has` 过滤

除 `market.ts:46` 外，还有**第二处** Prisma 数组过滤器：

```
packages/db/src/repositories/conversation.ts:89   findSingleConversationByAgentId
  contactIds: { has: agentId }
```

全仓 `has:` / `hasSome:` / `hasEvery:` / `isEmpty:` 共两处，§5.2 只列了一处。
已一并改为应用层过滤（去掉 `take: 1`，因为过滤发生在取回之后）。

### 11.3 §5.2 有一处列错了

`apps/server/src/routes/conversations.ts:107` 的 `contactIds: body.contactIds ?? []` 是**写入**，
形状不变，**不需要改**。该文件里也没有任何 `conversation.contactIds` 的读取
（`:57` 是请求体）。实际只需改 `apps/server/src/routes/messages.ts` 的 3 处读取。

### 11.4 补充的测试（TDD）

§5.3 / §5.2 涉及的路径**原本没有任何测试覆盖**，因此先补测试再改实现。新增 7 个：

| 文件 | 新增测试 |
|---|---|
| `market.test.ts` | 标签过滤命中、标签按完整元素匹配（非子串）、名称搜索大小写不敏感 |
| `conversation.test.ts` | `findSingleConversationByAgentId` 命中 / 未命中、成员去重添加、成员移除 |

其中「标签按完整元素匹配」是为了钉住旧 `has` 的语义 —— 若将来有人改成子串匹配，
该测试会红。「名称搜索大小写不敏感」覆盖了 `mode: "insensitive"` 删除后的行为等价性。

发现的既有测试盲区：原有的「should search published agents by name」用的是大小写完全匹配的
关键词，所以 `mode: "insensitive"` 一旦在 SQLite 上抛错，它才会红 —— 这也是唯一的信号。

### 11.5 断言的修正

- `packages/db` 测试文件是 **7 个**（§6.1 初稿写 8）
- 硬编码 PG URL 共 **9 处**（`packages/db/src/__tests__/setup.ts` 1 处 + `apps/server` 8 处）
- `packages/db/vitest.config.ts` 原来没有 `fileParallelism: false`（`apps/server` 有）。初稿据此要求补上，**实测后撤销**，详见 §6.1

### 11.6 类型检查基线

用 `git stash` 对比 HEAD 基线，实测两个包的类型错误数：

| 包 | HEAD | 现在 | 说明 |
|---|---|---|---|
| `packages/db` | 24 | **17** | 消掉 5 个源码层错误（`mode`、两处 `has`、`JsonValue` 不可迭代等） |
| `apps/server` | 16 | **10** | 消掉 6 个，全部是 `messages.ts` 的 `contactIds` JsonValue 错误 |

`apps/server` 的 `diff` 输出只有删除行、无任何新增，即剩余 10 个与 HEAD 逐字一致。

`packages/db` 改动前后的错误数 **24 → 17**：

- 消除的 5 个全部是 SQLite 不兼容所致，正是本次目标
  （`mode`、两处 `has`、`JsonValue` 不可迭代等），**源码层现在零错误**
- 剩余 17 个**全部在测试文件里**，且与本次改动无关（vitest globals 不在 tsconfig types、
  `ConversationType` 枚举字面量、`include` 未反映到返回类型、未使用变量），改造前就存在
- 新增的测试**没有引入任何新错误**（用 `ConversationType.Single` 枚举成员而非字符串字面量）

**合计消除 11 个源码层错误，新增 0 个。**

最终测试结果：`apps/server` 128 个、`packages/db` 49 个、`packages/memory` 27 个、
`packages/shared` 9 个、`packages/ui` 10 个 —— 全部通过。

未碰的两个包有**既有失败**，与本次无关：`packages/agent-core` 的
`chunk-parser.test.ts` 存在括号不配对的语法错误（`Unexpected end of file`）；
`apps/web` 39 个测试因渲染时缺少 `AuthProvider` 包裹而失败。

### 11.7 一处未经实测的断言被推翻

§6.1 初稿断言 db 测试并行「**必然** SQLITE_BUSY」，并据此要求关闭 `fileParallelism`。
这是本次唯一一处**推理代替实测**的地方，而它错了：并行实测 1.5s/5 次全绿，串行 4.1s。
该配置已撤销，§6.1 已改写为更正说明。

教训：本次其余结论都跑了实验，唯独这条靠「单写者」的字面推理 —— 而「单写者」的准确含义是
**写操作会排队**，不是**立即失败**。凡是下了「必然 / 一定」这种判断，都该有一条实测撑着。

### 11.7 首次跑 server 套件会超时（非本次引入）

首次完整跑 `apps/server` 套件时 `agents.test.ts` 的 `beforeAll` 超时 30s，套件耗时 124s；
清理残留后重跑为 **3.78s 全绿**。

原因叠加：冷启动开销 + 上一轮超时未执行 `afterAll`，导致
`test.ag.server@example.com` 残留在测试库中，下一轮 `createTestUser` 撞
`Unique constraint failed: (email)`。

**测试库在轮次之间不复位**是既有行为（库中可见 `artifact-test-*`、`cred-test-*` 等历史残留）。
若某轮失败，残留数据可能污染下一轮 —— 排查时先清库。这与 SQLite 无关，但 SQLite 下更容易被注意到，
因为测试库现在是一个可随手打开的文件。
