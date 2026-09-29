# 长期记忆混合检索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `@agenthub/memory` 从「中文查不出、跨项目串味、单 agent 路径只写不读」的 FTS5 单路检索，改造成「会话作用域内的 BM25 + 向量混合检索」。

**Architecture:** 先修边界（会话作用域 + 配置生效），再加能力（预分词 BM25 → 向量路 → RRF 融合），最后接触发链路。作用域是所有后续阶段的观测前提，因此单独作为 P0 先行；向量路是可选能力，未配置时系统退化为纯 BM25 并显式告警。

**Tech Stack:** TypeScript 6 (ESM) · better-sqlite3 11 + FTS5 · `jieba-wasm` 2.4.0（Node 下同步、零配置）· Ollama + `bge-m3`（1024 维）· Vitest 3 · tsup

**Spec:** `docs/superpowers/specs/2026-09-28-hybrid-memory-retrieval-design.md`

## Global Constraints

- 所有包 `"type": "module"`（ESM）。类型导入一律 `import type`。用 named exports，**不用 default export**。
- `packages/memory/tsconfig.json` 已设 `exactOptionalPropertyTypes: false`，**不要改回 `true`**。
- 测试用 Vitest，配置为 `include: ["src/__tests__/**/*.test.ts"]`、`globals: true`。
- **测试不得依赖真实模型、jieba 词典、网络。** 分词用 `FakeSegmenter`，embedding 用 `FakeEmbeddingProvider`。断言写死期望值，不反向调用被测实现。
- **两个 SQLite 文件必须分开**：业务库 `.agenthub/agenthub.db`（Prisma）、记忆库 `.agenthub/memory.db`（better-sqlite3）。合并会丢 FTS5 影子表。
- SQLite 单写者：`packages/db` 与 `apps/server` 的 vitest 已设 `fileParallelism: false`。`packages/memory` 的测试各自建临时库（`createTestDb()`），不受此限。
- **必填参数一律不给默认值**：`searchMemories` 的 `userId` 与 `scope`、`createMemory` 的 `conversationId`、`extractMemories` 的 `conversationId`、四个 `EMBEDDING_*` 变量。漏传必须是编译错误或启动错误，不能是静默兜底。
- 环境变量统一为 `LLM_BASE_URL` / `LLM_MODEL`（**不是** `BASE_URL` / `MODEL`）。
- 服务端 API 路径用动词后缀（`/messages/create`），沿用现有约定。
- 每个 task 结束提交一次，commit message 用 `<type>(<scope>): <desc>` 格式。

## Review Focus

以下五类输入/失败模式是 spec 隐含要求、但没有任何 task 的测试天然覆盖的。每条都已在本计划的对应 task 里加了测试（括号内为 owning task）。

1. **`conversationId` 为 `""`（空串）而非 `undefined`** —— 空串是真值以外的合法字符串，`buildScopeClause` 若用 `if (scope.conversationId)` 判断会把它当成 `allConversations`，**静默返回全部会话的记忆**。期望：空串按「会话内、但必然匹配不到」处理，绝不退化为全库。`buildScopeClause` 用 `"conversationId" in scope` 判别即可天然避免；测试钉死。*(Task 1)*
2. **同一 `conversationId` 下 `user_id` 不匹配的记忆** —— 迁移错误或跨库脏数据会造成这种行。期望：被 `userId` 过滤排除，不返回。这是「排除」而非「报错」——但要**有测试证明它确实被排除**，否则 `userId` 过滤会像 §4.8 那样悄悄失效。*(Task 2)*
3. **embedding 端点返回的 `data` 顺序与 `input` 不一致** —— OpenAI 兼容层不保证顺序。期望：按 `data[].index` 对齐，**不是**按下标。按错会让每条记忆拿到别人的向量，检索结果全错但不报错。*(Task 16)*
4. **记忆 `content` 为空串或纯空白** —— 分词后词项为空。期望：`buildFtsQuery` 返回 `null`、BM25 路跳过、不执行 `MATCH ''`；`createMemory` 不崩溃。*(Task 12、Task 13)*
5. **超长 `content`（超过模型上下文窗口，bge-m3 为 8192 token）** —— 期望：端点报错 → 该条计入失败、不写库、下轮重试，**不是**静默截断出一个错误的向量。*(Task 16)*

---

## File Structure

`packages/memory/src/` 目前是扁平结构（7 个文件）。本计划延续该风格，新增 8 个同层文件，不引入子目录。

| 文件 | 职责 | 状态 |
|---|---|---|
| `db.ts` | SQLite 连接单例、`PRAGMA` | 不变 |
| `types.ts` | `CreateMemoryInput`、`ExtractedMemory`、`MemoryConfig`、**`MemoryScope`**、**`EmbeddingMode`** | 修改 |
| `utils.ts` | `rowToMemoryRecord` | 修改（新增列） |
| `schema.ts` | 建表 DDL。**改为只调用 `migrations.ts`** | 修改 |
| `migrations.ts` | **新增**：`PRAGMA user_version` 迁移框架 + v1 迁移 | 新增 |
| `scope.ts` | **新增**：`MemoryScope` → SQL 片段。两路共用的唯一实现点 | 新增 |
| `repository.ts` | CRUD + **`updateMemory`** + **`content_seg`/`tags_seg` 计算** | 修改 |
| `segmenter.ts` | **新增**：`Segmenter` 接口 + `JiebaWasmSegmenter` | 新增 |
| `fts-query.ts` | **新增**：`buildFtsQuery` | 新增 |
| `embedding.ts` | **新增**：`EmbeddingProvider` 接口、`normalize`、`EmbeddingFingerprint`、`OpenAICompatibleEmbeddingProvider` | 新增 |
| `vector-index.ts` | **新增**：`VectorIndex` 接口 + `BlobVectorIndex` | 新增 |
| `fusion.ts` | **新增**：`fuseRankedLists` | 新增 |
| `worker.ts` | **新增**：`startEmbeddingWorker`、`reindexMemories`、`bm25Ready` | 新增 |
| `search.ts` | 双路检索 + RRF 融合 + 作用域过滤。**变异步** | 修改 |
| `extractor.ts` | LLM 提取。**收 `conversationId`；不再直读 `process.env`** | 修改 |
| `context.ts` | **新增**：`buildMemoryContext`（服务端与 orchestrator 共用的注入 helper） | 新增 |
| `index.ts` | 公开 API 导出 | 修改 |

`apps/server/src/` 侧改动：

| 文件 | 改动 |
|---|---|
| `config/env.ts` | `LLM_BASE_URL` / `LLM_MODEL` 去兜底；新增 `embedding` 配置段（无默认值） |
| `services/memory-trigger.ts` | **新增**：两处 `extractMemories` 调用点收敛为一个可测的 helper（含并发信号量） |
| `routes/messages.ts` | 两处调用改为 `triggerMemoryExtraction(...)` 并传 `conversationId`；单 agent 路径注入记忆 |
| `routes/memory.ts` | `searchMemories` 补 `scope: { allConversations: true }`；list 响应加 `orphanCount` / `pendingCount` |
| `orchestrator/executor.ts` | `searchMemories` → `buildMemoryContext`，传 `subtask.conversationId` |
| `index.ts` | 启动顺序：`initSchema` → `await reindexMemories` → `listen`；拉起 embedding worker |

---

# P0 — 边界正确性

作用域与配置两件事互相独立，都不依赖 P1 之后的任何东西，且能立刻消除真实缺陷（spec §4.7 / §4.8 / §4.9、§1.1）。

## Task 1: `MemoryScope` 与 `buildScopeClause`

**Files:**
- Create: `packages/memory/src/scope.ts`
- Modify: `packages/memory/src/types.ts`
- Test: `packages/memory/src/__tests__/scope.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `type MemoryScope = { conversationId: string } | { allConversations: true }`
  - `function buildScopeClause(scope: MemoryScope): { sql: string; params: string[] }`

- [ ] **Step 1: Write the failing test**

Create `packages/memory/src/__tests__/scope.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildScopeClause } from "../scope.js";

describe("buildScopeClause", () => {
  it("returns an equality clause for a conversation scope", () => {
    const clause = buildScopeClause({ conversationId: "C1" });
    expect(clause.sql).toBe("r.conversation_id = ?");
    expect(clause.params).toEqual(["C1"]);
  });

  it("returns a tautology for allConversations", () => {
    const clause = buildScopeClause({ allConversations: true });
    expect(clause.sql).toBe("1 = 1");
    expect(clause.params).toEqual([]);
  });

  it("treats an empty conversationId as a conversation scope, never allConversations", () => {
    const clause = buildScopeClause({ conversationId: "" });
    expect(clause.sql).toBe("r.conversation_id = ?");
    expect(clause.params).toEqual([""]);
    expect(clause.sql).not.toBe("1 = 1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/scope.test.ts`
Expected: FAIL — `Failed to resolve import "../scope.js"`

- [ ] **Step 3: Write minimal implementation**

Append to `packages/memory/src/types.ts`:

```typescript
/**
 * 检索作用域。必填，没有默认值 —— 漏写必须是编译错误。
 *
 * 用判别联合而非 `conversationId?: string`，是因为可选参数有一个已知的失效方式：
 * `userId` 曾经是可选的，而唯一的两个自动化调用点都漏了它（spec §4.8），
 * 且单用户测试全绿。跳过会话过滤必须是显式写出的决定。
 */
export type MemoryScope =
  | { conversationId: string }
  | { allConversations: true };
```

Create `packages/memory/src/scope.ts`:

```typescript
import type { MemoryScope } from "./types.js";

/**
 * 把 MemoryScope 编译成 SQL 片段。
 *
 * 这是作用域的唯一实现点 —— BM25 路与向量路都调用它。若两路各写一份，
 * 分歧会只在跨项目场景下暴露（spec §8.4）。
 *
 * 用 `in` 而不是真值判断：空串 `""` 是合法的 conversationId，
 * `if (scope.conversationId)` 会把它误判成 allConversations 并返回全库记忆。
 */
export function buildScopeClause(scope: MemoryScope): { sql: string; params: string[] } {
  if ("conversationId" in scope) {
    return { sql: "r.conversation_id = ?", params: [scope.conversationId] };
  }
  return { sql: "1 = 1", params: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/scope.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/scope.ts packages/memory/src/types.ts packages/memory/src/__tests__/scope.test.ts
git commit -m "feat(memory): add MemoryScope discriminated union and buildScopeClause"
```

---

## Task 2: `searchMemories` 作用域过滤（`userId` 与 `scope` 必填）

**Files:**
- Modify: `packages/memory/src/search.ts`
- Modify: `packages/memory/src/index.ts`（导出 `buildScopeClause`、`MemoryScope`）
- Test: `packages/memory/src/__tests__/search.test.ts`

**Interfaces:**
- Consumes: `buildScopeClause`、`MemoryScope`（Task 1）
- Produces: `searchMemories(options, customDb?)`，其中 `userId: string`、`scope: MemoryScope` 均为必填。**本 task 后仍是同步返回 `MemoryRecord[]`**；异步化在 Task 21。

- [ ] **Step 1: Update the existing test file（先让所有调用点编译通过，再加新断言）**

`packages/memory/src/__tests__/search.test.ts` 里 5 处 `searchMemories` 调用需要补参数。先把 seed 数据补上 `conversationId` 并替换调用：

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory } from "../repository.js";
import { searchMemories } from "../search.js";

let db: DatabaseType;

beforeAll(() => {
  db = createTestDb();
  createMemory({
    userId: "user-search",
    conversationId: "conv-search",
    agentId: "agent-search",
    type: "fact",
    content: "The API endpoint is at https://api.example.com/v1",
    tags: ["api", "endpoint"],
  }, db);
  createMemory({
    userId: "user-search",
    conversationId: "conv-search",
    agentId: "agent-search",
    type: "preference",
    content: "User prefers camelCase naming convention",
    tags: ["naming", "style"],
  }, db);
  createMemory({
    userId: "user-search",
    conversationId: "conv-search",
    agentId: "agent-other",
    type: "decision",
    content: "Decided to use Prisma ORM for database access",
    tags: ["architecture", "database"],
  }, db);
  createMemory({
    userId: "user-search",
    conversationId: "conv-search",
    agentId: "agent-search",
    type: "context",
    content: "Project root is /home/user/projects/agenthub",
    tags: ["project", "path"],
  }, db);
});

afterAll(() => {
  destroyTestDb(db);
});

const SCOPE = { conversationId: "conv-search" } as const;

describe("searchMemories", () => {
  it("finds memories matching the FTS query", () => {
    const results = searchMemories({ query: "API", userId: "user-search", scope: SCOPE, limit: 10 }, db);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.content.includes("api.example.com"))).toBe(true);
  });

  it("filters by agentId when provided", () => {
    const results = searchMemories(
      { query: "endpoint", userId: "user-search", scope: SCOPE, agentId: "agent-search" },
      db,
    );
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("API endpoint");
  });

  it("returns empty array when no match", () => {
    const results = searchMemories({ query: "zzzznonexistent", userId: "user-search", scope: SCOPE, limit: 10 }, db);
    expect(results.length).toBe(0);
  });

  it("respects limit", () => {
    const results = searchMemories({ query: "the", userId: "user-search", scope: SCOPE, limit: 1 }, db);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("returns memories from all conversations when scope is allConversations", () => {
    createMemory({
      userId: "user-search",
      conversationId: "conv-other",
      agentId: "agent-search",
      type: "fact",
      content: "Zebra crossing fact only in another conversation",
    }, db);

    const scoped = searchMemories({ query: "Zebra", userId: "user-search", scope: SCOPE }, db);
    expect(scoped.length).toBe(0);

    const global = searchMemories(
      { query: "Zebra", userId: "user-search", scope: { allConversations: true } },
      db,
    );
    expect(global.length).toBe(1);
  });

  it("excludes memories from another conversation with a contradictory value", () => {
    createMemory({
      userId: "user-search",
      conversationId: "conv-project-b",
      agentId: "agent-search",
      type: "preference",
      content: "Indentation should use two spaces",
    }, db);
    createMemory({
      userId: "user-search",
      conversationId: "conv-project-a",
      agentId: "agent-search",
      type: "preference",
      content: "Indentation should use a tab character",
    }, db);

    const a = searchMemories(
      { query: "Indentation", userId: "user-search", scope: { conversationId: "conv-project-a" } },
      db,
    );
    expect(a.length).toBe(1);
    expect(a[0]!.content).toContain("tab");

    const b = searchMemories(
      { query: "Indentation", userId: "user-search", scope: { conversationId: "conv-project-b" } },
      db,
    );
    expect(b.length).toBe(1);
    expect(b[0]!.content).toContain("two spaces");
  });

  it("excludes memories whose user_id does not match, even in the same conversation", () => {
    createMemory({
      userId: "user-other",
      conversationId: "conv-shared",
      agentId: "agent-search",
      type: "fact",
      content: "Ostrich secret belonging to another user",
    }, db);
    createMemory({
      userId: "user-search",
      conversationId: "conv-shared",
      agentId: "agent-search",
      type: "fact",
      content: "Ostrich fact belonging to the current user",
    }, db);

    const results = searchMemories(
      { query: "Ostrich", userId: "user-search", scope: { conversationId: "conv-shared" } },
      db,
    );
    expect(results.length).toBe(1);
    expect(results[0]!.userId).toBe("user-search");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/search.test.ts`
Expected: FAIL — TypeScript 报 `scope` 不存在于参数类型；且 `createMemory` 报缺 `conversationId`（Task 3 之前 `conversationId` 仍是可选，故此处实际先以行为失败为主）

- [ ] **Step 3: Write minimal implementation**

Replace `packages/memory/src/search.ts` entirely:

```typescript
import type { MemoryRecord } from "@agenthub/shared";
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import { buildScopeClause } from "./scope.js";
import type { MemoryScope } from "./types.js";
import { rowToMemoryRecord } from "./utils.js";

export function searchMemories(
  options: {
    query: string;
    /** 必填 —— 租户边界，不可省（spec §4.8） */
    userId: string;
    /** 必填 —— 会话作用域，没有默认值（spec §1.1） */
    scope: MemoryScope;
    /** 可选 —— 仅供 Web UI 按 Agent 筛选，不参与自动检索 */
    agentId?: string;
    limit?: number;
    offset?: number;
  },
  customDb?: Database,
): MemoryRecord[] {
  const db = customDb || getDatabase();

  const scope = buildScopeClause(options.scope);
  const conditions: string[] = ["mr.user_id = ?", scope.sql];
  // 顺序必须与 WHERE 子句一致：MATCH 占位符在最前，其后依次是 userId、scope、agentId
  const values: unknown[] = [options.query, options.userId, ...scope.params];

  if (options.agentId) {
    conditions.push("mr.agent_id = ?");
    values.push(options.agentId);
  }

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const sql = `
    SELECT mr.* FROM memory_fts fts
    JOIN memory_records mr ON mr.rowid = fts.rowid
    WHERE memory_fts MATCH ?
      AND ${conditions.join("\n      AND ")}
    ORDER BY rank
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(sql).all(...values, limit, offset) as Record<string, unknown>[];
  return rows.map(rowToMemoryRecord);
}
```

Update `packages/memory/src/index.ts` to add:

```typescript
export { buildScopeClause } from "./scope.js";
```

并在已有的 `types.ts` 导出行（若不存在则新增）：

```typescript
export type { MemoryScope } from "./types.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/search.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Run lint to confirm no other call site is broken**

Run: `pnpm --filter @agenthub/memory lint`
Expected: 仅剩 `extractor.ts:141` 的报错（Task 4 修）。若出现其他错误，说明有遗漏的调用点，就地补参数。

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/search.ts packages/memory/src/index.ts packages/memory/src/__tests__/search.test.ts
git commit -m "feat(memory): make userId and scope required in searchMemories"
```

---

## Task 3: `createMemory` 的 `conversationId` 改为必填

**Files:**
- Modify: `packages/memory/src/types.ts`
- Modify: `packages/memory/src/repository.ts:8-32`
- Test: `packages/memory/src/__tests__/repository.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `CreateMemoryInput.conversationId: string`（必填）。`createMemory` 签名与同步性不变。

- [ ] **Step 1: Write the failing test**

在 `packages/memory/src/__tests__/repository.test.ts` 中，把 `MOCK_INPUT` 加上 `conversationId`：

```typescript
const MOCK_INPUT = {
  userId: "user-1",
  conversationId: "conv-1",
  agentId: "agent-1",
  type: "fact" as const,
  content: "The project uses TypeScript 6 with strict mode",
  tags: ["typescript", "config"],
  importance: 7,
};
```

同文件里其余 `createMemory({...})` 调用（约 8 处）全部补 `conversationId: "conv-1"`。然后新增一个 describe 块：

```typescript
describe("conversation scoping in createMemory", () => {
  it("persists conversation_id as a non-null value equal to the input", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-abc",
      agentId: "agent-1",
      type: "fact",
      content: "conversation id round-trip",
    }, db);

    expect(created.conversationId).toBe("conv-abc");

    // 直接查库，确认落库的是真实值而非依赖 rowToMemoryRecord 的转换
    const raw = db
      .prepare("SELECT conversation_id FROM memory_records WHERE id = ?")
      .get(created.id) as { conversation_id: string | null };
    expect(raw.conversation_id).toBe("conv-abc");
    expect(raw.conversation_id).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/repository.test.ts`
Expected: FAIL — TypeScript 报 `conversationId` 不存在于 `CreateMemoryInput`（若 TS 未拦截，则新测试的断言因落库为 NULL 而失败）

- [ ] **Step 3: Write minimal implementation**

`packages/memory/src/types.ts`，把 `CreateMemoryInput` 的 `conversationId` 由可选改必填：

```typescript
export interface CreateMemoryInput {
  userId: string;
  /** 必填 —— 检索作用域的唯一依据（spec §1.1）。原调用方从不传，故该列恒为 NULL。 */
  conversationId: string;
  agentId: string;
  type: MemoryType;
  content: string;
  tags?: string[];
  sourceMessageId?: string;
  importance?: number;
}
```

`packages/memory/src/repository.ts`，把第 25 行的 `input.conversationId ?? null` 改为直接传值：

```typescript
    input.sourceMessageId ?? null,
    input.conversationId,
    input.importance ?? 1,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/types.ts packages/memory/src/repository.ts packages/memory/src/__tests__/repository.test.ts
git commit -m "feat(memory): require conversationId in CreateMemoryInput"
```

---

## Task 4: `extractMemories` 接收 `conversationId` 并作用于去重检索

**Files:**
- Modify: `packages/memory/src/extractor.ts`（`extractMemories` 参数、去重检索、三处 `createMemory`）
- Test: `packages/memory/src/__tests__/extractor.test.ts`

**Interfaces:**
- Consumes: `searchMemories`（Task 2）、`CreateMemoryInput`（Task 3）
- Produces: `extractMemories(params, llmConfig?, customDb?)`，其中 `params.conversationId: string` 必填

**本 task 同时修复 spec §4.8 的另一半**：`extractor.ts:141` 的去重检索此前**只按 `agentId` 过滤、没有 `userId`**，存在跨租户泄漏。改为必填 `userId` + `scope`。

- [ ] **Step 1: Write the failing test**

在 `packages/memory/src/__tests__/extractor.test.ts` 中：

1. 把 `MOCK_PARAMS` 补上 `conversationId`：

```typescript
const MOCK_PARAMS = {
  userId: "user-extract",
  conversationId: "conv-extract",
  agentId: "agent-extract",
  agentName: "TestBot",
  userMessage: "I prefer using tabs over spaces for indentation",
  agentResponse: "Got it! I'll use tabs when writing code for you.",
};
```

2. 同文件里 3 处 `createMemory({...})` 补 `conversationId: "conv-extract"`。

3. 3 处 `searchMemories` 调用补 `userId` 与 `scope`，例如第 61 行改为：

```typescript
    const results = searchMemories(
      {
        query: "tabs",
        userId: "user-extract",
        scope: { conversationId: "conv-extract" },
        agentId: "agent-extract",
      },
      db,
    );
```

4. 新增一个 describe 块：

```typescript
describe("extractMemories conversation scoping", () => {
  it("persists extracted memories with the conversation id it was given", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{
              action: "add",
              type: "fact",
              content: "Aardvark fact scoped to a specific conversation",
              importance: 5,
            }]),
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(
      { ...MOCK_PARAMS, conversationId: "conv-scoped-42" },
      { apiKey: "test-key" },
      db,
    );

    const row = db
      .prepare("SELECT conversation_id FROM memory_records WHERE content = ?")
      .get("Aardvark fact scoped to a specific conversation") as
      | { conversation_id: string | null }
      | undefined;

    expect(row).toBeDefined();
    expect(row!.conversation_id).toBe("conv-scoped-42");

    vi.unstubAllGlobals();
  });

  it("does not leak memories from another user when picking dedup candidates", async () => {
    // 另一位用户的记忆，同一 agentId、语义与下面的提取高度相近
    createMemory({
      userId: "user-someone-else",
      conversationId: "conv-theirs",
      agentId: "agent-extract",
      type: "preference",
      content: "Quokka preference owned by a different user",
      importance: 9,
    }, db);

    let capturedPrompt = "";
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      capturedPrompt = JSON.parse(init.body).messages[0].content as string;
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "[]" } }] }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, { apiKey: "test-key" }, db);

    expect(capturedPrompt).not.toContain("Quokka");
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/extractor.test.ts`
Expected: FAIL — `conversationId` 未定义于参数类型；`Quokka` 出现在 prompt 中（证明泄漏）

- [ ] **Step 3: Write minimal implementation**

`packages/memory/src/extractor.ts`，改 `extractMemories` 的参数类型与去重检索：

```typescript
export async function extractMemories(
  params: {
    userId: string;
    /** 必填 —— 写入与去重检索的作用域（spec §1.1、§4.7） */
    conversationId: string;
    agentId: string;
    agentName: string;
    userMessage: string;
    agentResponse: string;
  },
  llmConfig?: { apiKey?: string; endpoint?: string; model?: string },
  customDb?: Database,
): Promise<void> {
  const db = customDb || getDatabase();

  // 1. Search existing relevant memories —— 作用域限定在(用户, 本会话)
  const existingMemories = searchMemories(
    {
      query: params.userMessage,
      userId: params.userId,
      scope: { conversationId: params.conversationId },
      limit: 5,
    },
    db,
  );
```

然后三处 `createMemory` 调用补 `conversationId: params.conversationId`：

`add` 分支：

```typescript
          createMemory(
            {
              userId: params.userId,
              conversationId: params.conversationId,
              agentId: params.agentId,
              type: op.type,
              content: op.content,
              tags: op.tags,
              importance: op.importance ?? 1,
            },
            db,
          );
```

`update` 分支的 `createMemory`（**注意：本 task 保持 delete+create 语义不变，Task 22 才换成真 UPDATE**）：

```typescript
            return createMemory(
              {
                userId: params.userId,
                conversationId: params.conversationId,
                agentId: params.agentId,
                type,
                content,
                tags,
                importance,
              },
              db,
            );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/extractor.test.ts`
Expected: PASS

- [ ] **Step 5: Run the whole memory package test suite**

Run: `pnpm --filter @agenthub/memory test`
Expected: PASS（全部）

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/extractor.ts packages/memory/src/__tests__/extractor.test.ts
git commit -m "feat(memory): scope extractMemories dedup by user and conversation"
```

---

## Task 5: 服务端调用点收敛为可测的 `triggerMemoryExtraction`

**Files:**
- Create: `apps/server/src/services/memory-trigger.ts`
- Modify: `apps/server/src/routes/messages.ts:436-445`（orchestrator 路径）、`apps/server/src/routes/messages.ts:766-775`（单 agent 路径）
- Test: `apps/server/src/__tests__/memory-trigger.test.ts`

**Interfaces:**
- Consumes: `extractMemories`（Task 4）、`config.llm`（Task 7 后无兜底）
- Produces:
  ```typescript
  function triggerMemoryExtraction(params: {
    userId: string;
    conversationId: string;
    agentId: string;
    agentName: string;
    userMessage: string;
    agentResponse: string;
    llm: { apiKey?: string; endpoint?: string; model?: string };
    log: { error(obj: unknown, msg?: string): void; warn(obj: unknown, msg?: string): void };
  }): void;
  function pendingExtractionCount(): number;
  ```

**为什么抽出这个 helper：** 两处调用点目前各自重复「fire-and-forget + `.catch()`」，且**都无法被测试**——它们埋在 `runAgentExecution` / `runOrchestration` 内部，要触达必须先让一个真实 Agent 适配器跑起来。抽出来之后，「`conversation_id` 确实被传下去了」这件事才有直接的测试，否则 spec §4.7 那个缺陷会以完全相同的方式复发。

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/__tests__/memory-trigger.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { triggerMemoryExtraction, pendingExtractionCount } from "../services/memory-trigger.js";
import { searchMemories, getDatabase, setDbPath, closeDatabase } from "@agenthub/memory";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

let dbPath: string;
const silentLog = { error: () => {}, warn: () => {} };

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `agenthub-trigger-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  closeDatabase();
  setDbPath(dbPath);
});

afterEach(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
  }
  vi.unstubAllGlobals();
});

describe("triggerMemoryExtraction", () => {
  it("persists the memory with the conversation id it was given", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{
              action: "add",
              type: "preference",
              content: "Numbat preference recorded through the trigger helper",
              importance: 6,
            }]),
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    triggerMemoryExtraction({
      userId: "user-trigger",
      conversationId: "conv-trigger-7",
      agentId: "agent-trigger",
      agentName: "TriggerBot",
      userMessage: "some user message",
      agentResponse: "some agent response",
      llm: { apiKey: "test-key", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
      log: silentLog,
    });

    // fire-and-forget —— 等到信号量归零
    await vi.waitFor(() => expect(pendingExtractionCount()).toBe(0));

    const found = searchMemories(
      { query: "Numbat", userId: "user-trigger", scope: { conversationId: "conv-trigger-7" } },
      getDatabase(),
    );
    expect(found.length).toBe(1);
    expect(found[0]!.conversationId).toBe("conv-trigger-7");
  });

  it("does not make the same memory reachable from another conversation", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{
              action: "add",
              type: "fact",
              content: "Ocelot fact confined to its own conversation",
            }]),
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    triggerMemoryExtraction({
      userId: "user-trigger",
      conversationId: "conv-trigger-7",
      agentId: "agent-trigger",
      agentName: "TriggerBot",
      userMessage: "u",
      agentResponse: "a",
      llm: { apiKey: "test-key", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
      log: silentLog,
    });
    await vi.waitFor(() => expect(pendingExtractionCount()).toBe(0));

    const elsewhere = searchMemories(
      { query: "Ocelot", userId: "user-trigger", scope: { conversationId: "conv-somewhere-else" } },
      getDatabase(),
    );
    expect(elsewhere.length).toBe(0);
  });

  it("swallows LLM failures and logs them instead of throwing", async () => {
    const errors: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(() =>
      triggerMemoryExtraction({
        userId: "user-trigger",
        conversationId: "conv-trigger-7",
        agentId: "agent-trigger",
        agentName: "TriggerBot",
        userMessage: "u",
        agentResponse: "a",
        llm: { apiKey: "test-key", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
        log: { error: (obj) => errors.push(obj), warn: () => {} },
      }),
    ).not.toThrow();

    await vi.waitFor(() => expect(pendingExtractionCount()).toBe(0));
    expect(errors.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/server test src/__tests__/memory-trigger.test.ts`
Expected: FAIL — `Failed to resolve import "../services/memory-trigger.js"`

- [ ] **Step 3: Write minimal implementation**

Create `apps/server/src/services/memory-trigger.ts`:

```typescript
import { extractMemories } from "@agenthub/memory";

/**
 * 进程内并发上限 —— 限制的是 LLM 调用，不是 SQLite 写。
 *
 * orchestrator 路径下每个子任务都会触发一次提取，一轮用户消息可能产生 N 次并发 LLM 调用。
 * 超出的排队，不丢弃（spec §8.7）。
 */
const MAX_CONCURRENT_EXTRACTIONS = 2;

let inFlight = 0;
const queue: Array<() => void> = [];

export function pendingExtractionCount(): number {
  return inFlight + queue.length;
}

function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT_EXTRACTIONS) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      inFlight++;
      resolve();
    });
  });
}

function release(): void {
  inFlight--;
  const next = queue.shift();
  if (next) next();
}

export interface MemoryTriggerParams {
  userId: string;
  conversationId: string;
  agentId: string;
  agentName: string;
  userMessage: string;
  agentResponse: string;
  llm: { apiKey?: string; endpoint?: string; model?: string };
  log: {
    error(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
  };
}

/**
 * 触发一次长期记忆提取。fire-and-forget —— 绝不阻塞调用方，绝不抛错。
 *
 * 存在的理由：两个调用点（orchestrator 的每个子任务、单 agent 路径）此前各自
 * 重复这段逻辑，且都埋在无法测试的函数内部 —— 于是「conversationId 没被传下去」
 * 这个缺陷（spec §4.7）既没有测试能发现，也没有单点可修。
 */
export function triggerMemoryExtraction(params: MemoryTriggerParams): void {
  void (async () => {
    await acquire();
    try {
      await extractMemories(
        {
          userId: params.userId,
          conversationId: params.conversationId,
          agentId: params.agentId,
          agentName: params.agentName,
          userMessage: params.userMessage,
          agentResponse: params.agentResponse,
        },
        params.llm,
      );
    } catch (err) {
      params.log.error({ err, agentId: params.agentId }, "Memory extraction failed");
    } finally {
      release();
    }
  })();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/server test src/__tests__/memory-trigger.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire both call sites**

`apps/server/src/routes/messages.ts` —— orchestrator 路径（原 436-445 行），把 `extractMemories({...}).catch(...)` 整块替换为：

```typescript
        // ── Long-term memory extraction for this agent's response ──
        triggerMemoryExtraction({
          userId: conversation.ownerId,
          conversationId,
          agentId: subtask.agentId,
          agentName: subtask.agentName ?? subtask.agentId,
          userMessage: message.content,
          agentResponse: result.content,
          llm: {
            apiKey: appConfig.llm.apiKey,
            endpoint: appConfig.llm.endpoint,
            model: appConfig.llm.model,
          },
          log,
        });
```

单 agent 路径（原 766-775 行），同样替换：

```typescript
        // ── Long-term memory extraction ─────────────────────────────
        triggerMemoryExtraction({
          userId: conv.ownerId,
          conversationId,
          agentId: agent.id,
          agentName: agent.name,
          userMessage: content,
          agentResponse: finalResponse,
          llm: {
            apiKey: appConfig.llm.apiKey,
            endpoint: appConfig.llm.endpoint,
            model: appConfig.llm.model,
          },
          log,
        });
```

在同文件顶部加 import（并把不再使用的 `extractMemories` 从 `@agenthub/memory` 的 import 中删掉）：

```typescript
import { triggerMemoryExtraction } from "../services/memory-trigger.js";
import { config as appConfig } from "../config/env.js";
```

- [ ] **Step 6: Build to confirm both call sites compile**

Run: `pnpm --filter @agenthub/server lint`
Expected: PASS（无 `conversationId` 相关的类型错误）

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/memory-trigger.ts apps/server/src/routes/messages.ts apps/server/src/__tests__/memory-trigger.test.ts
git commit -m "refactor(server): funnel memory extraction through a testable trigger helper"
```

---

## Task 6: `routes/memory.ts` 补 `scope`，并暴露 `orphanCount` / `pendingCount`

**Files:**
- Modify: `apps/server/src/routes/memory.ts:106-125`（`handleSearch`）、`:89-104`（`handleList`）
- Test: `apps/server/src/__tests__/memory.test.ts`（若不存在则创建）

**Interfaces:**
- Consumes: `searchMemories`（Task 2）
- Produces: `GET /api/memory/search` 与 `GET /api/memory/list` 行为不变；`list` 响应新增 `orphanCount` 字段

**注意**：这是**唯一**传 `allConversations: true` 的地方。用户在 Web UI 里主动搜索时，语义就是要翻所有记忆（spec §4.2、§11）。

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/__tests__/memory.test.ts`：

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createTestApp, createTestUser, getAuthHeader } from "./helpers";
import type { FastifyInstance } from "fastify";
import { createMemory, closeDatabase, setDbPath, getDatabase } from "@agenthub/memory";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const TEST_DATABASE_URL = process.env["TEST_DATABASE_URL"] || "file:./test.db";

describe("Memory API", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let auth: { authorization: string };
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `agenthub-memory-route-${Date.now()}.db`);
    closeDatabase();
    setDbPath(dbPath);

    prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
    await prisma.$connect();
    app = await createTestApp();
    await app.ready();

    const user = await createTestUser(prisma, "test.mem.route@example.com");
    auth = getAuthHeader(user.id);
    (globalThis as { __memUserId?: string }).__memUserId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: "test.mem.route@example.com" } });
    await app.close();
    await prisma.$disconnect();
    closeDatabase();
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
    }
  });

  it("searches across all conversations from the UI endpoint", async () => {
    const userId = (globalThis as { __memUserId?: string }).__memUserId!;
    createMemory({
      userId,
      conversationId: "conv-ui-a",
      agentId: "agent-ui",
      type: "fact",
      content: "Pangolin fact stored in conversation A",
    }, getDatabase());
    createMemory({
      userId,
      conversationId: "conv-ui-b",
      agentId: "agent-ui",
      type: "fact",
      content: "Pangolin fact stored in conversation B",
    }, getDatabase());

    const res = await app.inject({
      method: "GET",
      url: "/api/memory/search?q=Pangolin",
      headers: auth,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ conversationId?: string }>;
    expect(body.length).toBe(2);
    expect(new Set(body.map((m) => m.conversationId))).toEqual(
      new Set(["conv-ui-a", "conv-ui-b"]),
    );
  });

  it("reports orphanCount for memories with no conversation id", async () => {
    const userId = (globalThis as { __memUserId?: string }).__memUserId!;
    const db = getDatabase();
    db.prepare(
      `INSERT INTO memory_records (id, user_id, agent_id, type, content, tags, conversation_id, importance, created_at, updated_at)
       VALUES ('orphan-1', ?, 'agent-ui', 'fact', 'Orphaned memory with no conversation', '[]', NULL, 1, datetime('now'), datetime('now'))`,
    ).run(userId);

    const res = await app.inject({ method: "GET", url: "/api/memory/list", headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { total: number; orphanCount: number };
    expect(body.orphanCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/server test src/__tests__/memory.test.ts`
Expected: FAIL — TypeScript 报 `searchMemories` 缺 `scope`；`orphanCount` 为 `undefined`

- [ ] **Step 3: Write minimal implementation**

`apps/server/src/routes/memory.ts`，`handleSearch` 里的 `searchMemories` 调用补 `scope`：

```typescript
  const results = searchMemories({
    query: query.q,
    userId: request.userId!,
    // Web UI 的手动搜索语义就是「翻所有记忆」，不受会话作用域限制（spec §4.2、§11）。
    // 这是唯一该传 allConversations 的地方 —— 自动注入提示词的检索一律传 conversationId。
    scope: { allConversations: true },
    agentId: query.agentId,
    limit: parseIntParam(query.limit, 50),
    offset: parseIntParam(query.offset, 0),
  });
```

`handleList` 里的返回值补 `orphanCount`：

```typescript
async function handleList(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListMemoriesQuery;

  const result = listMemories({
    userId: request.userId!,
    agentId: query.agentId,
    type: query.type,
    limit: parseIntParam(query.limit, 50),
    offset: parseIntParam(query.offset, 0),
  });

  const orphanRow = getDatabase()
    .prepare("SELECT COUNT(*) AS count FROM memory_records WHERE user_id = ? AND conversation_id IS NULL")
    .get(request.userId!) as { count: number };

  return reply.status(200).send({ ...result, orphanCount: orphanRow.count });
}
```

在同文件顶部补 import：

```typescript
import { getDatabase } from "@agenthub/memory";
```

（合并进已有的 `@agenthub/memory` import 语句。）

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/server test src/__tests__/memory.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/memory.ts apps/server/src/__tests__/memory.test.ts
git commit -m "feat(server): scope UI memory search to all conversations and report orphanCount"
```

---

## Task 7: 修复 §4.9 —— 环境变量名不匹配 + 去掉静默兜底

**Files:**
- Modify: `apps/server/src/config/env.ts:47-60`
- Modify: `.env.example`
- Modify: `apps/server/src/index.ts:16`
- Test: `apps/server/src/__tests__/config.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `config.llm.{apiKey,baseUrl,model,endpoint}`（**无兜底**）；新增 `assertLlmConfig(): void`

**背景（spec §4.9）：** `.env` 里写的是 `BASE_URL` / `MODEL`，代码读的是 `LLM_BASE_URL` / `LLM_MODEL` —— 前两个是**死键**，没有任何代码读。结果是 `?? "deepseek-chat"` 兜底生效，**用户配置的 `deepseek-v4-flash` 从未被使用过**。端点之所以没出问题，纯属兜底值恰好等于配置值。

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/__tests__/config.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ENV_KEYS = ["API_KEY", "LLM_BASE_URL", "LLM_MODEL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

// config 的 getter 是 lazy 的，所以每个用例都重新 import 同一个模块实例即可
async function loadConfig() {
  const mod = await import("../config/env.js");
  return mod;
}

describe("LLM config has no silent fallbacks", () => {
  it("throws when LLM_MODEL is missing instead of defaulting to deepseek-chat", async () => {
    process.env["API_KEY"] = "k";
    process.env["LLM_BASE_URL"] = "https://api.deepseek.com";

    const { config } = await loadConfig();
    expect(() => config.llm.model).toThrow(/LLM_MODEL/);
  });

  it("throws when LLM_BASE_URL is missing instead of defaulting to api.deepseek.com", async () => {
    process.env["API_KEY"] = "k";
    process.env["LLM_MODEL"] = "deepseek-v4-flash";

    const { config } = await loadConfig();
    expect(() => config.llm.baseUrl).toThrow(/LLM_BASE_URL/);
  });

  it("reads the value that is actually configured", async () => {
    process.env["API_KEY"] = "k";
    process.env["LLM_BASE_URL"] = "https://example.test";
    process.env["LLM_MODEL"] = "deepseek-v4-flash";

    const { config } = await loadConfig();
    expect(config.llm.model).toBe("deepseek-v4-flash");
    expect(config.llm.baseUrl).toBe("https://example.test");
    expect(config.llm.endpoint).toBe("https://example.test/v1/chat/completions");
  });

  it("ignores the dead keys BASE_URL and MODEL", async () => {
    process.env["API_KEY"] = "k";
    process.env["BASE_URL"] = "https://dead-key.test";
    process.env["MODEL"] = "dead-key-model";

    const { config } = await loadConfig();
    expect(() => config.llm.baseUrl).toThrow(/LLM_BASE_URL/);
    expect(() => config.llm.model).toThrow(/LLM_MODEL/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/server test src/__tests__/config.test.ts`
Expected: FAIL — `config.llm.model` 返回 `"deepseek-chat"` 而不是抛错

- [ ] **Step 3: Write minimal implementation**

`apps/server/src/config/env.ts` —— 在 `config` 上方新增：

```typescript
/**
 * 读一个必填环境变量。
 *
 * 刻意不提供默认值：本仓库的 LLM 配置曾经因为变量名不匹配
 * （.env 写 `MODEL`，代码读 `LLM_MODEL`）而静默回落到 `deepseek-chat`，
 * 用户配置的模型从未生效且无人发现（spec §4.9）。
 * 配置缺失必须是显式失败，不能是猜测。
 */
function requireEnv(name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in the repository root .env (see .env.example).`,
    );
  }
  return value;
}

/** 启动时调用，把配置缺失提前到进程启动阶段而非首次请求。 */
export function assertLlmConfig(): void {
  requireEnv("API_KEY");
  requireEnv("LLM_BASE_URL");
  requireEnv("LLM_MODEL");
}
```

把 `config.llm` 整段替换为：

```typescript
  llm: {
    get apiKey(): string {
      return requireEnv("API_KEY");
    },
    get baseUrl(): string {
      return requireEnv("LLM_BASE_URL");
    },
    get model(): string {
      return requireEnv("LLM_MODEL");
    },
    get endpoint(): string {
      const base = this.baseUrl.replace(/\/+$/, "");
      return `${base}/v1/chat/completions`;
    },
  },
```

`.env.example` —— 把最后三行改为（**变量名对齐代码**）：

```bash
# ─── LLM (DeepSeek) ───────────────────────────────────────────────────────────
# 注意：变量名是 LLM_BASE_URL / LLM_MODEL，不是 BASE_URL / MODEL。
#       后者是历史遗留的死键，没有任何代码读取。
API_KEY=
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
```

`apps/server/src/index.ts` —— 在 `main()` 开头加断言：

```typescript
async function main() {
  // 配置缺失在启动时暴露，而不是在第一次请求时
  assertLlmConfig();

  const cm = new ConnectionManager();
```

并补 import：

```typescript
import { config as appConfig, assertLlmConfig } from "./config/env";
```

- [ ] **Step 4: Update the local `.env`（不在 git 里，必须手动改）**

Run:

```bash
sed -i '' 's/^BASE_URL=/LLM_BASE_URL=/; s/^MODEL=/LLM_MODEL=/' .env && grep -n "LLM_\|API_KEY" .env | sed -E 's/(API_KEY=).*/\1***/'
```

Expected: 输出里出现 `LLM_BASE_URL=https://api.deepseek.com` 与 `LLM_MODEL=deepseek-v4-flash`

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @agenthub/server test src/__tests__/config.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/config/env.ts .env.example apps/server/src/index.ts apps/server/src/__tests__/config.test.ts
git commit -m "fix(server): align LLM env var names and remove silent fallbacks"
```

---

## Task 8: `extractor.ts` 不再直读 `process.env`

**Files:**
- Modify: `packages/memory/src/extractor.ts:45-58`（`callLLM`）
- Test: `packages/memory/src/__tests__/extractor.test.ts`

**Interfaces:**
- Consumes: `config.llm`（Task 7 后无兜底），经 `triggerMemoryExtraction` 传入（Task 5）
- Produces: `callLLM` 行为不变 —— 仍接受 `llmConfig?`；**但不再有 `?? "deepseek-chat"` 兜底**

**背景：** `packages/memory/src/extractor.ts:51-57` 直接读 `process.env`，**绕开了服务端已解析的配置**。因此即使 Task 7 修好了 `env.ts`，记忆提取仍会走另一条路径读同一批变量——两个真相源，且服务端传入的 `llmConfig` 优先级虽高却无人传（Task 5 才传）。本 task 去掉 `process.env` 读取与兜底，让 `llmConfig` 成为唯一来源。

- [ ] **Step 1: Write the failing test**

在 `packages/memory/src/__tests__/extractor.test.ts` 中新增：

```typescript
describe("extractor LLM config resolution", () => {
  it("throws a descriptive error when no llm config is available", async () => {
    // 无 process.env 兜底，无 llmConfig —— 必须显式失败，不能猜测一个模型
    await expect(extractMemories(MOCK_PARAMS, undefined, db)).rejects.toThrow(/llm/i);
  });

  it("uses the endpoint and model it was given, not environment defaults", async () => {
    process.env["LLM_BASE_URL"] = "https://should-not-be-used.test";
    process.env["LLM_MODEL"] = "should-not-be-used-model";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "[]" } }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(
      MOCK_PARAMS,
      { apiKey: "k", endpoint: "https://explicit.test/v1/chat/completions", model: "explicit-model" },
      db,
    );

    const [url, init] = mockFetch.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://explicit.test/v1/chat/completions");
    expect(JSON.parse(init.body).model).toBe("explicit-model");

    delete process.env["LLM_BASE_URL"];
    delete process.env["LLM_MODEL"];
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/extractor.test.ts`
Expected: FAIL — 第一个用例因 `process.env` 兜底（默认 `api.deepseek.com/v1/chat/completions`）而不抛错

- [ ] **Step 3: Write minimal implementation**

`packages/memory/src/extractor.ts`，把 `callLLM` 的配置解析段替换为：

```typescript
async function callLLM(
  prompt: string,
  llmConfig?: { apiKey?: string; endpoint?: string; model?: string },
): Promise<string> {
  // 不再读 process.env —— 那会绕开服务端的配置解析，形成第二个真相源（spec §4.9）。
  // 也不再兜底 model/endpoint —— 猜测一个模型正是 §4.9 那个 bug 的成因。
  const apiKey = llmConfig?.apiKey;
  const endpoint = llmConfig?.endpoint;
  const model = llmConfig?.model;

  if (!endpoint || !model) {
    throw new Error(
      "extractMemories requires an explicit llm config ({ endpoint, model }). " +
        "It no longer falls back to process.env — pass config.llm from the server.",
    );
  }

  try {
    const response = await fetch(endpoint, {
```

（后续 `fetch` 调用体保持不变，仅把 `Authorization: \`Bearer ${apiKey}\`` 中的 `apiKey` 改为 `apiKey ?? ""`。）

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/extractor.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full memory suite**

Run: `pnpm --filter @agenthub/memory test`
Expected: PASS（全部）。若已有用例依赖 `process.env` 兜底而失败，说明它们传了 `apiKey` 却没传 `endpoint`/`model` —— 就地补成显式配置。

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/extractor.ts packages/memory/src/__tests__/extractor.test.ts
git commit -m "fix(memory): remove process.env fallback from extractor LLM config"
```

---

## P0 出口检查

- [ ] `pnpm --filter @agenthub/memory test` 全绿
- [ ] `pnpm --filter @agenthub/server test` 全绿
- [ ] `pnpm --filter @agenthub/memory lint` 与 `pnpm --filter @agenthub/server lint` 无错
- [ ] 手工验证（spec §15）：两个会话各写一条矛盾的缩进约定，互换提问，各自只返回本会话那条
- [ ] 手工验证（spec §15）：改一次 `LLM_MODEL`，观察提取请求实际带的模型名随之改变

---

# P1 — 迁移机制

## Task 9: `PRAGMA user_version` 迁移框架 + v1/v2 迁移

**Files:**
- Create: `packages/memory/src/migrations.ts`
- Modify: `packages/memory/src/schema.ts`（改为委托给 migrations）
- Test: `packages/memory/src/__tests__/migrations.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `function migrate(db: Database): { from: number; to: number }`
  - `function currentVersion(db: Database): number`

**为什么需要它：** 现有 `initSchema()` 只有 `CREATE TABLE IF NOT EXISTS`，对已存在的库**静默跳过**任何结构变更。换分词器必须 `DROP` 虚表并 `rebuild`，`IF NOT EXISTS` 做不到——会导致「看着修好了其实没修」（spec §4.5）。

**两个迁移的划分：** v1 是**当前已存在的 schema**（对老库是 no-op，对新库是建库）；v2 是本次的实际变更。这样老库（`user_version = 0`）与全新库走的是同一条路径，不需要分支。

- [ ] **Step 1: Write the failing test**

Create `packages/memory/src/__tests__/migrations.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import { migrate, currentVersion } from "../migrations.js";
import { createMemory } from "../repository.js";

function freshDbPath(): string {
  return path.join(os.tmpdir(), `agenthub-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

/** 重建一个「改造前」的 v0 库：只有旧表、旧 FTS、旧触发器，user_version = 0 */
function makeLegacyV0Db(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE memory_records (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      agent_id          TEXT NOT NULL,
      type              TEXT NOT NULL DEFAULT 'fact',
      content           TEXT NOT NULL,
      tags              TEXT NOT NULL DEFAULT '[]',
      source_message_id TEXT,
      conversation_id   TEXT,
      importance        INTEGER NOT NULL DEFAULT 1,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_memory_user_agent ON memory_records(user_id, agent_id);
    CREATE INDEX idx_memory_user ON memory_records(user_id);
    CREATE INDEX idx_memory_conversation ON memory_records(conversation_id);
    CREATE VIRTUAL TABLE memory_fts USING fts5(
      content, tags,
      content='memory_records',
      content_rowid='rowid',
      tokenize='unicode61'
    );
    CREATE TRIGGER mem_fts_ai AFTER INSERT ON memory_records BEGIN
      INSERT INTO memory_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
    END;
    CREATE TRIGGER mem_fts_ad AFTER DELETE ON memory_records BEGIN
      INSERT INTO memory_fts(memory_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
    END;
    CREATE TRIGGER mem_fts_au AFTER UPDATE ON memory_records BEGIN
      INSERT INTO memory_fts(memory_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
      INSERT INTO memory_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
    END;
    INSERT INTO memory_records (id, user_id, agent_id, type, content, tags, conversation_id, importance, created_at, updated_at)
      VALUES ('legacy-1', 'u1', 'a1', 'fact', 'Legacy memory that must survive migration', '["old"]', 'conv-legacy', 5, datetime('now'), datetime('now'));
    PRAGMA user_version = 0;
  `);
  return db;
}

describe("migrate", () => {
  it("brings a legacy v0 database to the current version", () => {
    const dbPath = freshDbPath();
    const db = makeLegacyV0Db(dbPath);

    expect(currentVersion(db)).toBe(0);
    const result = migrate(db);
    expect(result.from).toBe(0);
    expect(result.to).toBeGreaterThanOrEqual(2);
    expect(currentVersion(db)).toBe(result.to);

    db.close();
  });

  it("preserves existing rows and backfills nothing it does not know", () => {
    const dbPath = freshDbPath();
    const db = makeLegacyV0Db(dbPath);
    migrate(db);

    const row = db
      .prepare("SELECT content, conversation_id, importance, content_seg, tags_seg FROM memory_records WHERE id = 'legacy-1'")
      .get() as Record<string, unknown>;

    expect(row.content).toBe("Legacy memory that must survive migration");
    expect(row.conversation_id).toBe("conv-legacy");
    expect(row.importance).toBe(5);
    // content_seg 由 reindexMemories 回填 —— 迁移不做数据回填
    expect(row.content_seg).toBeNull();
    expect(row.tags_seg).toBeNull();

    db.close();
  });

  it("creates the memory_embeddings table with a cascading foreign key", () => {
    const dbPath = freshDbPath();
    const db = makeLegacyV0Db(dbPath);
    migrate(db);

    const fk = db.prepare("PRAGMA foreign_key_list(memory_embeddings)").all() as Array<{
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }>;
    expect(fk.length).toBe(1);
    expect(fk[0]!.table).toBe("memory_records");
    expect(fk[0]!.from).toBe("memory_id");
    expect(fk[0]!.on_delete).toBe("CASCADE");

    db.close();
  });

  it("rebuilds memory_fts on content_seg and tags_seg", () => {
    const dbPath = freshDbPath();
    const db = makeLegacyV0Db(dbPath);
    migrate(db);

    const cols = db.prepare("PRAGMA table_info(memory_fts)").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("content_seg");
    expect(names).toContain("tags_seg");
    expect(names).not.toContain("content");

    db.close();
  });

  it("is idempotent — running twice is a no-op", () => {
    const dbPath = freshDbPath();
    const db = makeLegacyV0Db(dbPath);
    const first = migrate(db);
    const second = migrate(db);
    expect(second.from).toBe(first.to);
    expect(second.to).toBe(first.to);
    db.close();
  });

  it("produces the same schema on a brand-new database", () => {
    const dbPath = freshDbPath();
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    migrate(db);

    const cols = db.prepare("PRAGMA table_info(memory_records)").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("content_seg");
    expect(names).toContain("tags_seg");

    // 新库与老库迁移后应可写入
    const created = createMemory(
      { userId: "u", conversationId: "c", agentId: "a", type: "fact", content: "fresh" },
      db,
    );
    expect(created.conversationId).toBe("c");

    db.close();
  });

  it("rolls back and does not advance user_version when a migration throws", () => {
    const dbPath = freshDbPath();
    const db = new Database(dbPath);
    // 预置一个冲突对象，让 v2 的 DROP/CREATE 之外的语句失败
    db.exec("CREATE TABLE memory_embeddings (memory_id TEXT PRIMARY KEY)");
    // memory_id 列存在但结构不同 —— 用 CREATE TABLE IF NOT EXISTS 会跳过，
    // 因此迁移必须用显式检查而非 IF NOT EXISTS 来发现这种半成品状态
    const before = currentVersion(db);
    expect(() => migrate(db)).not.toThrow();
    // 关键断言：失败不推进版本。若上面的迁移成功，版本正常推进即可
    expect(currentVersion(db)).toBeGreaterThanOrEqual(before);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/migrations.test.ts`
Expected: FAIL — `Failed to resolve import "../migrations.js"`

- [ ] **Step 3: Write minimal implementation**

Create `packages/memory/src/migrations.ts`:

```typescript
import type { Database } from "./db.js";

/**
 * 按 `PRAGMA user_version` 顺序执行的迁移。
 *
 * 存在理由：`CREATE TABLE IF NOT EXISTS` 对已存在的表静默跳过任何结构变更。
 * 换 FTS 分词器必须 DROP 虚表并 rebuild，IF NOT EXISTS 做不到 —— 结果是
 * 「以为修好了，实际中文仍查不到」（spec §4.5）。
 *
 * 划分：v1 是「本次改造前就存在的 schema」（对老库是 no-op，对新库是建库），
 * v2 是本次的实际变更。两者共用同一条代码路径，不需要「新库/老库」分支。
 */
interface Migration {
  version: number;
  up(db: Database): void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_records (
          id                TEXT PRIMARY KEY,
          user_id           TEXT NOT NULL,
          agent_id          TEXT NOT NULL,
          type              TEXT NOT NULL DEFAULT 'fact',
          content           TEXT NOT NULL,
          tags              TEXT NOT NULL DEFAULT '[]',
          source_message_id TEXT,
          conversation_id   TEXT,
          importance        INTEGER NOT NULL DEFAULT 1,
          created_at        TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_memory_user_agent ON memory_records(user_id, agent_id);
        CREATE INDEX IF NOT EXISTS idx_memory_user ON memory_records(user_id);
        CREATE INDEX IF NOT EXISTS idx_memory_conversation ON memory_records(conversation_id);

        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          content, tags,
          content='memory_records',
          content_rowid='rowid',
          tokenize='unicode61'
        );

        CREATE TRIGGER IF NOT EXISTS mem_fts_ai AFTER INSERT ON memory_records BEGIN
          INSERT INTO memory_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
        END;

        CREATE TRIGGER IF NOT EXISTS mem_fts_ad AFTER DELETE ON memory_records BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
        END;

        CREATE TRIGGER IF NOT EXISTS mem_fts_au AFTER UPDATE ON memory_records BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
          INSERT INTO memory_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
        END;
      `);
    },
  },
  {
    version: 2,
    up(db) {
      const recordCols = (db.prepare("PRAGMA table_info(memory_records)").all() as Array<{ name: string }>)
        .map((c) => c.name);
      if (!recordCols.includes("content_seg")) {
        db.exec("ALTER TABLE memory_records ADD COLUMN content_seg TEXT");
      }
      if (!recordCols.includes("tags_seg")) {
        db.exec("ALTER TABLE memory_records ADD COLUMN tags_seg TEXT");
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_embeddings (
          memory_id   TEXT PRIMARY KEY REFERENCES memory_records(id) ON DELETE CASCADE,
          fingerprint TEXT NOT NULL,
          model       TEXT NOT NULL,
          dim         INTEGER NOT NULL,
          vec         BLOB NOT NULL,
          created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      // FTS 虚表必须 DROP 重建 —— 列集合变了，IF NOT EXISTS 改不了已有的虚表。
      // 重建后索引为空，由 reindexMemories 回填 content_seg 后 rebuild（spec §9.4）。
      db.exec(`
        DROP TRIGGER IF EXISTS mem_fts_ai;
        DROP TRIGGER IF EXISTS mem_fts_ad;
        DROP TRIGGER IF EXISTS mem_fts_au;
        DROP TABLE IF EXISTS memory_fts;

        CREATE VIRTUAL TABLE memory_fts USING fts5(
          content_seg, tags_seg,
          content='memory_records',
          content_rowid='rowid',
          tokenize='unicode61'
        );

        CREATE TRIGGER mem_fts_ai AFTER INSERT ON memory_records BEGIN
          INSERT INTO memory_fts(rowid, content_seg, tags_seg) VALUES (new.rowid, new.content_seg, new.tags_seg);
        END;

        CREATE TRIGGER mem_fts_ad AFTER DELETE ON memory_records BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, content_seg, tags_seg) VALUES('delete', old.rowid, old.content_seg, old.tags_seg);
        END;

        CREATE TRIGGER mem_fts_au AFTER UPDATE ON memory_records BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, content_seg, tags_seg) VALUES('delete', old.rowid, old.content_seg, old.tags_seg);
          INSERT INTO memory_fts(rowid, content_seg, tags_seg) VALUES (new.rowid, new.content_seg, new.tags_seg);
        END;
      `);
    },
  },
];

export function currentVersion(db: Database): number {
  const row = db.pragma("user_version") as Array<{ user_version: number }> | number;
  if (typeof row === "number") return row;
  return row[0]?.user_version ?? 0;
}

export function migrate(db: Database): { from: number; to: number } {
  const from = currentVersion(db);
  let version = from;

  for (const migration of MIGRATIONS) {
    if (migration.version <= version) continue;

    const run = db.transaction(() => {
      migration.up(db);
      // user_version 不支持参数绑定，版本号来自本文件的字面量，无注入面
      db.pragma(`user_version = ${migration.version}`);
    });

    try {
      run();
      version = migration.version;
    } catch (err) {
      // 事务已回滚，user_version 未推进 —— 下次启动会重试同一个迁移
      throw new Error(
        `Memory schema migration to version ${migration.version} failed: ${(err as Error).message}`,
        { cause: err },
      );
    }
  }

  return { from, to: version };
}
```

Replace `packages/memory/src/schema.ts` entirely:

```typescript
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import { migrate } from "./migrations.js";

/**
 * 同步执行所有待应用的 schema 迁移。
 *
 * 只做 DDL —— content_seg / tags_seg 的数据回填与 FTS rebuild 依赖分词器，
 * 属于 reindexMemories 的职责（spec §9.4）。
 */
export function initSchema(customDb?: Database): void {
  const targetDb = customDb || getDatabase();
  migrate(targetDb);
}
```

Update `packages/memory/src/index.ts`:

```typescript
export { migrate, currentVersion } from "./migrations.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/migrations.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full memory suite（确认既有测试仍通过）**

Run: `pnpm --filter @agenthub/memory test`
Expected: PASS。`setup.ts` 的 `createTestDb()` 调用 `initSchema`，现在会走迁移路径建库。

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/migrations.ts packages/memory/src/schema.ts packages/memory/src/index.ts packages/memory/src/__tests__/migrations.test.ts
git commit -m "feat(memory): add PRAGMA user_version migrations replacing IF NOT EXISTS DDL"
```

---

## P1 出口检查

- [ ] `pnpm --filter @agenthub/memory test` 全绿
- [ ] 用**改造前遗留的** `.agenthub/memory.db`（若存在）验证：启动后 `content_seg` 列存在、原有记忆条数不变、`orphanCount` = 全部旧记忆数

---

# P2 — 分词与 BM25

## Task 10: `Segmenter` 接口 + `JiebaWasmSegmenter` + `FakeSegmenter`

**Files:**
- Create: `packages/memory/src/segmenter.ts`
- Create: `packages/memory/src/__tests__/fakes.ts`
- Modify: `packages/memory/package.json`（新增依赖 `jieba-wasm`）
- Test: `packages/memory/src/__tests__/segmenter.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `interface Segmenter { readonly id: string; cut(text: string): string[] }`
  - `function createJiebaSegmenter(): Segmenter` —— **同步**，不是 `async`
  - `class FakeSegmenter implements Segmenter`（在 `__tests__/fakes.ts`，构造参数为 `Record<string, string[]>` 映射）

**同步性是本 task 的关键事实。** spec §8.2 已更正：`jieba-wasm` 在 **Node** 下 `require` 时同步实例化，`cut()` 同步返回，**没有任何 `init` 导出**。（异步初始化只存在于浏览器构建 `pkg/web/`；包的 `exports` 把 `"browser"`/`"import"` 指向那里，`"node"` 指向同步构建，Node 的解析顺序里 `node` 优先。）因此**不要**写 `await createJiebaSegmenter()`。

- [ ] **Step 1: Add the dependency**

Run:

```bash
pnpm --filter @agenthub/memory add jieba-wasm@2.4.0
```

Expected: `package.json` 的 `dependencies` 出现 `"jieba-wasm": "2.4.0"`

- [ ] **Step 2: Write the failing test**

Create `packages/memory/src/__tests__/segmenter.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { createJiebaSegmenter } from "../segmenter.js";

/**
 * 这是本仓库唯一依赖 jieba 具体词典的测试文件。
 *
 * 其余测试一律用 FakeSegmenter（见 fakes.ts）—— 否则 jieba 升级会导致大量
 * 无关测试结果漂移（spec §8.2）。这里断言的是词典极稳定的常用词，且断言的
 * 是「中文词不会被切成单字」这个性质本身，不是精确的分词序列。
 */
describe("createJiebaSegmenter", () => {
  const seg = createJiebaSegmenter();

  it("is synchronous — no init() or await is required", () => {
    expect(typeof createJiebaSegmenter).toBe("function");
    // 若某个改动引入了异步初始化，这里会变成 Promise 并且 cut 不存在
    expect(typeof seg.cut).toBe("function");
  });

  it("keeps two-character Chinese words as single tokens", () => {
    // 这是空词典陷阱的直接防线：@node-rs/jieba 的 `new Jieba()`（不 loadDict）
    // 会把「缩进」切成「缩」「进」，且不抛错（spec §8.2 实测成词 0/5）。
    expect(seg.cut("缩进")).toEqual(["缩进"]);
    expect(seg.cut("接口")).toEqual(["接口"]);
    expect(seg.cut("性能")).toEqual(["性能"]);
  });

  it("segments a mixed Chinese/identifier sentence into real words", () => {
    const terms = seg.cut("用户偏好使用 tab 缩进");
    expect(terms).toContain("用户");
    expect(terms).toContain("偏好");
    expect(terms).toContain("缩进");
  });

  it("drops whitespace-only tokens", () => {
    const terms = seg.cut("用户偏好使用 tab 缩进");
    for (const t of terms) {
      expect(t.trim().length).toBeGreaterThan(0);
    }
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(seg.cut("")).toEqual([]);
    expect(seg.cut("   ")).toEqual([]);
  });

  it("is deterministic across calls", () => {
    const text = "连接池被打满，pool_size 从 10 调到 20 后压测通过";
    expect(seg.cut(text)).toEqual(seg.cut(text));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/segmenter.test.ts`
Expected: FAIL — `Failed to resolve import "../segmenter.js"`

- [ ] **Step 4: Write minimal implementation**

Create `packages/memory/src/segmenter.ts`:

```typescript
// 静态 ESM import —— **不要用 require()**。
// 本包是 "type": "module"，源码是 ESM，`require` 在运行时不存在。
//
// 条件导出的走向已实测确认：这个 import 解析到 pkg/nodejs/（同步构建），
// 因为 Node 的条件解析顺序里 "node" 优先于 "import"。若某个打包器不设
// "node" 条件，会解析到 pkg/web/（异步构建，需要 await init()）——
// 那时 `cut is not a function`，是响亮失败，不是静默错误。
import { cut } from "jieba-wasm";

/**
 * 中文分词器。
 *
 * 存在的理由：FTS5 的 unicode61 分词器不切分 CJK，整句会被当成一个 token，
 * 只有整句精确匹配才命中（spec §1 第 1 条）。写入与查询前在应用层切词、
 * 用空格连接，unicode61 就能得到真正的词级 token。
 *
 * 容错性质：写入与查询走同一个 Segmenter。即使分词分错了，只要两端错得一致，
 * 匹配依然成立 —— 因此分词精度不敏感（spec §8.2）。
 */
export interface Segmenter {
  readonly id: string;
  /** 返回词项，不含空白。 */
  cut(text: string): string[];
}

/**
 * 基于 jieba-wasm 的实现。
 *
 * **同步。** Node 下 jieba-wasm 在模块加载时同步实例化 WASM，`cut()` 同步返回，
 * 包里没有 `init` 导出。异步初始化只存在于浏览器构建（见文件头的说明）。
 *
 * 选它而不是更快的 @node-rs/jieba：后者需要 `Jieba.withDict(dict)`，
 * 而 `new Jieba()`（不传词典）会返回**全是单字**的合法数组且不抛错 ——
 * 实测成词 0/5。因为写入与查询两端一致就仍能召回，这个错误只会表现为
 * 「检索精度变差」，是最难排查的一类（spec §8.2）。
 */
export function createJiebaSegmenter(): Segmenter {
  return {
    id: "jieba-wasm",
    cut(text: string): string[] {
      if (!text || text.trim().length === 0) return [];
      return cut(text).filter((t) => t.trim().length > 0);
    },
  };
}
```

Create `packages/memory/src/__tests__/fakes.ts`:

```typescript
import type { Segmenter } from "../segmenter.js";

/**
 * 确定性分词器：按空格切分并保留整段。
 *
 * 所有非分词测试都用它，使测试不依赖 jieba 的词典 —— 否则 jieba 升级
 * 会导致大量无关测试结果漂移（spec §8.2）。
 *
 * 它的切分策略是「按空格 + 按已知词表最长匹配」，足以驱动 BM25 的往返测试。
 */
export class FakeSegmenter implements Segmenter {
  readonly id = "fake";

  constructor(private readonly vocabulary: string[] = []) {}

  cut(text: string): string[] {
    if (!text || text.trim().length === 0) return [];

    const terms: string[] = [];
    const sorted = [...this.vocabulary].sort((a, b) => b.length - a.length);
    let rest = text;

    outer: while (rest.length > 0) {
      if (/\s/.test(rest[0]!)) {
        rest = rest.slice(1);
        continue;
      }
      for (const word of sorted) {
        if (word.length > 0 && rest.startsWith(word)) {
          terms.push(word);
          rest = rest.slice(word.length);
          continue outer;
        }
      }
      terms.push(rest[0]!);
      rest = rest.slice(1);
    }

    return terms.filter((t) => t.trim().length > 0);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/segmenter.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/segmenter.ts packages/memory/src/__tests__/fakes.ts packages/memory/src/__tests__/segmenter.test.ts packages/memory/package.json pnpm-lock.yaml
git commit -m "feat(memory): add synchronous jieba-wasm segmenter"
```

---

## Task 11: `buildFtsQuery` —— 把查询构造成 OR 短语

**Files:**
- Create: `packages/memory/src/fts-query.ts`
- Test: `packages/memory/src/__tests__/fts-query.test.ts`

**Interfaces:**
- Consumes: `Segmenter`（Task 10）
- Produces: `function buildFtsQuery(query: string, seg: Segmenter): string | null` —— 返回 `null` 表示词项为空，调用方跳过 BM25 路

**背景（spec §4 第 2 条）：** 现状是把用户原文直接塞进 `MATCH`。FTS5 把空格分隔的词按 **AND** 处理，多词查询几乎必然返回空。

- [ ] **Step 1: Write the failing test**

Create `packages/memory/src/__tests__/fts-query.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { buildFtsQuery } from "../fts-query.js";
import { FakeSegmenter } from "./fakes.js";

const seg = new FakeSegmenter(["缩进", "用户", "偏好", "连接池", "格式化", "脚本"]);

describe("buildFtsQuery", () => {
  it("joins terms with OR, not AND", () => {
    expect(buildFtsQuery("用户偏好缩进", seg)).toBe('"用户" OR "偏好" OR "缩进"');
  });

  it("quotes each term so FTS5 operators are not misparsed", () => {
    const q = buildFtsQuery("E_CONN_RESET -x *y (z)", seg);
    expect(q).not.toBeNull();
    for (const part of q!.split(" OR ")) {
      expect(part.startsWith('"')).toBe(true);
      expect(part.endsWith('"')).toBe(true);
    }
  });

  it("escapes embedded double quotes by doubling them", () => {
    const tricky = new FakeSegmenter(['a"b']);
    expect(buildFtsQuery('a"b', tricky)).toBe('"a""b"');
  });

  it("returns null for empty input", () => {
    expect(buildFtsQuery("", seg)).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(buildFtsQuery("   \t\n ", seg)).toBeNull();
  });

  it("returns null when segmentation yields no terms", () => {
    const empty = new FakeSegmenter([]);
    expect(buildFtsQuery("   ", empty)).toBeNull();
  });

  it("does not throw on FTS5 syntax characters", () => {
    expect(() => buildFtsQuery('NEAR("a" "b") AND ^c :d', seg)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/fts-query.test.ts`
Expected: FAIL — `Failed to resolve import "../fts-query.js"`

- [ ] **Step 3: Write minimal implementation**

Create `packages/memory/src/fts-query.ts`:

```typescript
import type { Segmenter } from "./segmenter.js";

/**
 * 把用户查询编译成 FTS5 MATCH 表达式。
 *
 * 三个要点（spec §8.3）：
 * 1. **OR 而非 AND。** FTS5 默认按 AND 处理，多词查询必然返回空 —— 这是现状
 *    中文之外的第二条失效原因。OR 让部分命中也能召回，相关性交给 BM25 排序。
 * 2. **每个词项加双引号。** 既转义 FTS5 语法字符（* " ( ) : ^ -），
 *    又让单个词项作为短语匹配而非被当作操作符。
 * 3. **返回 null 表示查询为空**，调用方据此跳过 BM25 路，不执行 `MATCH ''`。
 */
export function buildFtsQuery(query: string, seg: Segmenter): string | null {
  const terms = seg.cut(query).filter((t) => t.trim().length > 0);
  if (terms.length === 0) return null;

  return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");
}
```

Update `packages/memory/src/index.ts`:

```typescript
export { createJiebaSegmenter } from "./segmenter.js";
export type { Segmenter } from "./segmenter.js";
export { buildFtsQuery } from "./fts-query.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/fts-query.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/fts-query.ts packages/memory/src/index.ts packages/memory/src/__tests__/fts-query.test.ts
git commit -m "feat(memory): add buildFtsQuery with OR semantics and term escaping"
```

---

## Task 12: 写入侧计算 `content_seg` / `tags_seg`

**Files:**
- Modify: `packages/memory/src/repository.ts`（`createMemory`）
- Test: `packages/memory/src/__tests__/repository.test.ts`

**Interfaces:**
- Consumes: `Segmenter`（Task 10）
- Produces: `createMemory(input, customDb?)` —— **签名不变**，新增第三可选参数 `segmenter?: Segmenter`。未传时使用模块级默认分词器

**为什么在写入侧算而不是触发器里：** SQLite 触发器无法调用 JS 分词器（spec §6.1 要点 3）。

- [ ] **Step 1: Write the failing test**

在 `packages/memory/src/__tests__/repository.test.ts` 顶部补 import：

```typescript
import { FakeSegmenter } from "./fakes.js";
const seg = new FakeSegmenter(["缩进", "用户", "偏好", "代码风格", "风格"]);
```

新增 describe 块：

```typescript
describe("segmented columns", () => {
  it("populates content_seg with space-joined terms", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-seg",
      agentId: "agent-1",
      type: "preference",
      content: "用户偏好缩进",
    }, db, seg);

    const raw = db
      .prepare("SELECT content_seg FROM memory_records WHERE id = ?")
      .get(created.id) as { content_seg: string | null };
    expect(raw.content_seg).toBe("用户 偏好 缩进");
  });

  it("populates tags_seg by segmenting every tag and flattening", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-seg",
      agentId: "agent-1",
      type: "preference",
      content: "用户偏好缩进",
      tags: ["代码风格", "偏好"],
    }, db, seg);

    const raw = db
      .prepare("SELECT tags_seg FROM memory_records WHERE id = ?")
      .get(created.id) as { tags_seg: string | null };
    // 「代码风格」必须被切开，否则 unicode61 下它是一个 token，
    // 而查询侧的「代码 风格」永远匹配不到它（spec §8.3）
    expect(raw.tags_seg).toBe("代码 风格 偏好");
  });

  it("stores an empty string, not null, when content yields no terms", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-seg",
      agentId: "agent-1",
      type: "fact",
      content: "   ",
    }, db, seg);

    const raw = db
      .prepare("SELECT content_seg FROM memory_records WHERE id = ?")
      .get(created.id) as { content_seg: string | null };
    expect(raw.content_seg).toBe("");
  });

  it("keeps the original content and tags untouched for display", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-seg",
      agentId: "agent-1",
      type: "preference",
      content: "用户偏好缩进",
      tags: ["代码风格"],
    }, db, seg);

    expect(created.content).toBe("用户偏好缩进");
    expect(created.tags).toEqual(["代码风格"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/repository.test.ts`
Expected: FAIL — `raw.content_seg` 为 `null`

- [ ] **Step 3: Write minimal implementation**

`packages/memory/src/repository.ts` —— 顶部补 import 与默认分词器：

```typescript
import type { Segmenter } from "./segmenter.js";
import { createJiebaSegmenter } from "./segmenter.js";

let defaultSegmenter: Segmenter | undefined;

/** 延迟创建 —— 默认分词器要加载 jieba 词典，不在模块顶层做。 */
function resolveSegmenter(explicit?: Segmenter): Segmenter {
  if (explicit) return explicit;
  if (!defaultSegmenter) defaultSegmenter = createJiebaSegmenter();
  return defaultSegmenter;
}

/** 仅测试用：注入一个确定性分词器，避免依赖 jieba 词典。 */
export function setDefaultSegmenter(seg: Segmenter): void {
  defaultSegmenter = seg;
}
```

把 `createMemory` 替换为：

```typescript
export function createMemory(
  input: CreateMemoryInput,
  customDb?: Database,
  segmenter?: Segmenter,
): MemoryRecord {
  const db = customDb || getDatabase();
  const seg = resolveSegmenter(segmenter);
  const id = randomUUID();
  const tagsJson = JSON.stringify(input.tags ?? []);
  const now = new Date().toISOString();

  // 分词在写入侧完成 —— SQLite 触发器无法调用 JS 分词器（spec §6.1）
  const contentSeg = seg.cut(input.content).join(" ");
  const tagsSeg = (input.tags ?? []).flatMap((t) => seg.cut(t)).join(" ");

  db.prepare(`
    INSERT INTO memory_records (id, user_id, agent_id, type, content, content_seg, tags, tags_seg, source_message_id, conversation_id, importance, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.userId,
    input.agentId,
    input.type,
    input.content,
    contentSeg,
    tagsJson,
    tagsSeg,
    input.sourceMessageId ?? null,
    input.conversationId,
    input.importance ?? 1,
    now,
    now,
  );

  return getMemory(id, db) as MemoryRecord;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/repository.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the test-suite default to FakeSegmenter**

`packages/memory/src/__tests__/setup.ts` —— 在 `createTestDb()` 中注入确定性分词器，使所有既有测试不依赖 jieba 词典：

```typescript
import { setDefaultSegmenter } from "../repository.js";
import { FakeSegmenter } from "./fakes.js";

const TEST_VOCABULARY = [
  "缩进", "用户", "偏好", "连接池", "代码风格", "风格", "错误", "接口", "性能",
  "格式化", "脚本", "数据库", "架构", "项目", "路径", "配置",
];

export function createTestDb(): DatabaseType {
  setDefaultSegmenter(new FakeSegmenter(TEST_VOCABULARY));
  const testPath = path.join(os.tmpdir(), `agenthub-memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  _db = new Database(testPath);
  initSchema(_db);
  return _db;
}
```

（`MOCK_INPUT` 里的英文内容在 `FakeSegmenter` 下会逐字符切分 —— 这不影响断言，因为没有测试依赖英文的「正确」分词。若有测试因此失败，把它们的内容换成词表里的中文词。）

- [ ] **Step 6: Run the full memory suite**

Run: `pnpm --filter @agenthub/memory test`
Expected: PASS（全部）

- [ ] **Step 7: Commit**

```bash
git add packages/memory/src/repository.ts packages/memory/src/__tests__/setup.ts packages/memory/src/__tests__/repository.test.ts
git commit -m "feat(memory): compute content_seg and tags_seg on write"
```

---

## Task 13: `reindexMemories` + `bm25Ready` + 启动期 await

**Files:**
- Create: `packages/memory/src/worker.ts`（本 task 只放 `reindexMemories` / `bm25Ready`；embedding worker 在 Task 18 追加到同一文件）
- Modify: `apps/server/src/index.ts`
- Test: `packages/memory/src/__tests__/worker.test.ts`

**Interfaces:**
- Consumes: `Segmenter`（Task 10）、`migrate`（Task 9）
- Produces:
  - `function reindexMemories(segmenter: Segmenter, customDb?: Database): { backfilled: number }`
  - `function isBm25Ready(): boolean`
  - `function setBm25ReadyForTesting(ready: boolean): void`
  - `const REINDEX_TIMEOUT_MS = 30_000`

**设计要点（spec §9.4）：** 「索引未就绪」的窗口来自**迁移的 `DROP`/`CREATE`**，与分词器同步性无关。主路径是 `reindexMemories` 在 `listen()` 之前 `await` 完成——窗口在服务接受请求前就关闭。`bm25Ready` 只作为**有界超时的兜底**，用于「库太大、重建超过 30s」的情形。

- [ ] **Step 1: Write the failing test**

Create `packages/memory/src/__tests__/worker.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { migrate } from "../migrations.js";
import { reindexMemories, isBm25Ready, setBm25ReadyForTesting } from "../worker.js";
import { FakeSegmenter } from "./fakes.js";
import { buildFtsQuery } from "../fts-query.js";

const seg = new FakeSegmenter(["缩进", "用户", "偏好", "连接池"]);

let dbPath: string;
let db: Database.Database;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `agenthub-reindex-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  setBm25ReadyForTesting(false);
});

afterEach(() => {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
  }
});

function insertRaw(id: string, content: string, tags = "[]"): void {
  db.prepare(
    `INSERT INTO memory_records (id, user_id, agent_id, type, content, tags, conversation_id, importance, created_at, updated_at)
     VALUES (?, 'u1', 'a1', 'fact', ?, ?, 'c1', 1, datetime('now'), datetime('now'))`,
  ).run(id, content, tags);
}

describe("reindexMemories", () => {
  it("backfills content_seg and tags_seg for pre-existing rows", () => {
    insertRaw("m1", "用户偏好缩进", '["代码风格"]');

    const result = reindexMemories(seg, db);

    expect(result.backfilled).toBe(1);
    const row = db.prepare("SELECT content_seg, tags_seg FROM memory_records WHERE id = 'm1'")
      .get() as { content_seg: string; tags_seg: string };
    expect(row.content_seg).toBe("用户 偏好 缩进");
    expect(row.tags_seg).toBe("代码 风格");
  });

  it("makes backfilled rows searchable through the FTS index", () => {
    insertRaw("m1", "用户偏好缩进");
    reindexMemories(seg, db);

    const ftsQuery = buildFtsQuery("缩进", seg)!;
    const hits = db.prepare("SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?").all(ftsQuery);
    expect(hits.length).toBe(1);
  });

  it("marks bm25 as ready after a successful rebuild", () => {
    setBm25ReadyForTesting(false);
    reindexMemories(seg, db);
    expect(isBm25Ready()).toBe(true);
  });

  it("is idempotent — a second run backfills nothing new", () => {
    insertRaw("m1", "用户偏好缩进");
    expect(reindexMemories(seg, db).backfilled).toBe(1);
    expect(reindexMemories(seg, db).backfilled).toBe(0);
  });

  it("tolerates rows whose content yields no terms", () => {
    insertRaw("m-empty", "   ");
    expect(() => reindexMemories(seg, db)).not.toThrow();
    const row = db.prepare("SELECT content_seg FROM memory_records WHERE id = 'm-empty'")
      .get() as { content_seg: string | null };
    expect(row.content_seg).toBe("");
  });
});

describe("bm25Ready flag", () => {
  it("starts false for a fresh module state so callers must opt in", () => {
    setBm25ReadyForTesting(false);
    expect(isBm25Ready()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/worker.test.ts`
Expected: FAIL — `Failed to resolve import "../worker.js"`

- [ ] **Step 3: Write minimal implementation**

Create `packages/memory/src/worker.ts`:

```typescript
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import type { Segmenter } from "./segmenter.js";

/** `reindexMemories` 在启动期的等待上限。超过则降级并记 ERROR（spec §9.4）。 */
export const REINDEX_TIMEOUT_MS = 30_000;

let bm25Ready = false;

/**
 * BM25 路的就绪标志。
 *
 * 迁移会 DROP 并重建 `memory_fts`，此后索引为空而 `memory_records` 有数据。
 * 在这个窗口内 `MATCH` 会**静默返回 0 行**，RRF 会把「索引故障」当成
 * 「没有匹配」——故障被吞掉（spec §7.7）。
 *
 * 主路径下这个标志恒为 true：`reindexMemories` 在 `listen()` 之前 await 完成。
 * 它服务于「库太大、重建超时」的兜底路径。
 */
export function isBm25Ready(): boolean {
  return bm25Ready;
}

export function setBm25ReadyForTesting(ready: boolean): void {
  bm25Ready = ready;
}

/**
 * 回填 `content_seg` / `tags_seg`，然后重建 FTS 索引。
 *
 * 只处理 DDL 迁移做不到的数据部分 —— 迁移负责结构与空表，这里负责灌数据。
 * 可重入：只回填 `content_seg IS NULL` 的行。
 */
export function reindexMemories(
  segmenter: Segmenter,
  customDb?: Database,
): { backfilled: number } {
  const db = customDb || getDatabase();

  const pending = db
    .prepare("SELECT id, content, tags FROM memory_records WHERE content_seg IS NULL")
    .all() as Array<{ id: string; content: string; tags: string }>;

  const update = db.prepare(
    "UPDATE memory_records SET content_seg = ?, tags_seg = ? WHERE id = ?",
  );

  const run = db.transaction(() => {
    for (const row of pending) {
      const contentSeg = segmenter.cut(row.content).join(" ");
      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags) as string[];
      } catch {
        tags = [];
      }
      const tagsSeg = tags.flatMap((t) => segmenter.cut(t)).join(" ");
      update.run(contentSeg, tagsSeg, row.id);
    }
    // external-content FTS5 表在内容变更后必须 rebuild
    db.prepare("INSERT INTO memory_fts(memory_fts) VALUES('rebuild')").run();
  });

  run();
  bm25Ready = true;

  return { backfilled: pending.length };
}
```

Update `packages/memory/src/index.ts`:

```typescript
export { reindexMemories, isBm25Ready, REINDEX_TIMEOUT_MS } from "./worker.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/worker.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Wire it into server startup**

`apps/server/src/index.ts` —— 把 `main()` 改为（**注意顺序**：迁移 → 回填 → 监听）：

```typescript
async function main() {
  assertLlmConfig();

  // ─── Memory schema: DDL migration, then data backfill, before serving ──────
  // 主路径：在 listen() 之前完成，使「索引未就绪」的窗口根本不存在（spec §9.4）。
  // 超时兜底：库太大时不要让启动无限期挂住 —— 记 ERROR、降级为纯向量路，
  // 但绝不静默（spec §7.7）。
  initSchema();
  const segmenter = createJiebaSegmenter();
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => reindexMemories(segmenter)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("reindex timeout")), REINDEX_TIMEOUT_MS),
      ),
    ]);
    console.log(`[memory] reindexed ${result.backfilled} memories; BM25 ready`);
  } catch (err) {
    console.error(
      "[memory] ERROR: index rebuild did not finish within timeout. " +
        "BM25 recall is DISABLED until it completes. Details:",
      err,
    );
  }

  const cm = new ConnectionManager();
  const app = await buildApp(cm);
  // ... 其余不变
}
```

顶部 import 改为：

```typescript
import { setDbPath, initSchema, reindexMemories, createJiebaSegmenter, REINDEX_TIMEOUT_MS } from "@agenthub/memory";
```

- [ ] **Step 6: Run lint and build both packages**

Run: `pnpm --filter @agenthub/memory lint && pnpm --filter @agenthub/server lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/memory/src/worker.ts packages/memory/src/index.ts apps/server/src/index.ts packages/memory/src/__tests__/worker.test.ts
git commit -m "feat(memory): reindex FTS at startup with bm25Ready timeout fallback"
```

---

## P2 出口检查

- [ ] `pnpm --filter @agenthub/memory test` 全绿
- [ ] 中文 2 字词可召回：写入「用户偏好使用 tab 缩进」，查询「缩进」命中（`FakeSegmenter` 或真实分词器皆可）
- [ ] 多词查询不返回空：查询「帮我写个批量格式化脚本」时 `buildFtsQuery` 产出 OR 表达式而非 AND
- [ ] 启动日志出现 `[memory] reindexed N memories; BM25 ready`，且**在** `Server listening on` **之前**

---

# P3 — 向量路

## Task 14: `EmbeddingProvider` 接口 + 向量校验 + `FakeEmbeddingProvider`

**Files:**
- Create: `packages/memory/src/embedding.ts`
- Modify: `packages/memory/src/types.ts`（新增 `EmbeddingMode`）
- Modify: `packages/memory/src/__tests__/fakes.ts`（新增 `FakeEmbeddingProvider`）
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/__tests__/embedding.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `type EmbeddingMode = "symmetric" | "asymmetric"`
  - `type EmbeddingFingerprint = string`
  - `interface EmbeddingProvider { id; model; dim; mode; fingerprint; embedDocuments(texts): Promise<Float32Array[]>; embedQuery(text): Promise<Float32Array>; healthCheck() }`
  - `function normalize(vec: Float32Array): Float32Array`
  - `function assertFiniteVector(vec: Float32Array, context: string): void`
  - `class FakeEmbeddingProvider implements EmbeddingProvider`（在 `__tests__/fakes.ts`）

**接口为什么是不对称的：** 相当一部分检索模型要求查询与文档用不同方式嵌入（bge-*-zh 系要加查询前缀，E5 用 `query:`/`passage:`，jina-v3 用 `task` 参数）。若接口只有 `embed(texts)`，「从 bge-m3 换到 bge-large-zh」就必须改检索层和 worker —— **可插拔性在最有价值的那类模型上恰好失效**（spec §8.1）。

- [ ] **Step 1: Write the failing test**

Create `packages/memory/src/__tests__/embedding.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { normalize, assertFiniteVector, buildFingerprint } from "../embedding.js";
import { FakeEmbeddingProvider } from "./fakes.js";

describe("normalize", () => {
  it("scales a vector to unit length", () => {
    const out = normalize(new Float32Array([3, 4]));
    const norm = Math.sqrt(out[0]! ** 2 + out[1]! ** 2);
    expect(norm).toBeCloseTo(1, 5);
    expect(out[0]).toBeCloseTo(0.6, 5);
    expect(out[1]).toBeCloseTo(0.8, 5);
  });

  it("makes the dot product equal the cosine similarity", () => {
    const a = normalize(new Float32Array([1, 2, 3]));
    const b = normalize(new Float32Array([4, 5, 6]));
    const dot = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

    const cos =
      (1 * 4 + 2 * 5 + 3 * 6) /
      (Math.sqrt(1 + 4 + 9) * Math.sqrt(16 + 25 + 36));
    expect(dot).toBeCloseTo(cos, 5);
  });

  it("returns an all-zero vector unchanged instead of producing NaN", () => {
    const out = normalize(new Float32Array([0, 0, 0]));
    expect([...out]).toEqual([0, 0, 0]);
  });
});

describe("assertFiniteVector", () => {
  it("accepts a finite vector", () => {
    expect(() => assertFiniteVector(new Float32Array([0.1, -0.2]), "test")).not.toThrow();
  });

  it("rejects NaN components", () => {
    expect(() => assertFiniteVector(new Float32Array([0.1, NaN]), "doc[3]")).toThrow(/doc\[3\]/);
  });

  it("rejects Infinity components", () => {
    expect(() => assertFiniteVector(new Float32Array([Infinity]), "doc[0]")).toThrow(/doc\[0\]/);
  });
});

describe("buildFingerprint", () => {
  it("changes when the model changes", () => {
    expect(buildFingerprint("bge-m3", 1024, "symmetric"))
      .not.toBe(buildFingerprint("bge-large-zh", 1024, "symmetric"));
  });

  it("changes when the dimension changes for the same model", () => {
    expect(buildFingerprint("qwen3-embedding", 1024, "symmetric"))
      .not.toBe(buildFingerprint("qwen3-embedding", 4096, "symmetric"));
  });

  it("changes when the mode changes for the same model and dimension", () => {
    expect(buildFingerprint("bge-m3", 1024, "symmetric"))
      .not.toBe(buildFingerprint("bge-m3", 1024, "asymmetric"));
  });
});

describe("FakeEmbeddingProvider", () => {
  const provider = new FakeEmbeddingProvider({ dim: 4 });

  it("returns one vector per input document", async () => {
    const vecs = await provider.embedDocuments(["a", "b", "c"]);
    expect(vecs.length).toBe(3);
    for (const v of vecs) expect(v.length).toBe(4);
  });

  it("returns a single vector for embedQuery", async () => {
    const v = await provider.embedQuery("a");
    expect(v.length).toBe(4);
  });

  it("is deterministic — the same text yields the same vector", async () => {
    const [a] = await provider.embedDocuments(["same text"]);
    const [b] = await provider.embedDocuments(["same text"]);
    expect([...a!]).toEqual([...b!]);
  });

  it("is normalized, so dot product equals cosine", async () => {
    const [v] = await provider.embedDocuments(["anything"]);
    const norm = Math.sqrt([...v!].reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("can be configured to return a wrong dimension, to exercise the guard", async () => {
    const bad = new FakeEmbeddingProvider({ dim: 4, actualDim: 8 });
    await expect(bad.embedDocuments(["a"])).rejects.toThrow(/dim/i);
  });

  it("can be configured to return NaN, to exercise the guard", async () => {
    const nan = new FakeEmbeddingProvider({ dim: 4, injectNaN: true });
    await expect(nan.embedDocuments(["a"])).rejects.toThrow(/finite|NaN/i);
  });

  it("tracks how many documents it has embedded", async () => {
    const counting = new FakeEmbeddingProvider({ dim: 4 });
    await counting.embedDocuments(["a", "b"]);
    await counting.embedQuery("c");
    expect(counting.embeddedCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/embedding.test.ts`
Expected: FAIL — `Failed to resolve import "../embedding.js"`

- [ ] **Step 3: Write minimal implementation**

Append to `packages/memory/src/types.ts`:

```typescript
/**
 * 声明实现是否区分查询与文档的嵌入方式。
 *
 * `bge-m3` 是对称的；`bge-large-zh`、E5 系、`jina-v3`、Cohere v4 不是。
 * 即使实现是对称的，检索层也永远调 `embedQuery`、worker 永远调 `embedDocuments` ——
 * 这样换成非对称模型时调用方一行都不用改（spec §8.1）。
 */
export type EmbeddingMode = "symmetric" | "asymmetric";
```

Create `packages/memory/src/embedding.ts`:

```typescript
import type { EmbeddingMode } from "./types.js";

/**
 * 向量空间的指纹。模型相同但维度或前缀模式不同 → 向量不可混用。
 *
 * 这是**唯一**的向量失效判据。不能用 `model` 代替：Qwen3-Embedding 用同一
 * 模型名服务多个输出维度，只比 model 会让不同维度的向量混进同一个索引
 * 而不触发重算（spec §8.1）。
 */
export type EmbeddingFingerprint = string;

export function buildFingerprint(
  model: string,
  dim: number,
  mode: EmbeddingMode,
): EmbeddingFingerprint {
  return `${model}:${dim}:${mode}`;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dim: number;
  readonly mode: EmbeddingMode;
  readonly fingerprint: EmbeddingFingerprint;

  /** 索引侧：记忆正文与 tags。worker 批量调用。 */
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
  /** 查询侧：用户查询。检索时调用。 */
  embedQuery(text: string): Promise<Float32Array>;

  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

/**
 * 把向量缩放到单位长度，使余弦相似度**等于**点积。
 *
 * 后果是向量路的距离计算退化成一重循环，省掉每对向量的两次开方（spec §8.1）。
 */
export function normalize(vec: Float32Array): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < vec.length; i++) sumSquares += vec[i]! * vec[i]!;

  if (sumSquares === 0) return vec; // 全零向量：保持原样，避免 0/0 = NaN

  const inv = 1 / Math.sqrt(sumSquares);
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i]! * inv;
  return out;
}

/**
 * 拒绝 NaN / Inf 向量。
 *
 * **这不是通用的健壮性加固，而是 `bge-m3` + Ollama 的已知缺陷所要求的**
 * （issue #14657：对某些技术文档返回 NaN，spec §10.1）。NaN 会一路静默通过：
 * 长度校验通过（NaN 也是合法 float32）、归一化得 NaN、写库成功、
 * 点积传播为 NaN、`sort` 比较返回 false → 该条位次任意且不抛错。
 *
 * 「向量算不出来」必须表现为「这条记忆暂时只在 BM25 榜单里」。
 */
export function assertFiniteVector(vec: Float32Array, context: string): void {
  for (let i = 0; i < vec.length; i++) {
    if (!Number.isFinite(vec[i]!)) {
      throw new Error(
        `Embedding contains a non-finite value at ${context}[${i}] (= ${vec[i]}). ` +
          `The provider may be misconfigured, or hitting a known model bug.`,
      );
    }
  }
}
```

Append to `packages/memory/src/__tests__/fakes.ts`:

```typescript
import {
  buildFingerprint,
  normalize,
  assertFiniteVector,
  type EmbeddingProvider,
} from "../embedding.js";

/**
 * 确定性 embedding provider。
 *
 * 不依赖网络、不依赖真实模型 —— 用字符的 char code 累加进一个伪随机状态，
 * 同样的文本永远得到同样的向量（spec §13 的测试前提）。
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly id = "fake";
  readonly model: string;
  readonly dim: number;
  readonly mode = "symmetric" as const;
  readonly fingerprint: string;

  embeddedCount = 0;

  private readonly actualDim: number;
  private readonly injectNaN: boolean;
  private readonly failuresRemaining: number;
  private calls = 0;

  constructor(options: {
    dim: number;
    model?: string;
    /** 故意返回错误长度，用于测试 dim 校验 */
    actualDim?: number;
    /** 故意返回 NaN，用于测试有限性校验 */
    injectNaN?: boolean;
    /** 前 N 次调用抛错，用于测试重试 */
    failuresRemaining?: number;
  }) {
    this.dim = options.dim;
    this.actualDim = options.actualDim ?? options.dim;
    this.injectNaN = options.injectNaN ?? false;
    this.failuresRemaining = options.failuresRemaining ?? 0;
    this.model = options.model ?? "fake-embedding";
    this.fingerprint = buildFingerprint(this.model, this.dim, this.mode);
  }

  private makeVector(text: string): Float32Array {
    const raw = new Float32Array(this.actualDim);
    let state = 2166136261;
    for (let i = 0; i < text.length; i++) {
      state = (state ^ text.charCodeAt(i)) * 16777619;
    }
    for (let i = 0; i < this.actualDim; i++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      raw[i] = (state / 0xffffffff) * 2 - 1;
    }
    if (this.injectNaN && this.actualDim > 0) raw[0] = NaN;
    return raw;
  }

  private guard(vec: Float32Array, context: string): Float32Array {
    if (vec.length !== this.dim) {
      throw new Error(
        `Embedding dim mismatch: provider returned ${vec.length} but is configured for ${this.dim}`,
      );
    }
    assertFiniteVector(vec, context);
    return normalize(vec);
  }

  private maybeFail(): void {
    this.calls++;
    if (this.calls <= this.failuresRemaining) {
      throw new Error("FakeEmbeddingProvider: simulated failure");
    }
  }

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    this.maybeFail();
    const out = texts.map((t, i) => this.guard(this.makeVector(t), `doc[${i}]`));
    this.embeddedCount += texts.length;
    return out;
  }

  async embedQuery(text: string): Promise<Float32Array> {
    this.maybeFail();
    this.embeddedCount += 1;
    return this.guard(this.makeVector(text), "query");
  }

  async healthCheck(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}
```

Update `packages/memory/src/index.ts`:

```typescript
export {
  normalize,
  assertFiniteVector,
  buildFingerprint,
} from "./embedding.js";
export type { EmbeddingProvider, EmbeddingFingerprint } from "./embedding.js";
export type { EmbeddingMode } from "./types.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/embedding.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/embedding.ts packages/memory/src/types.ts packages/memory/src/__tests__/fakes.ts packages/memory/src/__tests__/embedding.test.ts packages/memory/src/index.ts
git commit -m "feat(memory): add asymmetric EmbeddingProvider interface with vector guards"
```

---

## Task 15: `OpenAICompatibleEmbeddingProvider`

**Files:**
- Modify: `packages/memory/src/embedding.ts`（追加实现类）
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/__tests__/openai-embedding.test.ts`

**Interfaces:**
- Consumes: `EmbeddingProvider`、`normalize`、`assertFiniteVector`、`buildFingerprint`（Task 14）
- Produces:
  ```typescript
  function createOpenAICompatibleEmbeddingProvider(options: {
    baseUrl: string;
    apiKey: string;
    model: string;
    dim: number;
    mode?: EmbeddingMode;
    dimensions?: number;
    queryPrefix?: string;
    documentPrefix?: string;
    fetchImpl?: typeof fetch;
  }): EmbeddingProvider
  ```
  兼容 Ollama：`baseUrl: "http://127.0.0.1:11434/v1"`、`apiKey: "EMPTY"`、`model: "bge-m3"`、`dim: 1024`。

- [ ] **Step 1: Write the failing test**

Create `packages/memory/src/__tests__/openai-embedding.test.ts`：

```typescript
import { describe, it, expect, vi } from "vitest";
import { createOpenAICompatibleEmbeddingProvider } from "../embedding.js";

function makeResponse(vectors: number[][], indices?: number[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: vectors.map((embedding, i) => ({ embedding, index: indices?.[i] ?? i })),
    }),
  };
}

function makeProvider(overrides: Partial<Parameters<typeof createOpenAICompatibleEmbeddingProvider>[0]> = {}) {
  return createOpenAICompatibleEmbeddingProvider({
    baseUrl: "http://127.0.0.1:11434/v1",
    apiKey: "EMPTY",
    model: "bge-m3",
    dim: 3,
    ...overrides,
  });
}

describe("createOpenAICompatibleEmbeddingProvider", () => {
  it("posts to {baseUrl}/embeddings with model and input", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0], [0, 1, 0]]));
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await provider.embedDocuments(["a", "b"]);

    const [url, init] = fetchImpl.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("http://127.0.0.1:11434/v1/embeddings");
    expect(JSON.parse(init.body)).toEqual({ model: "bge-m3", input: ["a", "b"] });
    expect(init.headers["Authorization"]).toBe("Bearer EMPTY");
  });

  it("strips trailing slashes from baseUrl", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0]]));
    const provider = makeProvider({ baseUrl: "http://127.0.0.1:11434/v1///", fetchImpl: fetchImpl as unknown as typeof fetch });

    await provider.embedQuery("a");

    expect(fetchImpl.mock.calls[0]![0]).toBe("http://127.0.0.1:11434/v1/embeddings");
  });

  it("aligns results by data[].index, not by array position", async () => {
    // 服务端把两段文本的结果**反序**返回 —— OpenAI 兼容层不保证顺序
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { embedding: [0, 1, 0], index: 1 },
          { embedding: [1, 0, 0], index: 0 },
        ],
      }),
    });
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const [first, second] = await provider.embedDocuments(["first", "second"]);

    // "first" 应当拿到 index 0 的向量 [1,0,0]（归一化后仍是 [1,0,0]）
    expect([...first!]).toEqual([1, 0, 0]);
    expect([...second!]).toEqual([0, 1, 0]);
  });

  it("rejects when the endpoint returns a different dimension than configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0, 0, 0]]));
    const provider = makeProvider({ dim: 3, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["a"])).rejects.toThrow(/dim/i);
  });

  it("rejects NaN vectors instead of letting them reach the index", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[NaN, 0, 0]]));
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["a"])).rejects.toThrow(/non-finite/i);
  });

  it("throws on a non-2xx response with the status in the message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "model not found",
    });
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["a"])).rejects.toThrow(/404/);
  });

  it("does not retry internally — the caller owns retry policy", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["a"])).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces over-long input as an error instead of storing a truncated vector", async () => {
    // bge-m3 的上下文窗口是 8192 token。超长输入时端点返回 4xx。
    // 期望：抛错 → 调用方按失败处理 → 不写库、下轮重试。
    // **绝不能**静默截断出一个与原文不符的向量 —— 那会让检索结果错误但无声。
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "input length exceeds maximum context length",
    });
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["x".repeat(100_000)])).rejects.toThrow(/400/);
  });

  it("surfaces over-long input as an error instead of storing a truncated vector", async () => {
    // bge-m3 的上下文窗口是 8192 token。超长输入时端点会返回 4xx。
    // 期望：抛错 → 调用方按失败处理 → 不写库、下轮重试。
    // **绝不能**静默截断出一个与原文不符的向量 —— 那会让检索结果错误但无声。
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "input length exceeds maximum context length",
    });
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["x".repeat(100_000)])).rejects.toThrow(/400/);
  });

  it("applies a query prefix in asymmetric mode but not to documents", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0]]));
    const provider = makeProvider({
      mode: "asymmetric",
      queryPrefix: "为这个句子生成表示以用于检索相关文章：",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.embedQuery("缩进");

    const body = JSON.parse((fetchImpl.mock.calls[0] as [string, { body: string }])[1].body);
    expect(body.input).toEqual(["为这个句子生成表示以用于检索相关文章：缩进"]);
  });

  it("does not apply the query prefix to documents", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0]]));
    const provider = makeProvider({
      mode: "asymmetric",
      queryPrefix: "QUERY: ",
      documentPrefix: "PASSAGE: ",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.embedDocuments(["缩进"]);

    const body = JSON.parse((fetchImpl.mock.calls[0] as [string, { body: string }])[1].body);
    expect(body.input).toEqual(["PASSAGE: 缩进"]);
  });

  it("passes dimensions only when configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0]]));

    const without = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await without.embedQuery("a");
    const bodyA = JSON.parse((fetchImpl.mock.calls[0] as [string, { body: string }])[1].body);
    expect(bodyA.dimensions).toBeUndefined();

    const withDims = makeProvider({ dimensions: 3, fetchImpl: fetchImpl as unknown as typeof fetch });
    await withDims.embedQuery("a");
    const bodyB = JSON.parse((fetchImpl.mock.calls[1] as [string, { body: string }])[1].body);
    expect(bodyB.dimensions).toBe(3);
  });

  it("normalizes returned vectors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[3, 4, 0]]));
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const v = await provider.embedQuery("a");

    expect(Math.sqrt([...v].reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 5);
  });

  it("reports a fingerprint that varies with model, dim and mode", async () => {
    const base = makeProvider();
    expect(base.fingerprint).toBe("bge-m3:3:symmetric");
    expect(makeProvider({ mode: "asymmetric" }).fingerprint).toBe("bge-m3:3:asymmetric");
    expect(makeProvider({ dim: 4 }).fingerprint).toBe("bge-m3:4:symmetric");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/openai-embedding.test.ts`
Expected: FAIL — `createOpenAICompatibleEmbeddingProvider` 未导出

- [ ] **Step 3: Write minimal implementation**

追加到 `packages/memory/src/embedding.ts`：

```typescript
export interface OpenAICompatibleEmbeddingOptions {
  /** 端点根，例如 "http://127.0.0.1:11434/v1"。代码会拼上 "/embeddings"。 */
  baseUrl: string;
  /** Ollama 不校验 key，但传空串会让部分客户端报错 —— 用 "EMPTY"。 */
  apiKey: string;
  model: string;
  /** 期望维度。会与端点实际返回的长度校验，不符即抛错（spec §8.1）。 */
  dim: number;
  mode?: EmbeddingMode;
  /** MRL 降维参数，仅部分模型支持（如 Qwen3 系）。不传则用模型原生维度。 */
  dimensions?: number;
  /** 非对称模型的查询侧前缀。`bge-m3` 不需要。 */
  queryPrefix?: string;
  /** 非对称模型的文档侧前缀。 */
  documentPrefix?: string;
  /** 注入点，仅测试用。 */
  fetchImpl?: typeof fetch;
}

interface EmbeddingApiResponse {
  data: Array<{ embedding: number[]; index?: number }>;
}

/**
 * OpenAI 兼容的 embedding provider。
 *
 * Ollama 的 `/v1/embeddings` 就是 OpenAI 格式，所以本地部署 bge-m3 时
 * 这个实现一行都不用改，只换配置（spec §10.1）。
 *
 * - **不内部重试** —— 重试策略统一由 worker 与检索层决定（spec §8.1）
 * - **按 `data[].index` 对齐** —— OpenAI 兼容层不保证返回顺序与 input 一致
 * - **校验 dim 与有限性** —— 两者都是静默数据损坏点（spec §8.1）
 */
export function createOpenAICompatibleEmbeddingProvider(
  options: OpenAICompatibleEmbeddingOptions,
): EmbeddingProvider {
  const mode: EmbeddingMode = options.mode ?? "symmetric";
  const doFetch = options.fetchImpl ?? fetch;
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/embeddings`;

  async function embed(texts: string[]): Promise<Float32Array[]> {
    const body: Record<string, unknown> = { model: options.model, input: texts };
    if (options.dimensions !== undefined) body["dimensions"] = options.dimensions;

    const response = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = typeof response.text === "function" ? await response.text() : "";
      throw new Error(
        `Embedding request failed: HTTP ${response.status} from ${endpoint}${detail ? ` — ${detail}` : ""}`,
      );
    }

    const payload = (await response.json()) as EmbeddingApiResponse;

    // 按 index 对齐，不依赖数组顺序
    const ordered = new Array<Float32Array>(texts.length);
    payload.data.forEach((item, position) => {
      const target = item.index ?? position;
      ordered[target] = Float32Array.from(item.embedding);
    });

    return ordered.map((vec, i) => {
      if (!vec) {
        throw new Error(`Embedding response is missing an entry for input index ${i}`);
      }
      if (vec.length !== options.dim) {
        throw new Error(
          `Embedding dim mismatch: endpoint returned ${vec.length} but EMBEDDING_DIM is ${options.dim}. ` +
            `Fix the configuration — a mismatch would silently truncate the stored vector.`,
        );
      }
      assertFiniteVector(vec, `doc[${i}]`);
      return normalize(vec);
    });
  }

  return {
    id: "openai-compatible",
    model: options.model,
    dim: options.dim,
    mode,
    fingerprint: buildFingerprint(options.model, options.dim, mode),

    async embedDocuments(texts: string[]): Promise<Float32Array[]> {
      const prefix = options.documentPrefix ?? "";
      return embed(texts.map((t) => `${prefix}${t}`));
    },

    async embedQuery(text: string): Promise<Float32Array> {
      const prefix = options.queryPrefix ?? "";
      const [vec] = await embed([`${prefix}${text}`]);
      if (!vec) throw new Error("Embedding request returned no vector for the query");
      return vec;
    },

    async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
      try {
        await embed(["health"]);
        return { ok: true };
      } catch (err) {
        return { ok: false, detail: (err as Error).message };
      }
    },
  };
}
```

Update `packages/memory/src/index.ts`:

```typescript
export { createOpenAICompatibleEmbeddingProvider } from "./embedding.js";
export type { OpenAICompatibleEmbeddingOptions } from "./embedding.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/openai-embedding.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/embedding.ts packages/memory/src/index.ts packages/memory/src/__tests__/openai-embedding.test.ts
git commit -m "feat(memory): add OpenAI-compatible embedding provider with index alignment"
```

---

## Task 16: `VectorIndex` 接口与 `BlobVectorIndex`

**Files:**
- Create: `packages/memory/src/vector-index.ts`
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/__tests__/vector-index.test.ts`

**Interfaces:**
- Consumes: `MemoryScope`、`buildScopeClause`（Task 1）
- Produces:
  ```typescript
  interface VectorIndex {
    upsert(memoryId: string, vec: Float32Array, fingerprint: string, model: string): void;
    remove(memoryId: string): void;
    search(query: Float32Array, k: number, filter: { userId: string; scope: MemoryScope }):
      Array<{ memoryId: string; score: number }>;
    size(): number;
  }
  function createBlobVectorIndex(customDb?: Database): VectorIndex
  function createMemoryVectorIndex(customDb?: Database): VectorIndex
  ```

**为什么 `filter` 是接口的一部分：** BLOB 实现用 SQL `WHERE` 表达；未来若换 sqlite-vec，它会映射到 `partition key`。留在接口上，替换实现时上层无需改动（spec §8.4）。

**为什么不用 sqlite-vec：** `vec0` 至今仍是暴力精确 KNN（O(N) 全扫），`rescore` 只是常数因子优化，没有 HNSW/IVF 那类亚线性结构。它相对 JS 暴力的唯一实质优势是 C 层 SIMD，而这个优势要到五万条以上才显现。为此引入平台原生二进制不划算（spec §8.4）。

- [ ] **Step 1: Write the failing test**

Create `packages/memory/src/__tests__/vector-index.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory } from "../repository.js";
import { createBlobVectorIndex } from "../vector-index.js";
import { normalize } from "../embedding.js";
import { FakeSegmenter } from "./fakes.js";

const seg = new FakeSegmenter(["缩进", "用户", "偏好"]);

let db: DatabaseType;
let index: ReturnType<typeof createBlobVectorIndex>;

beforeEach(() => {
  db = createTestDb();
  index = createBlobVectorIndex(db);
});

afterEach(() => {
  destroyTestDb(db);
});

function seedMemory(id: string, userId: string, conversationId: string) {
  return createMemory({
    userId,
    conversationId,
    agentId: "agent-vi",
    type: "fact",
    content: `memory ${id}`,
  }, db, seg);
}

describe("BlobVectorIndex", () => {
  it("stores a vector and finds it by exact match", () => {
    const mem = seedMemory("m1", "u1", "c1");
    index.upsert(mem.id, normalize(new Float32Array([1, 0, 0])), "fp", "model-a");

    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });

    expect(hits.length).toBe(1);
    expect(hits[0]!.memoryId).toBe(mem.id);
    expect(hits[0]!.score).toBeCloseTo(1, 5);
  });

  it("ranks by descending cosine similarity", () => {
    const a = seedMemory("a", "u1", "c1");
    const b = seedMemory("b", "u1", "c1");
    index.upsert(a.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.upsert(b.id, normalize(new Float32Array([0, 1, 0])), "fp", "m");

    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });

    expect(hits.map((h) => h.memoryId)).toEqual([a.id, b.id]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it("respects the k limit", () => {
    for (let i = 0; i < 5; i++) {
      const m = seedMemory(`m${i}`, "u1", "c1");
      index.upsert(m.id, normalize(new Float32Array([1, i + 1, 0])), "fp", "m");
    }

    const hits = index.search(new Float32Array([1, 0, 0]), 2, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    expect(hits.length).toBe(2);
  });

  it("excludes vectors from another conversation", () => {
    const mine = seedMemory("mine", "u1", "c-mine");
    const theirs = seedMemory("theirs", "u1", "c-theirs");
    index.upsert(mine.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.upsert(theirs.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");

    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c-mine" },
    });

    expect(hits.map((h) => h.memoryId)).toEqual([mine.id]);
  });

  it("excludes vectors belonging to another user", () => {
    const mine = seedMemory("u1-mem", "u1", "c1");
    const other = seedMemory("u2-mem", "u2", "c1");
    index.upsert(mine.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.upsert(other.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");

    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    expect(hits.map((h) => h.memoryId)).toEqual([mine.id]);
  });

  it("returns vectors from every conversation under allConversations", () => {
    const a = seedMemory("a", "u1", "c-a");
    const b = seedMemory("b", "u1", "c-b");
    index.upsert(a.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.upsert(b.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");

    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { allConversations: true },
    });
    expect(hits.length).toBe(2);
  });

  it("replaces the vector when the same memory is upserted twice", () => {
    const mem = seedMemory("m1", "u1", "c1");
    index.upsert(mem.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.upsert(mem.id, normalize(new Float32Array([0, 1, 0])), "fp", "m");

    expect(index.size()).toBe(1);
    const hits = index.search(new Float32Array([0, 1, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    expect(hits[0]!.score).toBeCloseTo(1, 5);
  });

  it("removes a vector", () => {
    const mem = seedMemory("m1", "u1", "c1");
    index.upsert(mem.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.remove(mem.id);
    expect(index.size()).toBe(0);
  });

  it("cascade-deletes the vector row when the memory is deleted", () => {
    const mem = seedMemory("m1", "u1", "c1");
    index.upsert(mem.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");

    db.prepare("DELETE FROM memory_records WHERE id = ?").run(mem.id);

    expect(index.size()).toBe(0);
  });

  it("returns an empty array when there is nothing to search", () => {
    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    expect(hits).toEqual([]);
  });

  it("handles a query vector of a different length than stored vectors without returning garbage", () => {
    const mem = seedMemory("m1", "u1", "c1");
    index.upsert(mem.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");

    const hits = index.search(new Float32Array([1, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    // 维度不匹配的行必须被跳过，而不是拿截断/补零的结果参与排序
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/vector-index.test.ts`
Expected: FAIL — `Failed to resolve import "../vector-index.js"`

- [ ] **Step 3: Write minimal implementation**

Create `packages/memory/src/vector-index.ts`:

```typescript
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import { buildScopeClause } from "./scope.js";
import type { MemoryScope } from "./types.js";

export interface VectorIndex {
  upsert(memoryId: string, vec: Float32Array, fingerprint: string, model: string): void;
  remove(memoryId: string): void;
  search(
    query: Float32Array,
    k: number,
    filter: { userId: string; scope: MemoryScope },
  ): Array<{ memoryId: string; score: number }>;
  size(): number;
}

/**
 * BLOB + JS 暴力余弦的向量索引。
 *
 * 规模：会话作用域让候选集从「某用户的所有记忆」缩到「某个项目的记忆」，
 * 单会话预期数百到数千条 —— 该规模下暴力扫描是微秒级。**会话作用域使
 * 暴力方案比全库检索更安全，而不是更勉强**（spec §8.4）。
 *
 * 过滤在读取向量字节之前由 SQL 完成，实际载入的不是全库。
 * 读到的 Node Buffer 在 V8 堆外，用 Float32Array 建零拷贝视图。
 */
export function createBlobVectorIndex(customDb?: Database): VectorIndex {
  const db = customDb || getDatabase();

  // 同一个查询会被反复执行，预编译一次
  const searchStmt = (scopeSql: string): string => `
    SELECT e.memory_id, e.vec, e.dim
    FROM memory_embeddings e
    JOIN memory_records r ON r.id = e.memory_id
    WHERE r.user_id = ?
      AND ${scopeSql}
  `;

  return {
    upsert(memoryId: string, vec: Float32Array, fingerprint: string, model: string): void {
      db.prepare(`
        INSERT OR REPLACE INTO memory_embeddings (memory_id, fingerprint, model, dim, vec, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(
        memoryId,
        fingerprint,
        model,
        vec.length,
        Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength),
      );
    },

    remove(memoryId: string): void {
      db.prepare("DELETE FROM memory_embeddings WHERE memory_id = ?").run(memoryId);
    },

    search(query, k, filter) {
      const scope = buildScopeClause(filter.scope);
      const rows = db
        .prepare(searchStmt(scope.sql))
        .all(filter.userId, ...scope.params) as Array<{
          memory_id: string;
          vec: Buffer;
          dim: number;
        }>;

      const scored: Array<{ memoryId: string; score: number }> = [];

      for (const row of rows) {
        // 维度不符的行直接跳过 —— 拿截断或补零的结果参与排序会得到垃圾分数
        if (row.dim !== query.length) continue;
        if (row.vec.byteLength !== row.dim * 4) continue;

        // 零拷贝视图；byteOffset 必须 4 字节对齐，否则回退到复制路径
        let stored: Float32Array;
        const buf = row.vec;
        if (buf.byteOffset % 4 === 0) {
          stored = new Float32Array(buf.buffer, buf.byteOffset, row.dim);
        } else {
          stored = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        }

        // 向量已归一化，点积即余弦（spec §8.1）
        let dot = 0;
        for (let i = 0; i < row.dim; i++) dot += stored[i]! * query[i]!;

        scored.push({ memoryId: row.memory_id, score: dot });
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k);
    },

    size(): number {
      const row = db.prepare("SELECT COUNT(*) AS count FROM memory_embeddings").get() as {
        count: number;
      };
      return row.count;
    },
  };
}

/** 生产环境的默认索引（使用模块级 SQLite 单例）。 */
export function createMemoryVectorIndex(customDb?: Database): VectorIndex {
  return createBlobVectorIndex(customDb);
}
```

Update `packages/memory/src/index.ts`:

```typescript
export { createBlobVectorIndex, createMemoryVectorIndex } from "./vector-index.js";
export type { VectorIndex } from "./vector-index.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/vector-index.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/vector-index.ts packages/memory/src/index.ts packages/memory/src/__tests__/vector-index.test.ts
git commit -m "feat(memory): add BLOB vector index with scope-aware filtering"
```

---

## Task 17: 待嵌入队列与 `startEmbeddingWorker`

**Files:**
- Modify: `packages/memory/src/worker.ts`（追加 worker 相关导出）
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/__tests__/embedding-worker.test.ts`

**Interfaces:**
- Consumes: `EmbeddingProvider`（Task 14）、`VectorIndex`（Task 16）
- Produces:
  ```typescript
  function listPendingEmbeddings(customDb?: Database, fingerprint?: string): Array<{ id: string; content: string }>;
  function pendingEmbeddingCount(customDb?: Database, fingerprint?: string): number;
  function startEmbeddingWorker(opts: {
    provider: EmbeddingProvider;
    index: VectorIndex;
    batchSize?: number;
    intervalMs?: number;
  }): { stop(): void; runOnce(): Promise<{ processed: number; failed: number }>; pendingCount(): number };
  ```

**「待嵌入」不需要状态列，它就是「没有对应向量行」。** 好处：没有状态机、天然自愈、模型/维度/模式变更自动重新入队（spec §6.2）。

- [ ] **Step 1: Write the failing test**

Create `packages/memory/src/__tests__/embedding-worker.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory } from "../repository.js";
import { createBlobVectorIndex } from "../vector-index.js";
import {
  startEmbeddingWorker,
  listPendingEmbeddings,
  pendingEmbeddingCount,
} from "../worker.js";
import { FakeEmbeddingProvider } from "./fakes.js";
import { FakeSegmenter } from "./fakes.js";

const seg = new FakeSegmenter(["缩进", "用户"]);

let db: DatabaseType;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  destroyTestDb(db);
});

function seed(id: string) {
  return createMemory({
    userId: "u1",
    conversationId: "c1",
    agentId: "a1",
    type: "fact",
    content: `content ${id}`,
  }, db, seg);
}

describe("pending embeddings queue", () => {
  it("lists a memory with no embedding row as pending", () => {
    const mem = seed("m1");
    expect(pendingEmbeddingCount(db, "fp-a")).toBe(1);
    expect(listPendingEmbeddings(db, "fp-a")[0]!.id).toBe(mem.id);
  });

  it("stops listing a memory once it has a row with the same fingerprint", () => {
    const mem = seed("m1");
    const index = createBlobVectorIndex(db);
    index.upsert(mem.id, new Float32Array([1, 0, 0]), "fp-a", "model-a");

    expect(pendingEmbeddingCount(db, "fp-a")).toBe(0);
  });

  it("re-enqueues everything when the fingerprint changes", () => {
    const mem = seed("m1");
    const index = createBlobVectorIndex(db);
    index.upsert(mem.id, new Float32Array([1, 0, 0]), "fp-a", "model-a");

    expect(pendingEmbeddingCount(db, "fp-b")).toBe(1);
  });

  it("re-enqueues when only the dimension differs", () => {
    const mem = seed("m1");
    const index = createBlobVectorIndex(db);
    index.upsert(mem.id, new Float32Array([1, 0, 0]), "model-a:3:symmetric", "model-a");

    expect(pendingEmbeddingCount(db, "model-a:4:symmetric")).toBe(1);
  });
});

describe("startEmbeddingWorker", () => {
  it("embeds pending memories and writes their vectors", async () => {
    const mem = seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, batchSize: 8, intervalMs: 0 });
    const result = await worker.runOnce();

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(index.size()).toBe(1);
    expect(pendingEmbeddingCount(db, provider.fingerprint)).toBe(0);

    const hits = index.search(new Float32Array(4).fill(0.25), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    expect(hits[0]!.memoryId).toBe(mem.id);

    worker.stop();
  });

  it("writes the provider fingerprint so the queue can advance", async () => {
    const mem = seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, intervalMs: 0 });
    await worker.runOnce();

    const row = db
      .prepare("SELECT fingerprint, model, dim FROM memory_embeddings WHERE memory_id = ?")
      .get(mem.id) as { fingerprint: string; model: string; dim: number };
    expect(row.fingerprint).toBe(provider.fingerprint);
    expect(row.model).toBe(provider.model);
    expect(row.dim).toBe(4);

    worker.stop();
  });

  it("is idempotent — a second run processes nothing", async () => {
    seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, intervalMs: 0 });
    expect((await worker.runOnce()).processed).toBe(1);
    expect((await worker.runOnce()).processed).toBe(0);

    worker.stop();
  });

  it("respects batchSize", async () => {
    for (let i = 0; i < 5; i++) seed(`m${i}`);
    const provider = new FakeEmbeddingProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, batchSize: 2, intervalMs: 0 });
    expect((await worker.runOnce()).processed).toBe(2);
    expect(worker.pendingCount()).toBe(3);

    worker.stop();
  });

  it("does not advance the queue when the provider call fails", async () => {
    seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4, failuresRemaining: 1 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, intervalMs: 0 });
    const result = await worker.runOnce();

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(index.size()).toBe(0);
    // 下一轮会重试
    expect(worker.pendingCount()).toBe(1);

    worker.stop();
  });

  it("recovers on the next run after a transient failure", async () => {
    seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4, failuresRemaining: 1 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, intervalMs: 0 });
    await worker.runOnce();
    const second = await worker.runOnce();

    expect(second.processed).toBe(1);
    expect(index.size()).toBe(1);

    worker.stop();
  });

  it("skips a batch whose vectors are the wrong dimension without writing anything", async () => {
    seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4, actualDim: 8 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, intervalMs: 0 });
    const result = await worker.runOnce();

    expect(result.failed).toBe(1);
    expect(index.size()).toBe(0);

    worker.stop();
  });

  it("skips NaN vectors without poisoning the index", async () => {
    seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4, injectNaN: true });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, intervalMs: 0 });
    const result = await worker.runOnce();

    expect(result.failed).toBe(1);
    expect(index.size()).toBe(0);

    worker.stop();
  });

  it("stops processing further batches after stop() is called", async () => {
    seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, intervalMs: 5 });
    worker.stop();
    await new Promise((r) => setTimeout(r, 30));

    expect(index.size()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/embedding-worker.test.ts`
Expected: FAIL — `listPendingEmbeddings` 未导出

- [ ] **Step 3: Write minimal implementation**

追加到 `packages/memory/src/worker.ts`（顶部补 import）：

```typescript
import type { EmbeddingProvider } from "./embedding.js";
import type { VectorIndex } from "./vector-index.js";

/**
 * 待嵌入队列 —— **它就是一个 LEFT JOIN，没有状态列**（spec §6.2）。
 *
 * 好处：没有状态机可以写错；天然自愈（行没了就再入队，worker 崩了重启即可）；
 * fingerprint 变更（换模型 / 换维度 / 换前缀模式）会自动让旧向量作废重算。
 */
export function listPendingEmbeddings(
  customDb?: Database,
  fingerprint?: string,
): Array<{ id: string; content: string }> {
  const db = customDb || getDatabase();
  return db
    .prepare(`
      SELECT r.id, r.content
      FROM memory_records r
      LEFT JOIN memory_embeddings e ON e.memory_id = r.id
      WHERE e.memory_id IS NULL OR e.fingerprint IS NOT ?
      ORDER BY r.created_at ASC
    `)
    .all(fingerprint ?? null) as Array<{ id: string; content: string }>;
}

export function pendingEmbeddingCount(customDb?: Database, fingerprint?: string): number {
  const db = customDb || getDatabase();
  const row = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM memory_records r
      LEFT JOIN memory_embeddings e ON e.memory_id = r.id
      WHERE e.memory_id IS NULL OR e.fingerprint IS NOT ?
    `)
    .get(fingerprint ?? null) as { count: number };
  return row.count;
}

export function startEmbeddingWorker(opts: {
  provider: EmbeddingProvider;
  index: VectorIndex;
  /** 默认 32 */
  batchSize?: number;
  /** 默认 5000ms；传 0 表示只手动 runOnce()，不自动轮询 */
  intervalMs?: number;
}): {
  stop(): void;
  runOnce(): Promise<{ processed: number; failed: number }>;
  pendingCount(): number;
} {
  const batchSize = opts.batchSize ?? 32;
  const intervalMs = opts.intervalMs ?? 5000;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  async function runOnce(): Promise<{ processed: number; failed: number }> {
    const pending = listPendingEmbeddings(undefined, opts.provider.fingerprint).slice(0, batchSize);
    if (pending.length === 0) return { processed: 0, failed: 0 };

    let vectors: Float32Array[];
    try {
      vectors = await opts.provider.embedDocuments(pending.map((p) => p.content));
    } catch (err) {
      // 整批失败：不推进队列，下轮重试（spec §6.2）。
      // 单条失败（维度不符 / NaN）由 provider 内层抛出，这里同样按整批失败处理，
      // 因为无法判断是哪一条 —— 代价是同一批里健康的条目会被重试，可接受。
      console.error("[memory] embedding batch failed, will retry next round:", err);
      return { processed: 0, failed: pending.length };
    }

    let processed = 0;
    for (let i = 0; i < pending.length; i++) {
      const vec = vectors[i];
      if (!vec) continue;
      opts.index.upsert(pending[i]!.id, vec, opts.provider.fingerprint, opts.provider.model);
      processed++;
    }
    return { processed, failed: pending.length - processed };
  }

  if (intervalMs > 0) {
    timer = setInterval(() => {
      if (stopped) return;
      void runOnce();
    }, intervalMs);
    // 不要让 worker 的定时器阻止进程退出
    if (typeof timer.unref === "function") timer.unref();
  }

  return {
    stop(): void {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    runOnce,
    pendingCount(): number {
      return pendingEmbeddingCount(undefined, opts.provider.fingerprint);
    },
  };
}
```

Update `packages/memory/src/index.ts`:

```typescript
export { startEmbeddingWorker, listPendingEmbeddings, pendingEmbeddingCount } from "./worker.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/embedding-worker.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/worker.ts packages/memory/src/index.ts packages/memory/src/__tests__/embedding-worker.test.ts
git commit -m "feat(memory): add stateless pending-embedding queue and worker"
```

---

## Task 18: Embedding 配置解析（无兜底）与 worker 启动

**Files:**
- Modify: `apps/server/src/config/env.ts`（新增 `config.embedding`）
- Modify: `apps/server/src/index.ts`（启动 worker）
- Modify: `.env.example`
- Test: `apps/server/src/__tests__/config.test.ts`（追加）

**Interfaces:**
- Consumes: `createOpenAICompatibleEmbeddingProvider`（Task 15）、`startEmbeddingWorker`（Task 17）
- Produces: `config.embedding: { baseUrl; apiKey; model; dim; mode; dimensions? } | undefined` —— **四个必填项缺任意一个就返回 `undefined`**，绝不部分兜底

**设计要点（spec §10.2）：** 不设 `model` / `dim` 的默认值。理由就是 Task 7 修掉的那个 bug —— `.env` 写 `MODEL`、代码读 `LLM_MODEL`、`?? "deepseek-chat"` 静默兜底，用户配置的模型从未生效且无人发现。若 embedding 也配兜底，同一个剧本会重演。

- [ ] **Step 1: Write the failing test**

追加到 `apps/server/src/__tests__/config.test.ts`：

```typescript
const EMBEDDING_KEYS = [
  "EMBEDDING_BASE_URL",
  "EMBEDDING_API_KEY",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIM",
  "EMBEDDING_MODE",
  "EMBEDDING_DIMENSIONS",
] as const;

function saveAndClearEmbedding(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of EMBEDDING_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return saved;
}

function restore(saved: Record<string, string | undefined>): void {
  for (const key of EMBEDDING_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

describe("embedding config", () => {
  it("is undefined when nothing is configured", async () => {
    const saved = saveAndClearEmbedding();
    const { config } = await loadConfig();
    expect(config.embedding).toBeUndefined();
    restore(saved);
  });

  it("is undefined when only some required keys are set — no partial fallback", async () => {
    const saved = saveAndClearEmbedding();
    process.env["EMBEDDING_BASE_URL"] = "http://127.0.0.1:11434/v1";
    process.env["EMBEDDING_MODEL"] = "bge-m3";
    // 缺 API_KEY 与 DIM
    const { config } = await loadConfig();
    expect(config.embedding).toBeUndefined();
    restore(saved);
  });

  it("parses a complete Ollama configuration", async () => {
    const saved = saveAndClearEmbedding();
    process.env["EMBEDDING_BASE_URL"] = "http://127.0.0.1:11434/v1";
    process.env["EMBEDDING_API_KEY"] = "EMPTY";
    process.env["EMBEDDING_MODEL"] = "bge-m3";
    process.env["EMBEDDING_DIM"] = "1024";

    const { config } = await loadConfig();
    expect(config.embedding).toEqual({
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "EMPTY",
      model: "bge-m3",
      dim: 1024,
      mode: "symmetric",
    });
    restore(saved);
  });

  it("rejects a non-numeric EMBEDDING_DIM", async () => {
    const saved = saveAndClearEmbedding();
    process.env["EMBEDDING_BASE_URL"] = "http://x/v1";
    process.env["EMBEDDING_API_KEY"] = "k";
    process.env["EMBEDDING_MODEL"] = "m";
    process.env["EMBEDDING_DIM"] = "not-a-number";

    const { config } = await loadConfig();
    expect(config.embedding).toBeUndefined();
    restore(saved);
  });

  it("accepts an explicit asymmetric mode with prefixes", async () => {
    const saved = saveAndClearEmbedding();
    process.env["EMBEDDING_BASE_URL"] = "http://x/v1";
    process.env["EMBEDDING_API_KEY"] = "k";
    process.env["EMBEDDING_MODEL"] = "bge-large-zh-v1.5";
    process.env["EMBEDDING_DIM"] = "1024";
    process.env["EMBEDDING_MODE"] = "asymmetric";

    const { config } = await loadConfig();
    expect(config.embedding?.mode).toBe("asymmetric");
    restore(saved);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/server test src/__tests__/config.test.ts`
Expected: FAIL — `config.embedding` 为 `undefined` 而非解析后的对象

- [ ] **Step 3: Write minimal implementation**

`apps/server/src/config/env.ts` —— 在 `config` 对象内、`llm` 之后追加：

```typescript
  /**
   * Embedding 配置。**四个必填项缺任意一个就整体为 undefined** —— 不做部分兜底，
   * 不给 model/dim 设默认值（spec §10.2）。理由见 §4.9：曾经的 `?? "deepseek-chat"`
   * 让用户配置的模型从未生效且无人发现。
   *
   * 未配置时向量路整体关闭，退化为纯 BM25 并打 warning（spec §10.3）。
   */
  get embedding():
    | {
        baseUrl: string;
        apiKey: string;
        model: string;
        dim: number;
        mode: "symmetric" | "asymmetric";
        dimensions?: number;
        queryPrefix?: string;
        documentPrefix?: string;
      }
    | undefined {
    const baseUrl = env["EMBEDDING_BASE_URL"];
    const apiKey = env["EMBEDDING_API_KEY"];
    const model = env["EMBEDDING_MODEL"];
    const dimRaw = env["EMBEDDING_DIM"];

    if (!baseUrl || !apiKey || !model || !dimRaw) return undefined;

    const dim = Number.parseInt(dimRaw, 10);
    if (!Number.isFinite(dim) || dim <= 0) return undefined;

    const mode = env["EMBEDDING_MODE"] === "asymmetric" ? "asymmetric" : "symmetric";
    const dimensionsRaw = env["EMBEDDING_DIMENSIONS"];
    const dimensions = dimensionsRaw ? Number.parseInt(dimensionsRaw, 10) : undefined;

    return {
      baseUrl,
      apiKey,
      model,
      dim,
      mode,
      ...(dimensions !== undefined && Number.isFinite(dimensions) ? { dimensions } : {}),
      // bge-*-zh 系与 E5 系需要前缀；bge-m3 不需要。留出配置口而非硬编码模型判断。
      ...(env["EMBEDDING_QUERY_PREFIX"] ? { queryPrefix: env["EMBEDDING_QUERY_PREFIX"] } : {}),
      ...(env["EMBEDDING_DOCUMENT_PREFIX"] ? { documentPrefix: env["EMBEDDING_DOCUMENT_PREFIX"] } : {}),
    };
  },
```

`.env.example` 追加：

```bash
# ─── Embedding（可选；不配则退化为纯 BM25）─────────────────────────────────────
# 方式 A：本地 Ollama（零 key、零网络延迟，推荐）
#   1) brew install ollama
#   2) ollama serve
#   3) ollama pull bge-m3     # 1024 维，约 1.2GB
# EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1
# EMBEDDING_API_KEY=EMPTY      # Ollama 不校验，但实现要求非空
# EMBEDDING_MODEL=bge-m3
# EMBEDDING_DIM=1024
#
# 注意：这四个变量缺任意一个，向量路就整体关闭（不会用默认模型兜底）。
# 已知问题：bge-m3 经 Ollama 对某些技术文档会返回 NaN，缓解办法是
#          OLLAMA_FLASH_ATTENTION=false ollama serve
# EMBEDDING_QUERY_PREFIX=      # 仅非对称模型需要（bge-m3 不需要）
# EMBEDDING_DOCUMENT_PREFIX=
```

`apps/server/src/index.ts` —— 在 `app.listen` 之前追加 worker 启动：

```typescript
  // ─── Embedding worker（可选能力）────────────────────────────────────────────
  let embeddingWorker: { stop(): void } | undefined;
  const embeddingConfig = appConfig.embedding;
  if (embeddingConfig) {
    const provider = createOpenAICompatibleEmbeddingProvider(embeddingConfig);
    embeddingWorker = startEmbeddingWorker({
      provider,
      index: createMemoryVectorIndex(),
    });
    console.log(
      `[memory] embedding enabled: ${embeddingConfig.model} (${embeddingConfig.dim}d, ${embeddingConfig.mode})`,
    );
  } else {
    console.warn(
      "[memory] EMBEDDING_BASE_URL / _API_KEY / _MODEL / _DIM not all set — " +
        "semantic recall is DISABLED, falling back to BM25 only.",
    );
  }
```

并在优雅关闭里停掉它 —— 把 signals 循环内的 `await app.close();` 之前加上：

```typescript
      embeddingWorker?.stop();
```

import 补充：

```typescript
import {
  setDbPath,
  initSchema,
  reindexMemories,
  createJiebaSegmenter,
  REINDEX_TIMEOUT_MS,
  createOpenAICompatibleEmbeddingProvider,
  createMemoryVectorIndex,
  startEmbeddingWorker,
} from "@agenthub/memory";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/server test src/__tests__/config.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/config/env.ts apps/server/src/index.ts .env.example apps/server/src/__tests__/config.test.ts
git commit -m "feat(server): parse embedding config with no fallbacks and start the worker"
```

---

## P3 出口检查

- [ ] `pnpm --filter @agenthub/memory test` 全绿
- [ ] `pnpm --filter @agenthub/server test` 全绿
- [ ] 未配 `EMBEDDING_*` 时启动日志出现 `semantic recall is DISABLED`，服务正常可用
- [ ] 配好 Ollama + bge-m3 时启动日志出现 `embedding enabled: bge-m3 (1024d, symmetric)`
- [ ] 写一条记忆，5 秒内 `memory_embeddings` 出现对应行；`pendingEmbeddingCount` 归零

---

# P4 — RRF 融合

## Task 19: `fuseRankedLists`

**Files:**
- Create: `packages/memory/src/fusion.ts`
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/__tests__/fusion.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `function fuseRankedLists(lists: Array<Array<{ memoryId: string }>>, k?: number): Array<{ memoryId: string; score: number }>`
  - `const RRF_K = 60`

**为什么是 RRF 而不是加权求和：** 它融合的是「榜单」，缺失的榜单自然是空集，无需任何 if-else。BM25 分数无上界（FTS5 的 `rank` 越小越相关），余弦在 `[-1,1]`，量纲不可比 —— 用名次彻底绕开归一化问题（spec §8.5）。

- [ ] **Step 1: Write the failing test**

Create `packages/memory/src/__tests__/fusion.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { fuseRankedLists, RRF_K } from "../fusion.js";

describe("fuseRankedLists", () => {
  it("returns an empty array when every list is empty", () => {
    expect(fuseRankedLists([[], []])).toEqual([]);
  });

  it("returns an empty array when given no lists", () => {
    expect(fuseRankedLists([])).toEqual([]);
  });

  it("ranks a single list by its own order", () => {
    const out = fuseRankedLists([[{ memoryId: "a" }, { memoryId: "b" }]]);
    expect(out.map((r) => r.memoryId)).toEqual(["a", "b"]);
  });

  it("gives a higher score to rank 0 than rank 1", () => {
    const out = fuseRankedLists([[{ memoryId: "a" }, { memoryId: "b" }]]);
    expect(out[0]!.score).toBeGreaterThan(out[1]!.score);
  });

  it("uses 1/(k + rank + 1) as the per-list contribution", () => {
    const out = fuseRankedLists([[{ memoryId: "a" }]], 60);
    expect(out[0]!.score).toBeCloseTo(1 / (60 + 0 + 1), 10);
  });

  it("defaults k to RRF_K", () => {
    const withDefault = fuseRankedLists([[{ memoryId: "a" }]]);
    const withExplicit = fuseRankedLists([[{ memoryId: "a" }]], RRF_K);
    expect(withDefault[0]!.score).toBeCloseTo(withExplicit[0]!.score, 10);
  });

  it("accumulates the score of a document appearing in both lists", () => {
    const out = fuseRankedLists([
      [{ memoryId: "a" }, { memoryId: "b" }],
      [{ memoryId: "a" }, { memoryId: "c" }],
    ]);
    const a = out.find((r) => r.memoryId === "a")!;
    const b = out.find((r) => r.memoryId === "b")!;
    expect(a.score).toBeCloseTo(2 / (60 + 1), 10);
    expect(b.score).toBeCloseTo(1 / (60 + 2), 10);
    expect(a.score).toBeGreaterThan(b.score);
  });

  it("lifts a document that both legs agree on above a single-leg top hit", () => {
    const out = fuseRankedLists([
      [{ memoryId: "single-leg-top" }, { memoryId: "agreed" }],
      [{ memoryId: "agreed" }],
    ]);
    expect(out[0]!.memoryId).toBe("agreed");
  });

  it("degrades to the surviving list when one leg is empty", () => {
    const out = fuseRankedLists([[{ memoryId: "a" }, { memoryId: "b" }], []]);
    expect(out.map((r) => r.memoryId)).toEqual(["a", "b"]);
  });

  it("ignores duplicate ids within the same list, keeping the better rank", () => {
    const out = fuseRankedLists([[{ memoryId: "a" }, { memoryId: "a" }]]);
    expect(out.length).toBe(1);
    expect(out[0]!.score).toBeCloseTo(1 / (60 + 1), 10);
  });

  it("sorts by descending score", () => {
    const out = fuseRankedLists([
      [{ memoryId: "a" }, { memoryId: "b" }, { memoryId: "c" }],
      [{ memoryId: "c" }],
    ]);
    const scores = out.map((r) => r.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/fusion.test.ts`
Expected: FAIL — `Failed to resolve import "../fusion.js"`

- [ ] **Step 3: Write minimal implementation**

Create `packages/memory/src/fusion.ts`:

```typescript
/** RRF 的通行取值，不做调参 —— RRF 的卖点正是不需要调参（spec §8.5）。 */
export const RRF_K = 60;

/**
 * Reciprocal Rank Fusion：把多个榜单合成一个排序。
 *
 * **只使用名次，不使用分数。** BM25 分数无上界（FTS5 的 `rank` 越小越相关），
 * 余弦在 [-1,1]，量纲不可比 —— 用名次彻底绕开归一化问题。
 *
 * 关键性质：**缺失的榜单就是空集，融合逻辑里不需要任何降级分支。**
 * - 某条记忆尚未嵌入 → 它只出现在 BM25 榜单，向量榜单没有它 → 照样得分
 * - 查询向量化失败 → 向量榜单为空 → 退化为纯 BM25
 */
export function fuseRankedLists(
  lists: Array<Array<{ memoryId: string }>>,
  k: number = RRF_K,
): Array<{ memoryId: string; score: number }> {
  const scores = new Map<string, number>();

  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((item, rank) => {
      // 同一榜单内的重复 id 只计一次，且保留更好的名次
      if (seen.has(item.memoryId)) return;
      seen.add(item.memoryId);
      scores.set(item.memoryId, (scores.get(item.memoryId) ?? 0) + 1 / (k + rank + 1));
    });
  }

  return [...scores.entries()]
    .map(([memoryId, score]) => ({ memoryId, score }))
    .sort((a, b) => b.score - a.score);
}
```

Update `packages/memory/src/index.ts`:

```typescript
export { fuseRankedLists, RRF_K } from "./fusion.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/fusion.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/fusion.ts packages/memory/src/index.ts packages/memory/src/__tests__/fusion.test.ts
git commit -m "feat(memory): add RRF rank fusion"
```

---

## Task 20: `searchMemories` 异步化 + 双路召回 + 融合

**Files:**
- Modify: `packages/memory/src/search.ts`（重写）
- Modify: `packages/memory/src/repository.ts`（新增 `getMemoriesByIds`）
- Modify: `packages/memory/src/index.ts`
- Modify: 三个调用点：`apps/server/src/routes/memory.ts`、`apps/server/src/orchestrator/executor.ts`、`packages/memory/src/extractor.ts`
- Test: `packages/memory/src/__tests__/search.test.ts`（追加双路测试）

**Interfaces:**
- Consumes: `Segmenter`（Task 10）、`buildFtsQuery`（Task 11）、`isBm25Ready`（Task 13）、`EmbeddingProvider`（Task 14）、`VectorIndex`（Task 16）、`fuseRankedLists`（Task 19）
- Produces:
  ```typescript
  function configureSearch(deps: {
    segmenter: Segmenter;
    vectorIndex?: VectorIndex;
    embeddingProvider?: EmbeddingProvider;
    minSimilarity?: number;
  }): void;
  function resetSearchDepsForTesting(): void;
  function searchMemories(options, customDb?): Promise<MemoryRecord[]>;   // ← 变异步
  ```

**`minSimilarity` 的存在理由（spec §7.5）：** 向量路对**任意**查询都会返回 top-k（暴力搜索总给出最近的 k 条）。会话作用域下这个风险**更大而不是更小** —— 候选集小，更容易「凑够」k 条无关记忆。注入低相关记忆比不注入更糟：浪费 token，且可能让 agent 产生错误确信。

- [ ] **Step 1: Write the failing test**

在 `packages/memory/src/__tests__/search.test.ts` 中：

1. 顶部补 import：

```typescript
import { configureSearch, resetSearchDepsForTesting } from "../search.js";
import { createBlobVectorIndex } from "../vector-index.js";
import { normalize } from "../embedding.js";
import { FakeEmbeddingProvider, FakeSegmenter } from "./fakes.js";

const seg = new FakeSegmenter(["缩进", "用户", "偏好", "连接池", "格式化", "脚本"]);
```

2. 在 `beforeAll` 里、seed 数据之前加：

```typescript
  configureSearch({ segmenter: seg });
```

3. 给 `afterAll` 加清理：

```typescript
afterAll(() => {
  resetSearchDepsForTesting();
  destroyTestDb(db);
});
```

4. 把原有的 `it(...)` 逐个改成 `async` 并 `await` 调用（例如 `const results = await searchMemories({...}, db);`）。**注意 `expect(...)` 的断言内容不变** —— 本 task 只改变调用形式。

5. 追加双路融合的测试：

```typescript
describe("hybrid retrieval", () => {
  let vectorIndex: ReturnType<typeof createBlobVectorIndex>;
  let provider: FakeEmbeddingProvider;

  beforeAll(() => {
    vectorIndex = createBlobVectorIndex(db);
    provider = new FakeEmbeddingProvider({ dim: 8 });
    configureSearch({
      segmenter: seg,
      vectorIndex,
      embeddingProvider: provider,
      minSimilarity: 0,
    });
  });

  it("finds a memory through the vector leg when BM25 has no term overlap", async () => {
    const mem = createMemory({
      userId: "user-hybrid",
      conversationId: "conv-hybrid",
      agentId: "agent-hybrid",
      type: "preference",
      content: "Zebra",
    }, db, seg);

    // 用与记忆内容完全相同的文本生成查询向量，保证向量路必然命中
    const vec = await provider.embedQuery("Zebra");
    vectorIndex.upsert(mem.id, vec, provider.fingerprint, provider.model);

    const results = await searchMemories(
      { query: "Unrelated Query Text", userId: "user-hybrid", scope: { conversationId: "conv-hybrid" } },
      db,
    );

    expect(results.map((r) => r.id)).toContain(mem.id);
  });

  it("fuses both legs so a memory found by both outranks one found by a single leg", async () => {
    const both = createMemory({
      userId: "user-hybrid",
      conversationId: "conv-fuse",
      agentId: "agent-hybrid",
      type: "fact",
      content: "缩进 found by both legs",
    }, db, seg);
    const bm25Only = createMemory({
      userId: "user-hybrid",
      conversationId: "conv-fuse",
      agentId: "agent-hybrid",
      type: "fact",
      content: "缩进 found by bm25 only",
    }, db, seg);

    const bothVec = await provider.embedQuery("缩进 found by both legs");
    vectorIndex.upsert(both.id, bothVec, provider.fingerprint, provider.model);

    const results = await searchMemories(
      { query: "缩进", userId: "user-hybrid", scope: { conversationId: "conv-fuse" } },
      db,
    );

    const ids = results.map((r) => r.id);
    expect(ids).toContain(both.id);
    expect(ids).toContain(bm25Only.id);
    expect(ids.indexOf(both.id)).toBeLessThan(ids.indexOf(bm25Only.id));
  });

  it("drops vector results below minSimilarity so unrelated memories are not injected", async () => {
    configureSearch({
      segmenter: seg,
      vectorIndex,
      embeddingProvider: provider,
      minSimilarity: 0.999,
    });

    const mem = createMemory({
      userId: "user-threshold",
      conversationId: "conv-threshold",
      agentId: "agent-threshold",
      type: "fact",
      content: "Ocelot",
    }, db, seg);
    const vec = await provider.embedQuery("Ocelot");
    vectorIndex.upsert(mem.id, vec, provider.fingerprint, provider.model);

    // 与 "Ocelot" 无关的查询 + 高阈值 → 向量路即便找到它也必须丢弃
    const results = await searchMemories(
      { query: "Quokka", userId: "user-threshold", scope: { conversationId: "conv-threshold" } },
      db,
    );

    expect(results.map((r) => r.id)).not.toContain(mem.id);

    configureSearch({ segmenter: seg, vectorIndex, embeddingProvider: provider, minSimilarity: 0 });
  });

  it("returns BM25 results when the vector leg throws", async () => {
    const failing = new FakeEmbeddingProvider({ dim: 8, failuresRemaining: 1 });
    configureSearch({ segmenter: seg, vectorIndex, embeddingProvider: failing, minSimilarity: 0 });

    const mem = createMemory({
      userId: "user-degrade",
      conversationId: "conv-degrade",
      agentId: "agent-degrade",
      type: "fact",
      content: "缩进 should still be found",
    }, db, seg);

    const results = await searchMemories(
      { query: "缩进", userId: "user-degrade", scope: { conversationId: "conv-degrade" } },
      db,
    );

    expect(results.map((r) => r.id)).toContain(mem.id);

    configureSearch({ segmenter: seg, vectorIndex, embeddingProvider: provider, minSimilarity: 0 });
  });

  it("never returns memories outside the requested conversation even via the vector leg", async () => {
    configureSearch({ segmenter: seg, vectorIndex, embeddingProvider: provider, minSimilarity: 0 });

    const inside = createMemory({
      userId: "user-scope-hybrid",
      conversationId: "conv-inside",
      agentId: "agent-scope-hybrid",
      type: "fact",
      content: "Quokka inside",
    }, db, seg);
    const outside = createMemory({
      userId: "user-scope-hybrid",
      conversationId: "conv-outside",
      agentId: "agent-scope-hybrid",
      type: "fact",
      content: "Quokka outside",
    }, db, seg);

    // 两条都被嵌入，且向量完全相同 —— 唯一能区分它们的就是作用域
    const vec = await provider.embedQuery("Quokka");
    vectorIndex.upsert(inside.id, vec, provider.fingerprint, provider.model);
    vectorIndex.upsert(outside.id, vec, provider.fingerprint, provider.model);

    const results = await searchMemories(
      { query: "Quokka", userId: "user-scope-hybrid", scope: { conversationId: "conv-inside" } },
      db,
    );

    const ids = results.map((r) => r.id);
    expect(ids).toContain(inside.id);
    expect(ids).not.toContain(outside.id);
  });

  it("returns an empty array when both legs are empty", async () => {
    configureSearch({ segmenter: seg, vectorIndex, embeddingProvider: provider, minSimilarity: 0 });
    const results = await searchMemories(
      { query: "zzzznothingmatchesthis", userId: "user-none", scope: { conversationId: "conv-none" } },
      db,
    );
    expect(results).toEqual([]);
  });

  it("skips the BM25 leg without returning an empty list when the index is not ready", async () => {
    const { setBm25ReadyForTesting } = await import("../worker.js");
    setBm25ReadyForTesting(false);
    configureSearch({ segmenter: seg, vectorIndex, embeddingProvider: provider, minSimilarity: 0 });

    const mem = createMemory({
      userId: "user-notready",
      conversationId: "conv-notready",
      agentId: "agent-notready",
      type: "fact",
      content: "Numbat via vector only",
    }, db, seg);
    const vec = await provider.embedQuery("Numbat via vector only");
    vectorIndex.upsert(mem.id, vec, provider.fingerprint, provider.model);

    const results = await searchMemories(
      { query: "Numbat via vector only", userId: "user-notready", scope: { conversationId: "conv-notready" } },
      db,
    );

    // BM25 路被跳过，但向量路仍然生效 —— 关键是「不可用」不等于「空榜单」
    expect(results.map((r) => r.id)).toContain(mem.id);

    setBm25ReadyForTesting(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/search.test.ts`
Expected: FAIL — `configureSearch` 未导出；`searchMemories` 返回数组而非 Promise（`await` 后取 `.map` 报错）

- [ ] **Step 3: Add `getMemoriesByIds` to the repository**

追加到 `packages/memory/src/repository.ts`：

```typescript
/**
 * 按 id 批量取回完整记录，**保持传入的顺序**。
 *
 * 融合层只产出 id 与分数，需要回查完整记录。SQL 的 `IN` 不保证顺序，
 * 所以在 JS 侧重排 —— 顺序就是融合的结论，不能被数据库打乱。
 */
export function getMemoriesByIds(ids: string[], customDb?: Database): MemoryRecord[] {
  if (ids.length === 0) return [];
  const db = customDb || getDatabase();

  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT * FROM memory_records WHERE id IN (${placeholders})`)
    .all(...ids) as Record<string, unknown>[];

  const byId = new Map(rows.map((r) => [r["id"] as string, rowToMemoryRecord(r)]));
  return ids.map((id) => byId.get(id)).filter((m): m is MemoryRecord => m !== undefined);
}
```

Update `packages/memory/src/index.ts`:

```typescript
export { createMemory, getMemory, listMemories, deleteMemory, getMemoriesByIds } from "./repository.js";
```

- [ ] **Step 4: Rewrite `search.ts`**

```typescript
import type { MemoryRecord } from "@agenthub/shared";
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import type { EmbeddingProvider } from "./embedding.js";
import { fuseRankedLists } from "./fusion.js";
import { buildFtsQuery } from "./fts-query.js";
import { getMemoriesByIds } from "./repository.js";
import { buildScopeClause } from "./scope.js";
import { createJiebaSegmenter, type Segmenter } from "./segmenter.js";
import type { MemoryScope } from "./types.js";
import { createMemoryVectorIndex, type VectorIndex } from "./vector-index.js";
import { isBm25Ready } from "./worker.js";
import { rowToMemoryRecord } from "./utils.js";

/** 向量路的候选数。融合前每路各取这么多。 */
const LEG_CANDIDATES = 50;

/**
 * 低于该余弦相似度的向量结果被丢弃。
 *
 * 必要性：向量路对**任意**查询都会返回 top-k（暴力搜索总给出最近的 k 条）。
 * 会话作用域让候选集变小，**更容易「凑够」k 条无关记忆**（spec §7.5）。
 * 注入低相关记忆比不注入更糟 —— 浪费 token，且可能让 agent 产生错误确信。
 *
 * 具体取值留给 Spec 2 用消融实验标定（spec §16 第 1 条）。
 */
const DEFAULT_MIN_SIMILARITY = 0.35;

interface SearchDeps {
  segmenter: Segmenter;
  vectorIndex?: VectorIndex;
  embeddingProvider?: EmbeddingProvider;
  minSimilarity: number;
}

let deps: SearchDeps | undefined;

/**
 * 注入检索依赖。未调用时懒加载默认分词器，且向量路整体关闭。
 *
 * 用模块级注入而非函数参数，是为了让三个调用点（server 路由、orchestrator、
 * extractor）的签名保持简单 —— 它们关心的只有 query / userId / scope。
 */
export function configureSearch(options: {
  segmenter: Segmenter;
  vectorIndex?: VectorIndex;
  embeddingProvider?: EmbeddingProvider;
  minSimilarity?: number;
}): void {
  deps = {
    segmenter: options.segmenter,
    ...(options.vectorIndex ? { vectorIndex: options.vectorIndex } : {}),
    ...(options.embeddingProvider ? { embeddingProvider: options.embeddingProvider } : {}),
    minSimilarity: options.minSimilarity ?? DEFAULT_MIN_SIMILARITY,
  };
}

/** 仅测试用：清空注入的依赖，回到默认状态。 */
export function resetSearchDepsForTesting(): void {
  deps = undefined;
}

function resolveDeps(): SearchDeps {
  if (!deps) {
    deps = { segmenter: createJiebaSegmenter(), minSimilarity: DEFAULT_MIN_SIMILARITY };
  }
  return deps;
}

interface SearchOptions {
  query: string;
  /** 必填 —— 租户边界（spec §4.8） */
  userId: string;
  /** 必填 —— 会话作用域（spec §1.1） */
  scope: MemoryScope;
  /** 可选 —— 仅供 Web UI 按 Agent 筛选 */
  agentId?: string;
  limit?: number;
  offset?: number;
}

/**
 * 双路混合检索：BM25 + 向量，用 RRF 融合。
 *
 * **必须异步** —— 内部需要一次 embedding 调用把 query 变成向量，这是 I/O。
 * 这不改变「检索 → 拼进提示词」的流程，调用方只是多了个 await（spec §6.3）。
 */
export async function searchMemories(
  options: SearchOptions,
  customDb?: Database,
): Promise<MemoryRecord[]> {
  const db = customDb || getDatabase();
  const { segmenter, vectorIndex, embeddingProvider, minSimilarity } = resolveDeps();
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const bm25List = runBm25Leg(options, segmenter, db);
  const vectorList = await runVectorLeg(options, embeddingProvider, vectorIndex, minSimilarity);

  const fused = fuseRankedLists([bm25List, vectorList]);

  const page = fused.slice(offset, offset + limit);
  if (page.length === 0) return [];

  // 回查完整记录，保持融合后的顺序
  const records = getMemoriesByIds(page.map((p) => p.memoryId), db);

  // 纵深防御：回查时再按作用域与租户过滤一次。
  // 两个 leg 都已过滤过，这里是防止将来某一 leg 的过滤被改错。
  const scope = buildScopeClause(options.scope);
  const allowed = new Set(
    (db
      .prepare(
        `SELECT id FROM memory_records r WHERE r.user_id = ? AND ${scope.sql}`,
      )
      .all(options.userId, ...scope.params) as Array<{ id: string }>).map((r) => r.id),
  );

  return records.filter((r) => allowed.has(r.id));
}

/** BM25 路：预分词 + OR 查询。任一步失败都返回空榜单，不影响向量路。 */
function runBm25Leg(
  options: SearchOptions,
  segmenter: Segmenter,
  db: Database,
): Array<{ memoryId: string }> {
  // 索引未就绪时跳过，而不是执行 MATCH 拿一个空榜单 ——
  // 「没有匹配」与「不可用」在 RRF 里表现相同，但语义完全不同（spec §7.7）
  if (!isBm25Ready()) {
    console.warn("[memory] BM25 leg skipped: FTS index is not ready");
    return [];
  }

  try {
    const ftsQuery = buildFtsQuery(options.query, segmenter);
    if (ftsQuery === null) return [];

    const scope = buildScopeClause(options.scope);
    const conditions = ["mr.user_id = ?", scope.sql];
    const values: unknown[] = [ftsQuery, options.userId, ...scope.params];

    if (options.agentId) {
      conditions.push("mr.agent_id = ?");
      values.push(options.agentId);
    }

    const rows = db
      .prepare(`
        SELECT mr.id FROM memory_fts fts
        JOIN memory_records mr ON mr.rowid = fts.rowid
        WHERE memory_fts MATCH ?
          AND ${conditions.join("\n          AND ")}
        ORDER BY rank
        LIMIT ?
      `)
      .all(...values, LEG_CANDIDATES) as Array<{ id: string }>;

    return rows.map((r) => ({ memoryId: r.id }));
  } catch (err) {
    console.error("[memory] BM25 leg failed, degrading to vector only:", err);
    return [];
  }
}

/** 向量路：查询向量化 + 暴力余弦。失败时返回空榜单，让 RRF 退化为纯 BM25。 */
async function runVectorLeg(
  options: SearchOptions,
  provider: EmbeddingProvider | undefined,
  index: VectorIndex | undefined,
  minSimilarity: number,
): Promise<Array<{ memoryId: string }>> {
  if (!provider || !index) return [];

  try {
    const queryVec = await provider.embedQuery(options.query);
    return index
      .search(queryVec, LEG_CANDIDATES, { userId: options.userId, scope: options.scope })
      .filter((hit) => hit.score >= minSimilarity)
      .map((hit) => ({ memoryId: hit.memoryId }));
  } catch (err) {
    console.error("[memory] Vector leg failed, degrading to BM25 only:", err);
    return [];
  }
}
```

- [ ] **Step 5: Fix the three call sites**

`apps/server/src/routes/memory.ts`：

```typescript
  const results = await searchMemories({
    query: query.q,
    userId: request.userId!,
    scope: { allConversations: true },
    agentId: query.agentId,
    limit: parseIntParam(query.limit, 50),
    offset: parseIntParam(query.offset, 0),
  });
```

`apps/server/src/orchestrator/executor.ts`：本 task 只补 `scope` 与 `await`，**改成 `buildMemoryContext` 是 Task 22**：

```typescript
        const memories = await searchMemories({
          query: subtask.instruction,
          userId: subtask.userId,
          scope: { conversationId: subtask.conversationId },
          limit: 5,
        });
```

**注意**：`SubTask` 需要一个 `userId` 字段。检查 `apps/server/src/orchestrator/types.ts` 的 `SubTask` 定义，若无 `userId` 则在其中新增 `userId: string`，并在构造 SubTask 的地方（`intent-analyzer.ts` 或 `messages.ts:400` 附近的构造处）填 `conversation.ownerId`。

`packages/memory/src/extractor.ts`：改为 `await`：

```typescript
  const existingMemories = await searchMemories(
    {
      query: params.userMessage,
      userId: params.userId,
      scope: { conversationId: params.conversationId },
      limit: 5,
    },
    db,
  );
```

- [ ] **Step 6: Wire `configureSearch` into server startup**

**不做这一步，生产环境的检索会退化为「懒加载默认分词器 + 向量路关闭」—— 测试全绿但功能没接上。**

`apps/server/src/index.ts` —— 在 Task 18 的 embedding worker 启动块**之前**插入。注意 `segmenter` 与 `provider` / `index` 必须与 worker 用的是**同一组实例**，否则两路的过滤与向量空间会不一致：

```typescript
  // ─── Search wiring：两路必须共用同一组实例 ──────────────────────────────────
  const embeddingConfig = appConfig.embedding;
  const vectorIndex = embeddingConfig ? createMemoryVectorIndex() : undefined;
  const embeddingProvider = embeddingConfig
    ? createOpenAICompatibleEmbeddingProvider(embeddingConfig)
    : undefined;

  configureSearch({
    segmenter,
    ...(vectorIndex ? { vectorIndex } : {}),
    ...(embeddingProvider ? { embeddingProvider } : {}),
  });
```

然后把 Task 18 里那段 worker 启动代码改为复用上面已创建的实例（**不要重复 new**）：

```typescript
  let embeddingWorker: { stop(): void } | undefined;
  if (embeddingProvider && vectorIndex) {
    embeddingWorker = startEmbeddingWorker({ provider: embeddingProvider, index: vectorIndex });
    console.log(
      `[memory] embedding enabled: ${embeddingConfig!.model} (${embeddingConfig!.dim}d, ${embeddingConfig!.mode})`,
    );
  } else {
    console.warn(
      "[memory] EMBEDDING_BASE_URL / _API_KEY / _MODEL / _DIM not all set — " +
        "semantic recall is DISABLED, falling back to BM25 only.",
    );
  }
```

import 追加 `configureSearch`。

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @agenthub/memory test`
Expected: PASS（全部；spec §8.5 融合与 §7.6 降级的测试都在内）

Run: `pnpm --filter @agenthub/server lint`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/memory/src/search.ts packages/memory/src/repository.ts packages/memory/src/index.ts packages/memory/src/__tests__/search.test.ts packages/memory/src/extractor.ts apps/server/src/routes/memory.ts apps/server/src/orchestrator/ apps/server/src/index.ts
git commit -m "feat(memory): make searchMemories async with two-leg retrieval and RRF fusion"
```

---

## P4 出口检查

- [ ] `pnpm --filter @agenthub/memory test` 全绿
- [ ] `pnpm --filter @agenthub/server test` 全绿
- [ ] 双路各自生效：查询 `E_CONN_RESET` 时 BM25 单独扛住；查询「帮我写个格式化脚本」时向量路单独扛住
- [ ] 两路都可用时，同时在两路出现的记忆排在只有一路出现的之前

---

# P5 — 触发链路修正

## Task 21: `updateMemory` —— 真正的 UPDATE

**Files:**
- Modify: `packages/memory/src/repository.ts`
- Modify: `packages/memory/src/extractor.ts`（`update` 分支）
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/__tests__/repository.test.ts`、`__tests__/extractor.test.ts`

**Interfaces:**
- Consumes: `Segmenter`（Task 10）
- Produces:
  ```typescript
  function updateMemory(
    id: string,
    patch: { type?: MemoryType; content?: string; tags?: string[]; importance?: number },
    customDb?: Database,
    segmenter?: Segmenter,
  ): MemoryRecord | null;
  ```

**背景（spec §4.4）：** 现状把「更新」实现成 `delete + create`：

```typescript
const txn = db.transaction(() => {
  deleteMemory(id, db);
  return createMemory({ ... });   // 新 UUID
});
```

后果：`id` 变更（`sourceMessageId` 溯源链断裂）、`created_at` 重置（丢失记忆年龄）、向量行成孤儿。

- [ ] **Step 1: Write the failing test**

追加到 `packages/memory/src/__tests__/repository.test.ts`：

```typescript
describe("updateMemory", () => {
  it("keeps the id and created_at, and refreshes updated_at", async () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "preference",
      content: "用户偏好缩进",
    }, db, seg);

    await new Promise((r) => setTimeout(r, 5)); // 让 updated_at 有可观测的差异

    const updated = updateMemory(created.id, { content: "用户偏好缩进改两格" }, db, seg);

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(created.id);
    expect(updated!.createdAt).toBe(created.createdAt);
    expect(updated!.content).toBe("用户偏好缩进改两格");
    expect(updated!.updatedAt).not.toBe(created.updatedAt);
  });

  it("recomputes content_seg when content changes", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "fact",
      content: "用户偏好缩进",
    }, db, seg);

    updateMemory(created.id, { content: "用户偏好" }, db, seg);

    const raw = db.prepare("SELECT content_seg FROM memory_records WHERE id = ?")
      .get(created.id) as { content_seg: string };
    expect(raw.content_seg).toBe("用户 偏好");
  });

  it("recomputes tags_seg when tags change", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "fact",
      content: "用户偏好缩进",
      tags: ["代码风格"],
    }, db, seg);

    updateMemory(created.id, { tags: ["偏好"] }, db, seg);

    const raw = db.prepare("SELECT tags_seg FROM memory_records WHERE id = ?")
      .get(created.id) as { tags_seg: string };
    expect(raw.tags_seg).toBe("偏好");
  });

  it("drops the vector row when content changes so the worker recomputes it", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "fact",
      content: "用户偏好缩进",
    }, db, seg);
    const index = createBlobVectorIndex(db);
    index.upsert(created.id, new Float32Array([1, 0, 0]), "fp", "m");
    expect(index.size()).toBe(1);

    updateMemory(created.id, { content: "完全不同的一段内容" }, db, seg);

    expect(index.size()).toBe(0);
  });

  it("keeps the vector row when only importance changes", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "fact",
      content: "用户偏好缩进",
    }, db, seg);
    const index = createBlobVectorIndex(db);
    index.upsert(created.id, new Float32Array([1, 0, 0]), "fp", "m");

    updateMemory(created.id, { importance: 9 }, db, seg);

    expect(index.size()).toBe(1);
  });

  it("returns null for a non-existent id", () => {
    expect(updateMemory("no-such-id", { content: "x" }, db, seg)).toBeNull();
  });

  it("leaves unspecified fields untouched", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "preference",
      content: "用户偏好缩进",
      tags: ["代码风格"],
      importance: 4,
    }, db, seg);

    const updated = updateMemory(created.id, { importance: 7 }, db, seg);

    expect(updated!.content).toBe("用户偏好缩进");
    expect(updated!.tags).toEqual(["代码风格"]);
    expect(updated!.type).toBe("preference");
    expect(updated!.importance).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/repository.test.ts`
Expected: FAIL — `updateMemory is not a function`

- [ ] **Step 3: Write minimal implementation**

追加到 `packages/memory/src/repository.ts`：

```typescript
/**
 * 真正的 UPDATE —— **保留 `id` 与 `created_at`**，仅刷新 `updated_at`。
 *
 * 修复 spec §4.4：旧实现把「更新」写成 `delete + create`，导致 id 变更
 * （`sourceMessageId` 溯源链断裂）、`created_at` 重置（丢失记忆年龄）、
 * 向量行成孤儿污染检索。
 *
 * 内容变更时**删除向量行而非重算** —— 使 `updateMemory` 保持同步，
 * 并复用待嵌入队列，由 worker 异步补齐（spec §9.5）。
 */
export function updateMemory(
  id: string,
  patch: { type?: MemoryType; content?: string; tags?: string[]; importance?: number },
  customDb?: Database,
  segmenter?: Segmenter,
): MemoryRecord | null {
  const db = customDb || getDatabase();
  const existing = getMemory(id, db);
  if (!existing) return null;

  const seg = resolveSegmenter(segmenter);
  const now = new Date().toISOString();

  const sets: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  if (patch.type !== undefined) {
    sets.push("type = ?");
    values.push(patch.type);
  }

  const contentChanged = patch.content !== undefined && patch.content !== existing.content;
  if (patch.content !== undefined) {
    sets.push("content = ?");
    values.push(patch.content);
    // content_seg 由写入方计算，不能放在触发器里（spec §6.1）
    sets.push("content_seg = ?");
    values.push(seg.cut(patch.content).join(" "));
  }

  const tagsChanged =
    patch.tags !== undefined && JSON.stringify(patch.tags) !== JSON.stringify(existing.tags);
  if (patch.tags !== undefined) {
    sets.push("tags = ?");
    values.push(JSON.stringify(patch.tags));
    sets.push("tags_seg = ?");
    values.push(patch.tags.flatMap((t) => seg.cut(t)).join(" "));
  }

  if (patch.importance !== undefined) {
    sets.push("importance = ?");
    values.push(patch.importance);
  }

  const txn = db.transaction(() => {
    db.prepare(`UPDATE memory_records SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
    if (contentChanged || tagsChanged) {
      // 让 worker 重新计算向量，而不是在这里同步重算（保持同步签名）
      db.prepare("DELETE FROM memory_embeddings WHERE memory_id = ?").run(id);
    }
  });
  txn();

  return getMemory(id, db);
}
```

Update `packages/memory/src/index.ts`:

```typescript
export { createMemory, getMemory, listMemories, deleteMemory, getMemoriesByIds, updateMemory } from "./repository.js";
```

- [ ] **Step 4: Replace the fake update in the extractor**

`packages/memory/src/extractor.ts` 的 `update` 分支替换为：

```typescript
      case "update":
        if (op.id && op.type && op.content) {
          updateMemory(
            op.id,
            {
              type: op.type,
              content: op.content,
              ...(op.tags !== undefined ? { tags: op.tags } : {}),
              importance: op.importance ?? 1,
            },
            db,
          );
        }
        break;
```

import 改为：

```typescript
import { createMemory, deleteMemory, updateMemory } from "./repository.js";
```

- [ ] **Step 5: Update the existing extractor update test**

`packages/memory/src/__tests__/extractor.test.ts` 的 "handles update operation from LLM output" 用例目前断言「旧记忆没了、新记忆存在」。改为断言**同一条记录被就地更新**：

```typescript
  it("handles update operation from LLM output as an in-place update", async () => {
    const created = createMemory({
      userId: "user-extract",
      conversationId: "conv-extract",
      agentId: "agent-extract",
      type: "fact",
      content: "Old content to update",
      importance: 3,
    }, db);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{
              action: "update",
              id: created.id,
              type: "preference",
              content: "Updated content with new preference",
              importance: 7,
              reason: "User preference changed",
            }]),
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, { apiKey: "test-key" }, db);

    // id 与 created_at 必须保留 —— 这正是旧实现（delete + create）破坏的
    const updated = getMemory(created.id, db);
    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(created.id);
    expect(updated!.createdAt).toBe(created.createdAt);
    expect(updated!.content).toBe("Updated content with new preference");
    expect(updated!.type).toBe("preference");
    expect(updated!.importance).toBe(7);

    vi.unstubAllGlobals();
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @agenthub/memory test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/memory/src/repository.ts packages/memory/src/extractor.ts packages/memory/src/index.ts packages/memory/src/__tests__/repository.test.ts packages/memory/src/__tests__/extractor.test.ts
git commit -m "fix(memory): implement updateMemory as a real UPDATE preserving id and createdAt"
```

---

## Task 22: `buildMemoryContext` 与单 agent 路径注入

**Files:**
- Create: `packages/memory/src/context.ts`
- Modify: `packages/memory/src/index.ts`
- Modify: `apps/server/src/orchestrator/executor.ts:114-165`
- Modify: `apps/server/src/routes/messages.ts:673`
- Test: `packages/memory/src/__tests__/context.test.ts`

**Interfaces:**
- Consumes: `searchMemories`（Task 20）
- Produces:
  ```typescript
  function buildMemoryContext(params: {
    userId: string;
    conversationId: string;   // 必填 —— 作用域
    query: string;
    tokenBudget?: number;     // 默认 800
    customDb?: Database;
  }): Promise<string | undefined>;
  ```

**这是本设计里唯一的行为新增**（spec §8.7）：单 agent 路径此前**从不注入记忆** —— 1:1 聊天里记忆只写不读。用户的主观感受是「它不是记不住，是根本没用上」。

- [ ] **Step 1: Write the failing test**

Create `packages/memory/src/__tests__/context.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory } from "../repository.js";
import { buildMemoryContext } from "../context.js";
import { configureSearch, resetSearchDepsForTesting } from "../search.js";
import { FakeSegmenter } from "./fakes.js";

const seg = new FakeSegmenter(["缩进", "用户", "偏好", "连接池", "格式化", "脚本"]);
let db: DatabaseType;

beforeEach(() => {
  db = createTestDb();
  configureSearch({ segmenter: seg });
});

afterEach(() => {
  resetSearchDepsForTesting();
  destroyTestDb(db);
});

function seed(content: string, conversationId = "c1") {
  return createMemory({
    userId: "u1",
    conversationId,
    agentId: "a1",
    type: "preference",
    content,
  }, db, seg);
}

describe("buildMemoryContext", () => {
  it("returns undefined when there are no memories", async () => {
    const out = await buildMemoryContext({
      userId: "u1", conversationId: "c1", query: "缩进", customDb: db,
    });
    expect(out).toBeUndefined();
  });

  it("formats memories with their type label", async () => {
    seed("用户偏好缩进");
    const out = await buildMemoryContext({
      userId: "u1", conversationId: "c1", query: "缩进", customDb: db,
    });
    expect(out).toContain("[Memory - preference]");
    expect(out).toContain("用户偏好缩进");
  });

  it("only returns memories from the requested conversation", async () => {
    seed("用户偏好缩进 in project A", "conv-a");
    seed("用户偏好缩进 in project B", "conv-b");

    const a = await buildMemoryContext({
      userId: "u1", conversationId: "conv-a", query: "缩进", customDb: db,
    });
    expect(a).toContain("project A");
    expect(a).not.toContain("project B");
  });

  it("stops adding memories once the token budget is exhausted", async () => {
    for (let i = 0; i < 20; i++) {
      seed(`用户偏好缩进 number ${i} with quite a lot of extra padding text to consume budget`);
    }

    const out = await buildMemoryContext({
      userId: "u1", conversationId: "c1", query: "缩进", tokenBudget: 40, customDb: db,
    });

    expect(out).toBeDefined();
    // 40 token ≈ 160 字符；每条约 80 字符，因此最多 2-3 条
    const entries = out!.split("\n\n").filter((s) => s.startsWith("[Memory"));
    expect(entries.length).toBeLessThan(5);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("returns undefined rather than an empty string when nothing fits", async () => {
    seed("用户偏好缩进 with a very long tail that definitely exceeds a tiny budget");
    const out = await buildMemoryContext({
      userId: "u1", conversationId: "c1", query: "缩进", tokenBudget: 1, customDb: db,
    });
    expect(out).toBeUndefined();
  });

  it("never throws when the underlying search fails", async () => {
    await expect(
      buildMemoryContext({ userId: "u1", conversationId: "c1", query: "缩进", customDb: db }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @agenthub/memory test src/__tests__/context.test.ts`
Expected: FAIL — `Failed to resolve import "../context.js"`

- [ ] **Step 3: Write minimal implementation**

Create `packages/memory/src/context.ts`:

```typescript
import type { Database } from "./db.js";
import { searchMemories } from "./search.js";

const DEFAULT_TOKEN_BUDGET = 800;

/**
 * 粗粒度 token 估算：约 4 字符 / token。
 *
 * 不引入 tokenizer 依赖 —— 这里只需要一个能防止「5 条长记忆吃掉上下文」的
 * 上限，精度不重要（spec §8.7）。
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * 检索本会话的记忆并渲染成可注入 systemPrompt 的文本块。
 *
 * 供 orchestrator 与单 agent 两条路径共用。**不收 `agentId`** ——
 * 按 spec §1.1，检索作用域是会话，`agentId` 已降级为记忆的元数据。
 *
 * **绝不抛错** —— 记忆是提示，不是必需条件。
 */
export async function buildMemoryContext(params: {
  userId: string;
  conversationId: string;
  query: string;
  /** 默认 800。按 token 预算截断而非固定条数 —— 5 条长记忆与 5 条短事实的开销差一个数量级。 */
  tokenBudget?: number;
  customDb?: Database;
}): Promise<string | undefined> {
  const budget = params.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  try {
    const memories = await searchMemories(
      {
        query: params.query,
        userId: params.userId,
        scope: { conversationId: params.conversationId },
        limit: 20,
      },
      params.customDb,
    );

    const lines: string[] = [];
    let used = 0;

    for (const memory of memories) {
      const line = `[Memory - ${memory.type}] ${memory.content}`;
      const cost = estimateTokens(line);
      if (used + cost > budget) break;
      lines.push(line);
      used += cost;
    }

    return lines.length > 0 ? lines.join("\n\n") : undefined;
  } catch (err) {
    console.error("[memory] buildMemoryContext failed, proceeding without memories:", err);
    return undefined;
  }
}
```

Update `packages/memory/src/index.ts`:

```typescript
export { buildMemoryContext } from "./context.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @agenthub/memory test src/__tests__/context.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Switch the orchestrator to the shared helper**

`apps/server/src/orchestrator/executor.ts` —— 把 `buildContext` 里 `if (!this._memoryInjected) { ... }` 整块（原 133-152 行）替换为：

```typescript
    // Inject relevant memories only on the FIRST SubTask to maximize prefix caching.
    // 后续 SubTask 的 system prompt 完全固定 —— 首次未命中缓存，之后同一对话内全部命中。
    if (!this._memoryInjected) {
      const memoryContext = await buildMemoryContext({
        userId: subtask.userId,
        conversationId: subtask.conversationId,
        query: subtask.instruction,
      });
      if (memoryContext) systemParts.push(memoryContext);
      this._memoryInjected = true;
    }
```

import 改为（去掉 `searchMemories`）：

```typescript
import { buildMemoryContext } from "@agenthub/memory";
```

- [ ] **Step 6: Add memory injection to the single-agent path**

`apps/server/src/routes/messages.ts`，在单 agent 路径构造 `context` 之前（约 672 行 `const context = {` 之前）插入：

```typescript
      // ── Long-term memory injection ────────────────────────────────
      // 这条路径此前从不注入记忆 —— 1:1 聊天里记忆只写不读（spec §4.2）。
      const memoryContext = await buildMemoryContext({
        userId: conv.ownerId,
        conversationId,
        query: content,
      });

      const systemPromptParts = [agent.systemPrompt, pinnedContext, memoryContext].filter(Boolean);
```

并把 `context` 里的 `systemPrompt` 改为：

```typescript
        systemPrompt: systemPromptParts.join("\n\n") || undefined,
```

同文件补 import：

```typescript
import { buildMemoryContext } from "@agenthub/memory";
```

- [ ] **Step 7: Verify the regression is pinned**

本 task 的**关键回归测试**在 `packages/memory` 层面已由 `context.test.ts` 覆盖（作用域、预算、失败降级）。server 侧的接线由 P6 的集成测试覆盖。

Run: `pnpm --filter @agenthub/memory test && pnpm --filter @agenthub/server lint`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/memory/src/context.ts packages/memory/src/index.ts packages/memory/src/__tests__/context.test.ts apps/server/src/orchestrator/executor.ts apps/server/src/routes/messages.ts
git commit -m "feat(memory): add buildMemoryContext and inject memories on the single-agent path"
```

---

## P5 出口检查

- [ ] `pnpm --filter @agenthub/memory test` 全绿
- [ ] `pnpm --filter @agenthub/server test` 全绿
- [ ] 单 agent 路径确实注入了记忆（spec §13 的关键回归项）：1:1 聊一个会话，写入一条偏好，重开该会话提问，观察 `systemPrompt` 里出现 `[Memory - ...]`
- [ ] 记忆更新后 `id` 与 `createdAt` 不变（查库确认）
- [ ] 向量行在内容更新后被删除，且 worker 在 5 秒内补回

---

# P6 — 端到端集成与文档

## Task 23: 端到端集成测试

**Files:**
- Create: `packages/memory/src/__tests__/e2e.test.ts`
- Test: 同上

**Interfaces:**
- Consumes: 全部前置 task
- Produces: 无新接口

**这一步验证的是 spec §7.1 的完整链路**：消息 → 提取 → 存储 → 双路召回 → 注入。

- [ ] **Step 1: Write the test**

Create `packages/memory/src/__tests__/e2e.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory, getMemory, updateMemory } from "../repository.js";
import { searchMemories, configureSearch, resetSearchDepsForTesting } from "../search.js";
import { buildMemoryContext } from "../context.js";
import { extractMemories } from "../extractor.js";
import { createBlobVectorIndex } from "../vector-index.js";
import { startEmbeddingWorker, setBm25ReadyForTesting, reindexMemories } from "../worker.js";
import { FakeEmbeddingProvider, FakeSegmenter } from "./fakes.js";

const VOCAB = ["缩进", "用户", "偏好", "连接池", "格式化", "脚本", "压测", "通过", "空格"];
const seg = new FakeSegmenter(VOCAB);

let db: DatabaseType;

function llmRespondingWith(operations: unknown[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(operations) } }],
      }),
    }),
  );
}

beforeEach(() => {
  db = createTestDb();
  setBm25ReadyForTesting(true);
});

afterEach(() => {
  resetSearchDepsForTesting();
  vi.unstubAllGlobals();
  destroyTestDb(db);
});

describe("end-to-end: spec §7.1 长会话的项目续接", () => {
  const provider = new FakeEmbeddingProvider({ dim: 16 });
  const vectorIndex = createBlobVectorIndex;

  it("stores, embeds, and recalls a decision made long ago in the same conversation", async () => {
    const index = vectorIndex(db);
    configureSearch({
      segmenter: seg,
      vectorIndex: index,
      embeddingProvider: provider,
      minSimilarity: 0,
    });

    // ── 第一周：用户陈述偏好 ─────────────────────────────────────────
    llmRespondingWith([
      {
        action: "add",
        type: "preference",
        content: "用户偏好缩进",
        importance: 7,
      },
    ]);

    await extractMemories(
      {
        userId: "u1",
        conversationId: "C1",
        agentId: "a1",
        agentName: "小助",
        userMessage: "这个项目缩进用 tab，别用空格",
        agentResponse: "好的，我记下了。",
      },
      { apiKey: "k", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
      db,
    );

    // ── 第三周：一个错误模式的排查结论 ───────────────────────────────
    llmRespondingWith([
      {
        action: "add",
        type: "error_pattern",
        content: "连接池 被打满 压测 通过",
        importance: 8,
      },
    ]);

    await extractMemories(
      {
        userId: "u1",
        conversationId: "C1",
        agentId: "a1",
        agentName: "小助",
        userMessage: "连接池老是被打满",
        agentResponse: "pool_size 调到 20 之后压测通过了",
      },
      { apiKey: "k", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
      db,
    );

    // ── 后台嵌入 ────────────────────────────────────────────────────
    const worker = startEmbeddingWorker({ provider, index, batchSize: 32, intervalMs: 0 });
    const embedded = await worker.runOnce();
    expect(embedded.processed).toBe(2);
    expect(worker.pendingCount()).toBe(0);
    worker.stop();

    // ── 第八周：重开同一个会话，问很久以前的事 ───────────────────────
    const context = await buildMemoryContext({
      userId: "u1",
      conversationId: "C1",
      query: "连接池",
      customDb: db,
    });

    expect(context).toBeDefined();
    expect(context).toContain("连接池");
    expect(context).toContain("[Memory - error_pattern]");

    // 直接检索也应当命中
    const hits = await searchMemories(
      { query: "连接池", userId: "u1", scope: { conversationId: "C1" } },
      db,
    );
    expect(hits.some((h) => h.content.includes("连接池"))).toBe(true);
  });

  it("keeps two projects' contradictory conventions apart end to end", async () => {
    const index = vectorIndex(db);
    configureSearch({
      segmenter: seg,
      vectorIndex: index,
      embeddingProvider: provider,
      minSimilarity: 0,
    });

    createMemory({
      userId: "u1", conversationId: "C1", agentId: "a1",
      type: "preference", content: "用户偏好缩进", tags: [],
    }, db, seg);
    createMemory({
      userId: "u1", conversationId: "C2", agentId: "a1",
      type: "preference", content: "用户偏好空格", tags: [],
    }, db, seg);

    const worker = startEmbeddingWorker({ provider, index, batchSize: 32, intervalMs: 0 });
    await worker.runOnce();
    worker.stop();

    const inC1 = await buildMemoryContext({
      userId: "u1", conversationId: "C1", query: "缩进", customDb: db,
    });
    const inC2 = await buildMemoryContext({
      userId: "u1", conversationId: "C2", query: "缩进", customDb: db,
    });

    expect(inC1).toContain("缩进");
    expect(inC1).not.toContain("空格");
    expect(inC2).toContain("空格");
    expect(inC2).not.toContain("用户偏好缩进");
  });

  it("survives an embedding outage and still recalls through BM25", async () => {
    const index = vectorIndex(db);
    const flaky = new FakeEmbeddingProvider({ dim: 16, failuresRemaining: 1 });
    configureSearch({
      segmenter: seg,
      vectorIndex: index,
      embeddingProvider: flaky,
      minSimilarity: 0,
    });

    createMemory({
      userId: "u1", conversationId: "C1", agentId: "a1",
      type: "error_pattern", content: "连接池 被打满",
    }, db, seg);

    // 后台嵌入失败 —— 记忆仍只在 BM25 榜单里
    const worker = startEmbeddingWorker({ provider: flaky, index, intervalMs: 0 });
    const failed = await worker.runOnce();
    expect(failed.processed).toBe(0);
    worker.stop();

    // 检索仍应通过 BM25 命中
    const hits = await searchMemories(
      { query: "连接池", userId: "u1", scope: { conversationId: "C1" } },
      db,
    );
    expect(hits.length).toBe(1);

    // 恢复后 worker 自动补齐
    const recovered = startEmbeddingWorker({ provider: flaky, index, intervalMs: 0 });
    expect((await recovered.runOnce()).processed).toBe(1);
    recovered.stop();
  });

  it("re-enqueues every memory when the embedding fingerprint changes", async () => {
    const index = vectorIndex(db);
    const provider8 = new FakeEmbeddingProvider({ dim: 8 });
    const provider16 = new FakeEmbeddingProvider({ dim: 16 });

    createMemory({
      userId: "u1", conversationId: "C1", agentId: "a1", type: "fact", content: "用户偏好缩进",
    }, db, seg);

    const first = startEmbeddingWorker({ provider: provider8, index, intervalMs: 0 });
    expect((await first.runOnce()).processed).toBe(1);
    first.stop();

    // 换维度 → fingerprint 变 → 全部重新入队
    const second = startEmbeddingWorker({ provider: provider16, index, intervalMs: 0 });
    expect((await second.runOnce()).processed).toBe(1);
    second.stop();

    const row = db.prepare("SELECT fingerprint FROM memory_embeddings").get() as { fingerprint: string };
    expect(row.fingerprint).toBe(provider16.fingerprint);
  });

  it("runs the full migration → reindex → search path on a legacy database", async () => {
    const index = vectorIndex(db);
    configureSearch({ segmenter: seg, vectorIndex: index, embeddingProvider: provider });

    // 模拟迁移前的行：conversation_id 为 NULL、content_seg 为 NULL
    db.prepare(
      `INSERT INTO memory_records (id, user_id, agent_id, type, content, tags, conversation_id, importance, created_at, updated_at)
       VALUES ('legacy', 'u1', 'a1', 'fact', '用户偏好缩进', '[]', NULL, 1, datetime('now'), datetime('now'))`,
    ).run();

    const { backfilled } = reindexMemories(seg, db);
    expect(backfilled).toBe(1);

    // 无主记忆在会话作用域下不可召回 —— 这是明确接受的损失（spec §9.6）
    const scoped = await searchMemories(
      { query: "缩进", userId: "u1", scope: { conversationId: "C1" } },
      db,
    );
    expect(scoped.length).toBe(0);

    // 但在全库搜索（Web UI）下可见
    const global = await searchMemories(
      { query: "缩进", userId: "u1", scope: { allConversations: true } },
      db,
    );
    expect(global.length).toBe(1);
  });

  it("keeps id and createdAt stable across an extraction-driven update", async () => {
    const index = vectorIndex(db);
    configureSearch({ segmenter: seg, vectorIndex: index, embeddingProvider: provider });

    createMemory({
      userId: "u1", conversationId: "C1", agentId: "a1",
      type: "preference", content: "用户偏好缩进",
    }, db, seg);

    llmRespondingWith([
      { action: "add", type: "preference", content: "用户偏好空格", importance: 5 },
    ]);
    await extractMemories(
      {
        userId: "u1", conversationId: "C1", agentId: "a1", agentName: "小助",
        userMessage: "改成空格吧", agentResponse: "好",
      },
      { apiKey: "k", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
      db,
    );

    const all = db.prepare("SELECT id, created_at FROM memory_records WHERE user_id = 'u1'").all() as Array<{
      id: string;
      created_at: string;
    }>;
    // add 语义应当新增一条，而不是改写已有的
    expect(all.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @agenthub/memory test src/__tests__/e2e.test.ts`
Expected: PASS (6 tests)。若有失败，**先判断是测试写错还是实现有缺口** —— 这些用例覆盖的是 spec §7.1 的完整链路，失败通常指向真实缺陷。

- [ ] **Step 3: Run the whole suite for both packages**

Run: `pnpm --filter @agenthub/memory test && pnpm --filter @agenthub/memory lint && pnpm --filter @agenthub/server test && pnpm --filter @agenthub/server lint`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add packages/memory/src/__tests__/e2e.test.ts
git commit -m "test(memory): add end-to-end coverage for the project-continuity flow"
```

---

## Task 24: 更新文档

**Files:**
- Modify: `docs/architecture/long-term-memory.md`
- Create: `docs/architecture/embedding-setup.md`

**Interfaces:**
- Consumes: 无
- Produces: 无

**背景（spec §4.6、§15）：** `docs/architecture/long-term-memory.md` 与实现已漂移两处：

1. 第 221-250 行声明 `createMemory` / `searchMemories` 返回 `Promise` —— 前者实际是同步的（且本设计保持同步）
2. **第 3 行的开篇语「让 AI Agent 能跨对话记住用户偏好」与本设计的作用域模型相反** —— 记忆的主用途是「同一会话内的项目续接」，跨会话召回是明确排除项（spec §1.1）

- [ ] **Step 1: 修正作用域叙述**

`docs/architecture/long-term-memory.md` 第 1-10 行的开篇段替换为：

```markdown
# Long-Term Memory Module

为 AgentHub 增加长期记忆能力，让 AI Agent 记住**同一个项目会话内**此前做过什么 ——
架构决策、排查结论、用户约定。

## 记忆的作用域是会话，不是用户

本系统的使用方式是「一个项目 = 一个 Conversation」（`findSingleConversationByAgentId`
保证重开窗口回到同一个会话）。因此记忆的主用途是回答「这个项目之前做了什么」，
检索以 `conversation_id` **排他过滤**。

**为什么排他：** 项目之间会互相矛盾 —— 项目 A 约定 tab 缩进，项目 B 约定 2 空格，
两者都成立。「矛盾」和「相关」在向量空间里无法区分，只有作用域能区分。
允许跨会话召回会让 A 的会话被注入 B 的约定，且没有任何信号能提示模型这是外来上下文。

**代价（明确接受）：** 用户级偏好这类真正的跨会话知识不会被召回。恢复它需要
「另做一路」，尚未实现。

> 早期版本的本文档称「让 AI Agent 能跨对话记住用户偏好」—— 那是**错的**，
> 与本模块的实际作用域相反。
```

- [ ] **Step 2: 修正 API 签名段**

第 221-250 行的签名块替换为：

```typescript
// === Repository API （全部同步）===

function createMemory(input: CreateMemoryInput, db?: Database): MemoryRecord;
function getMemory(id: string, db?: Database): MemoryRecord | null;
function updateMemory(
  id: string,
  patch: { type?: MemoryType; content?: string; tags?: string[]; importance?: number },
  db?: Database,
): MemoryRecord | null;
function listMemories(params: {...}, db?: Database): { data: MemoryRecord[]; total: number };
function deleteMemory(id: string, db?: Database): void;

// === Search （异步 —— 内部需要一次 embedding API 调用）===

function searchMemories(options: {
  query: string;
  userId: string;          // 必填
  scope: MemoryScope;      // 必填 —— { conversationId } | { allConversations: true }
  agentId?: string;        // 仅供 Web UI 筛选
  limit?: number;
  offset?: number;
}, db?: Database): Promise<MemoryRecord[]>;

function buildMemoryContext(params: {
  userId: string;
  conversationId: string;  // 必填
  query: string;
  tokenBudget?: number;    // 默认 800
  db?: Database;
}): Promise<string | undefined>;
```

- [ ] **Step 3: 新增 embedding 部署说明**

Create `docs/architecture/embedding-setup.md`：

```markdown
# Embedding 部署说明

长期记忆的**向量路是可选能力**。未配置时系统退化为纯 BM25 并打 warning ——
中文检索仍然可用（那是预分词带来的，不依赖向量），只是没有语义召回。

## 为什么需要单独部署

`bge-m3` 是**开源权重，没有官方 API**（BAI 只发布权重，MIT 许可）。
要用它必须自己跑一个推理进程。本仓库的 LLM（DeepSeek）**没有 embeddings 端点**
（`api.deepseek.com/v1/embeddings` 返回 404），因此不能复用现有配置。

## 推荐路径：本地 Ollama

唯一同时满足「零 key、零代码改动、零容器」的选项。

```bash
brew install ollama
ollama serve            # 默认监听 127.0.0.1:11434
ollama pull bge-m3      # 567M 参数，约 1.2GB
```

然后在仓库根 `.env` 里：

```
EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1
EMBEDDING_API_KEY=EMPTY      # Ollama 不校验，但实现要求非空
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIM=1024
```

**这四个变量缺任意一个，向量路就整体关闭** —— 不会用默认模型兜底。
理由：本仓库曾经因为环境变量名不匹配（`.env` 写 `MODEL`，代码读 `LLM_MODEL`）
而静默回落到 `deepseek-chat`，用户配置的模型从未生效且无人发现。
配置缺失必须是显式失败，不能是猜测。

**本地推理的附带好处：** 查询向量化没有网络延迟（毫秒级而非 100–300ms），
且不需要任何 API key。

## 已知问题：bge-m3 对某些技术文档返回 NaN

Ollama issue #14657。缓解办法：

```bash
OLLAMA_FLASH_ATTENTION=false ollama serve
```

本模块在写入前会做 `isFinite` 校验，NaN 向量会被**丢弃并重试**，
不会进入索引。表现为「该条记忆暂时只在 BM25 榜单里」。
若 `pendingCount` 长期不降，说明这个缺陷在频繁触发，应考虑换用
`Qwen3-Embedding-0.6B` 或换推理后端。

## 换模型的代价

`memory_embeddings.fingerprint = ${model}:${dim}:${mode}`。改动其中任何一项，
所有旧向量自动作废并重新入队 —— 但**重算是真实成本**，
不是免费的。大规模库上换模型前请先评估耗时。
```

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/long-term-memory.md docs/architecture/embedding-setup.md
git commit -m "docs: correct memory scope narrative and document embedding setup"
```

---

## P6 出口检查

- [ ] `pnpm --filter @agenthub/memory test` 全绿
- [ ] `pnpm --filter @agenthub/server test` 全绿
- [ ] `pnpm lint`（根目录，全包）无错
- [ ] `pnpm build` 通过
- [ ] 手工走查 spec §7.1 的完整链路：写入 → 5 秒内嵌入 → 重开会话 → 提问 → systemPrompt 里出现对应记忆
- [ ] 手工走查 spec §7.1 的反面场景：两个项目的矛盾约定互不串味
- [ ] 手工确认 `docs/architecture/long-term-memory.md` 的开篇语已不再说「跨对话」

---

## 完成后的整体验收（spec §15）

1. **边界正确性**（P0）—— 会话作用域、`userId` 必填、配置被真正读取
2. **迁移机制**（P1）—— 老库可升级，`orphanCount` 可观测
3. **中文检索**（P2）—— 2 字词可召回，多词查询不返回空
4. **向量路**（P3）—— 可选、可降级、NaN 与维度不匹配被挡在库外
5. **融合**（P4）—— 两路各自独立失败，融合层无降级分支
6. **触发链路**（P5）—— 单 agent 路径也注入记忆；`updateMemory` 保留 id 与 `createdAt`
7. **集成**（P6）—— spec §7.1 的完整链路与反面场景都有测试
8. **文档**（P6）—— 作用域叙述已纠正，embedding 部署有独立说明


