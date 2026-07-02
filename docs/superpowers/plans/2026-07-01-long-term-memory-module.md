# Long-Term Memory Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent long-term memory to AgentHub — AI Agents remember user preferences, project decisions, technical context, and error patterns across conversations.

**Architecture:** A new `@agenthub/memory` package storing memory records in a local SQLite database (separate from PostgreSQL) with FTS5 full-text search. An LLM-based extractor asynchronously processes completed conversations to extract structured memories. The executor injects relevant memories into the first SubTask's system prompt to maximize prefix caching. Server routes expose CRUD + search for the Web UI.

**Tech Stack:** SQLite via better-sqlite3 (sync API, zero-ops), FTS5 for search (unicode61 tokenizer), LLM extraction via `fetch()` to OpenAI-compatible API.

## Global Constraints

- All memory storage MUST use SQLite (not PostgreSQL) for fault isolation.
- Package MUST use sync better-sqlite3 API (not async sqlite3).
- Memory extraction MUST be non-blocking (fire-and-forget, never block the response).
- Executor memory injection MUST only happen on the first SubTask (maximize prefix caching).
- The `@agenthub/memory` package MUST NOT depend on `@agenthub/db` or `@agenthub/agent-core`.
- All repository functions accept an optional `Database` parameter defaulting to the global singleton (same DI pattern as `@agenthub/db`).
- Every repository function is synchronous (better-sqlite3 sync API).
- Memory type `MemoryType` is a string union type, NOT an enum (per spec, for extensibility).

---

### Task 1: Add MemoryType and MemoryRecord to @agenthub/shared

**Files:**
- Create: `packages/shared/src/enums/memory.ts`
- Create: `packages/shared/src/types/memory.ts`
- Modify: `packages/shared/src/enums/index.ts` (add re-export)
- Modify: `packages/shared/src/types/index.ts` (add re-export)

**Interfaces:**
- Produces: `MemoryType` — string union type exported from `@agenthub/shared`
- Produces: `MemoryRecord` — interface exported from `@agenthub/shared` referencing `MemoryType`
- Consumes: Nothing from the workspace (pure type definitions)

- [ ] **Step 1: Create `packages/shared/src/enums/memory.ts`**

```typescript
export type MemoryType =
  | "fact"
  | "preference"
  | "decision"
  | "error_pattern"
  | "context";
```

- [ ] **Step 2: Create `packages/shared/src/types/memory.ts`**

```typescript
import type { MemoryType } from "../enums/memory.js";

export interface MemoryRecord {
  id: string;
  userId: string;
  agentId: string;
  type: MemoryType;
  content: string;
  tags: string[];
  sourceMessageId?: string;
  conversationId?: string;
  importance: number;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 3: Add export to `packages/shared/src/enums/index.ts`**

Add after the last existing export line:
```typescript
export { MemoryType } from "./memory.js";
```

(Note: `MemoryType` is a type, but it re-exports as a value export so the barrel `export *` in `src/index.ts` picks it up. The downstream consumer uses `import type { MemoryType } from "@agenthub/shared"`.)

- [ ] **Step 4: Add export to `packages/shared/src/types/index.ts`**

Add after the last existing export line:
```typescript
export type { MemoryRecord } from "./memory.js";
```

- [ ] **Step 5: Verify the build still works**

```bash
pnpm --filter @agenthub/shared build
```

Expected output: Build succeeds, `dist/types/memory.d.ts` is created containing `MemoryType` and `MemoryRecord` declarations.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/enums/memory.ts packages/shared/src/types/memory.ts packages/shared/src/enums/index.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): add MemoryType and MemoryRecord types"
```

---

### Task 2: Scaffold packages/memory

**Files:**
- Create: `packages/memory/package.json`
- Create: `packages/memory/tsconfig.json`
- Create: `packages/memory/tsup.config.ts`
- Create: `packages/memory/vitest.config.ts`
- Create: `packages/memory/src/index.ts` (placeholder barrel export)

**Interfaces:**
- Consumes: `@agenthub/shared` types (MemoryType, MemoryRecord) from Task 1
- Produces: A buildable `@agenthub/memory` package with empty exports

- [ ] **Step 1: Create `packages/memory/package.json`**

```json
{
  "name": "@agenthub/memory",
  "version": "0.1.0",
  "private": true,
  "description": "Long-term memory module for AI Agents with SQLite + FTS5 storage",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "@agenthub/shared": "workspace:*",
    "better-sqlite3": "^11.7.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^25.9.1",
    "tsup": "^8.0.0",
    "typescript": "^6.0.3",
    "vitest": "^3.0.0"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Create `packages/memory/tsconfig.json`**

```json
{
  "extends": "../../tooling/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/memory/tsup.config.ts`**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

- [ ] **Step 4: Create `packages/memory/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Create `packages/memory/src/index.ts`**

```typescript
export {};
```

- [ ] **Step 6: Verify the package builds**

```bash
pnpm install
pnpm --filter @agenthub/memory build
```

Expected output: Build succeeds, `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` are created.

- [ ] **Step 7: Commit**

```bash
git add packages/memory/
git commit -m "feat(memory): scaffold packages/memory"
```

---

### Task 3: Implement SQLite connection manager and schema DDL

**Files:**
- Create: `packages/memory/src/db.ts`
- Create: `packages/memory/src/schema.ts`
- Create: `packages/memory/src/__tests__/setup.ts`
- Create: `packages/memory/src/__tests__/db.test.ts`

**Interfaces:**
- Consumes: `Database` type from `better-sqlite3`
- Produces: `getDatabase(customPath?: string): Database` — singleton connection (lazy init, WAL mode)
- Produces: `setDbPath(path: string): void` — override the default DB path
- Produces: `closeDatabase(): void` — close and reset the singleton
- Produces: `initSchema(customDb?: Database): void` — execute DDL to create tables, indexes, FTS5, triggers
- Produces: `Database` type alias re-exported from `db.ts` for use in repository/search.ts

- [ ] **Step 1: Create `packages/memory/src/db.ts`**

```typescript
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const DEFAULT_DIR = path.join(os.homedir(), ".agenthub");
const DEFAULT_PATH = path.join(DEFAULT_DIR, "memory.db");

let db: DatabaseType | null = null;
let configuredPath: string | undefined;

export function getDatabase(customPath?: string): DatabaseType {
  if (db) return db;

  const resolvedPath = customPath || configuredPath || DEFAULT_PATH;

  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return db;
}

export function setDbPath(customPath: string): void {
  configuredPath = customPath;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export type { DatabaseType as Database };
```

- [ ] **Step 2: Create `packages/memory/src/schema.ts`**

```typescript
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";

const DDL = `
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
`;

export function initSchema(customDb?: Database): void {
  const targetDb = customDb || getDatabase();
  targetDb.exec(DDL);
}
```

- [ ] **Step 3: Create `packages/memory/src/__tests__/setup.ts`**

This file provides a helper to create a temporary SQLite database for each test, isolating test data.

```typescript
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { initSchema } from "../schema.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

let _db: DatabaseType | undefined;

export function createTestDb(): DatabaseType {
  const testPath = path.join(os.tmpdir(), `agenthub-memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  _db = new Database(testPath);
  initSchema(_db);
  return _db;
}

export function destroyTestDb(testDb: DatabaseType): void {
  const dbPath = testDb.name;
  testDb.close();
  _db = undefined;
  try {
    if (dbPath) fs.unlinkSync(dbPath);
    // Also remove WAL and SHM files if they exist
    try { if (dbPath) fs.unlinkSync(dbPath + "-wal"); } catch { /* ignore */ }
    try { if (dbPath) fs.unlinkSync(dbPath + "-shm"); } catch { /* ignore */ }
  } catch { /* file may already be cleaned up */ }
}
```

- [ ] **Step 4: Write the failing test — create `packages/memory/src/__tests__/db.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "../schema.js";
import { createTestDb, destroyTestDb } from "./setup.js";
import type { Database as DatabaseType } from "better-sqlite3";

let testDb: DatabaseType;

beforeAll(() => {
  testDb = createTestDb();
});

afterAll(() => {
  destroyTestDb(testDb);
});

describe("schema", () => {
  it("creates memory_records table", () => {
    const row = testDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_records'"
    ).get() as { name: string } | undefined;
    expect(row?.name).toBe("memory_records");
  });

  it("creates memory_fts virtual table", () => {
    const row = testDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_fts'"
    ).get() as { name: string } | undefined;
    expect(row?.name).toBe("memory_fts");
  });

  it("creates all three FTS sync triggers", () => {
    const rows = testDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'mem_fts_%'"
    ).all() as { name: string }[];
    expect(rows.length).toBe(3);
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(["mem_fts_ad", "mem_fts_ai", "mem_fts_au"]);
  });

  it("creates user+agent composite index", () => {
    const row = testDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_memory_user_agent'"
    ).get() as { name: string } | undefined;
    expect(row?.name).toBe("idx_memory_user_agent");
  });
});

describe("FTS5 trigger behavior", () => {
  it("automatically syncs inserted record to FTS index", () => {
    const id = "test-fts-insert-1";
    testDb.prepare(`
      INSERT INTO memory_records (id, user_id, agent_id, type, content)
      VALUES (?, 'user1', 'agent1', 'fact', 'Test content for FTS')
    `).run(id);

    const result = testDb.prepare(
      "SELECT rowid FROM memory_fts WHERE content MATCH 'Test'"
    ).get();
    expect(result).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run test to verify it fails at first**

```bash
pnpm --filter @agenthub/memory test src/__tests__/db.test.ts
```

Expected: Since `schema.ts` and `db.ts` don't exist yet (or the barrel index.ts doesn't export them), the test will fail with import errors. That's expected — we're writing TDD.

- [ ] **Step 6: Update `packages/memory/src/index.ts` to export the new modules**

```typescript
export { getDatabase, closeDatabase, setDbPath } from "./db.js";
export type { Database } from "./db.js";
export { initSchema } from "./schema.js";
```

- [ ] **Step 7: Run test to verify it passes**

```bash
pnpm --filter @agenthub/memory test
```

Expected: All 5 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/memory/src/db.ts packages/memory/src/schema.ts packages/memory/src/__tests__/ packages/memory/src/index.ts
git commit -m "feat(memory): implement SQLite connection manager and schema DDL"
```

---

### Task 4: Internal types and CRUD repository

**Files:**
- Create: `packages/memory/src/types.ts`
- Create: `packages/memory/src/repository.ts`
- Create: `packages/memory/src/__tests__/repository.test.ts`

**Interfaces:**
- Consumes: `MemoryType`, `MemoryRecord` from `@agenthub/shared` (Task 1)
- Consumes: `getDatabase()`, `Database` type from `./db.js` (Task 3)
- Produces: `CreateMemoryInput` interface (internal to @agenthub/memory)
- Produces: `ExtractedMemory` interface (internal, used by extractor.ts in Task 6)
- Produces: `createMemory(input: CreateMemoryInput, db?: Database): MemoryRecord`
- Produces: `getMemory(id: string, db?: Database): MemoryRecord | null`
- Produces: `listMemories(params, db?): { data: MemoryRecord[]; total: number }`
- Produces: `deleteMemory(id: string, db?: Database): void`

- [ ] **Step 1: Create `packages/memory/src/types.ts`**

```typescript
import type { MemoryType } from "@agenthub/shared";

export interface CreateMemoryInput {
  userId: string;
  agentId: string;
  type: MemoryType;
  content: string;
  tags?: string[];
  sourceMessageId?: string;
  conversationId?: string;
  importance?: number;
}

export interface ExtractedMemory {
  action: "add" | "update" | "delete" | "noop";
  id?: string;
  type?: MemoryType;
  content?: string;
  tags?: string[];
  importance?: number;
  reason?: string;
}

export interface MemoryConfig {
  dbPath?: string;
  llm?: {
    apiKey?: string;
    endpoint?: string;
    model?: string;
  };
}
```

- [ ] **Step 2: Write the failing test — create `packages/memory/src/__tests__/repository.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory, getMemory, listMemories, deleteMemory } from "../repository.js";

let db: DatabaseType;

beforeAll(() => {
  db = createTestDb();
});

afterAll(() => {
  destroyTestDb(db);
});

const MOCK_INPUT = {
  userId: "user-1",
  agentId: "agent-1",
  type: "fact" as const,
  content: "The project uses TypeScript 6 with strict mode",
  tags: ["typescript", "config"],
  importance: 7,
};

describe("createMemory", () => {
  it("creates a memory record and returns it", () => {
    const result = createMemory(MOCK_INPUT, db);
    expect(result.id).toBeTruthy();
    expect(result.userId).toBe("user-1");
    expect(result.agentId).toBe("agent-1");
    expect(result.type).toBe("fact");
    expect(result.content).toBe(MOCK_INPUT.content);
    expect(result.tags).toEqual(["typescript", "config"]);
    expect(result.importance).toBe(7);
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
  });

  it("creates with optional sourceMessageId and conversationId", () => {
    const result = createMemory({
      ...MOCK_INPUT,
      content: "memory with source",
      sourceMessageId: "msg-123",
      conversationId: "conv-456",
    }, db);
    expect(result.sourceMessageId).toBe("msg-123");
    expect(result.conversationId).toBe("conv-456");
  });

  it("defaults importance to 1 when not provided", () => {
    const result = createMemory({
      userId: "user-1",
      agentId: "agent-1",
      type: "context",
      content: "default importance",
    }, db);
    expect(result.importance).toBe(1);
  });
});

describe("getMemory", () => {
  it("returns null for non-existent id", () => {
    expect(getMemory("non-existent", db)).toBeNull();
  });

  it("returns the memory record for an existing id", () => {
    const created = createMemory({ ...MOCK_INPUT, content: "get-test" }, db);
    const fetched = getMemory(created.id, db);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.content).toBe("get-test");
  });
});

describe("listMemories", () => {
  it("returns memories filtered by userId", () => {
    // Create memories for two users
    createMemory({ ...MOCK_INPUT, content: "user2 memory" }, db);
    const result = listMemories({ userId: "user-1" }, db);
    expect(result.data.length).toBeGreaterThanOrEqual(3); // all previous test data
    result.data.forEach((m) => {
      expect(m.userId).toBe("user-1");
    });
  });

  it("filters by agentId when provided", () => {
    createMemory({
      userId: "user-1",
      agentId: "filter-agent",
      type: "fact",
      content: "filter by agent",
    }, db);
    const result = listMemories({ userId: "user-1", agentId: "filter-agent" }, db);
    expect(result.data.length).toBe(1);
    expect(result.data[0]!.agentId).toBe("filter-agent");
  });

  it("filters by type when provided", () => {
    createMemory({
      userId: "user-1",
      agentId: "agent-1",
      type: "preference",
      content: "type filter test",
    }, db);
    const result = listMemories({ userId: "user-1", type: "preference" }, db);
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    result.data.forEach((m) => {
      expect(m.type).toBe("preference");
    });
  });

  it("respects limit and offset", () => {
    const result = listMemories({ userId: "user-1", limit: 1, offset: 0 }, db);
    expect(result.data.length).toBe(1);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});

describe("deleteMemory", () => {
  it("deletes an existing memory record", () => {
    const created = createMemory({ ...MOCK_INPUT, content: "to-delete" }, db);
    const id = created.id;

    deleteMemory(id, db);
    expect(getMemory(id, db)).toBeNull();
  });

  it("does not throw when deleting non-existent record", () => {
    expect(() => deleteMemory("non-existent", db)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @agenthub/memory test src/__tests__/repository.test.ts
```

Expected: Fails with import errors because `repository.ts` doesn't exist yet.

- [ ] **Step 4: Create `packages/memory/src/repository.ts`**

```typescript
import type { MemoryRecord, MemoryType } from "@agenthub/shared";
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import type { CreateMemoryInput } from "./types.js";
import { randomUUID } from "node:crypto";

function toCamelCase(row: { [key: string]: unknown }): MemoryRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    agentId: row.agent_id as string,
    type: row.type as MemoryType,
    content: row.content as string,
    tags: JSON.parse(row.tags as string) as string[],
    sourceMessageId: (row.source_message_id as string) ?? undefined,
    conversationId: (row.conversation_id as string) ?? undefined,
    importance: row.importance as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function createMemory(input: CreateMemoryInput, customDb?: Database): MemoryRecord {
  const db = customDb || getDatabase();
  const id = randomUUID();
  const tagsJson = JSON.stringify(input.tags ?? []);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO memory_records (id, user_id, agent_id, type, content, tags, source_message_id, conversation_id, importance, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.userId,
    input.agentId,
    input.type,
    input.content,
    tagsJson,
    input.sourceMessageId ?? null,
    input.conversationId ?? null,
    input.importance ?? 1,
    now,
    now,
  );

  return getMemory(id, db) as MemoryRecord;
}

export function getMemory(id: string, customDb?: Database): MemoryRecord | null {
  const db = customDb || getDatabase();
  const row = db.prepare("SELECT * FROM memory_records WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? toCamelCase(row) : null;
}

export function listMemories(
  params: {
    userId: string;
    agentId?: string;
    type?: MemoryType;
    limit?: number;
    offset?: number;
  },
  customDb?: Database,
): { data: MemoryRecord[]; total: number } {
  const db = customDb || getDatabase();

  const conditions: string[] = ["user_id = ?"];
  const values: unknown[] = [params.userId];

  if (params.agentId) {
    conditions.push("agent_id = ?");
    values.push(params.agentId);
  }
  if (params.type) {
    conditions.push("type = ?");
    values.push(params.type);
  }

  const where = conditions.join(" AND ");
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const totalRow = db
    .prepare(`SELECT COUNT(*) as count FROM memory_records WHERE ${where}`)
    .get(...values) as { count: number };
  const total = totalRow.count;

  const rows = db
    .prepare(`SELECT * FROM memory_records WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...values, limit, offset) as Record<string, unknown>[];

  return {
    data: rows.map(toCamelCase),
    total,
  };
}

export function deleteMemory(id: string, customDb?: Database): void {
  const db = customDb || getDatabase();
  db.prepare("DELETE FROM memory_records WHERE id = ?").run(id);
}
```

- [ ] **Step 5: Update `packages/memory/src/index.ts` to export repository functions**

```typescript
export { getDatabase, closeDatabase, setDbPath } from "./db.js";
export type { Database } from "./db.js";
export { initSchema } from "./schema.js";
export { createMemory, getMemory, listMemories, deleteMemory } from "./repository.js";
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter @agenthub/memory test
```

Expected: All tests (db + repository) PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/memory/src/types.ts packages/memory/src/repository.ts packages/memory/src/__tests__/repository.test.ts packages/memory/src/index.ts
git commit -m "feat(memory): implement CRUD repository"
```

---

### Task 5: Implement FTS5 search

**Files:**
- Create: `packages/memory/src/search.ts`
- Create: `packages/memory/src/__tests__/search.test.ts`

**Interfaces:**
- Consumes: `MemoryRecord` from `@agenthub/shared` (Task 1), `getDatabase`, `Database` from `./db.js` (Task 3)
- Consumes: `createMemory` from `./repository.js` (Task 4) — to set up test data
- Produces: `searchMemories(options, customDb?): MemoryRecord[]` — FTS5 full-text search with optional userId/agentId filters

- [ ] **Step 1: Write the failing test — create `packages/memory/src/__tests__/search.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory } from "../repository.js";
import { searchMemories } from "../search.js";

let db: DatabaseType;

beforeAll(() => {
  db = createTestDb();
  // Seed test data for search
  createMemory({
    userId: "user-search",
    agentId: "agent-search",
    type: "fact",
    content: "The API endpoint is at https://api.example.com/v1",
    tags: ["api", "endpoint"],
  }, db);
  createMemory({
    userId: "user-search",
    agentId: "agent-search",
    type: "preference",
    content: "User prefers camelCase naming convention",
    tags: ["naming", "style"],
  }, db);
  createMemory({
    userId: "user-search",
    agentId: "agent-other",
    type: "decision",
    content: "Decided to use Prisma ORM for database access",
    tags: ["architecture", "database"],
  }, db);
  createMemory({
    userId: "user-search",
    agentId: "agent-search",
    type: "context",
    content: "Project root is /home/user/projects/agenthub",
    tags: ["project", "path"],
  }, db);
});

afterAll(() => {
  destroyTestDb(db);
});

describe("searchMemories", () => {
  it("finds memories matching the FTS query", () => {
    const results = searchMemories({ query: "API", limit: 10 }, db);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.content.includes("api.example.com"))).toBe(true);
  });

  it("filters by userId when provided", () => {
    const results = searchMemories({ query: "Prisma", userId: "user-search" }, db);
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("Prisma");
  });

  it("filters by agentId when provided", () => {
    const results = searchMemories({ query: "endpoint", agentId: "agent-search" }, db);
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("API endpoint");
  });

  it("returns empty array when no match", () => {
    const results = searchMemories({ query: "zzzznonexistent", limit: 10 }, db);
    expect(results.length).toBe(0);
  });

  it("respects limit", () => {
    const results = searchMemories({ query: "the", limit: 1 }, db);
    expect(results.length).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @agenthub/memory test src/__tests__/search.test.ts
```

Expected: Fails with import error because `search.ts` doesn't exist.

- [ ] **Step 3: Create `packages/memory/src/search.ts`**

```typescript
import type { MemoryRecord } from "@agenthub/shared";
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";

function toCamelCase(row: { [key: string]: unknown }): MemoryRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    agentId: row.agent_id as string,
    type: row.type as MemoryRecord["type"],
    content: row.content as string,
    tags: JSON.parse(row.tags as string) as string[],
    sourceMessageId: (row.source_message_id as string) ?? undefined,
    conversationId: (row.conversation_id as string) ?? undefined,
    importance: row.importance as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function searchMemories(
  options: {
    query: string;
    userId?: string;
    agentId?: string;
    limit?: number;
    offset?: number;
  },
  customDb?: Database,
): MemoryRecord[] {
  const db = customDb || getDatabase();

  const conditions: string[] = [];
  const values: unknown[] = [options.query];

  if (options.userId) {
    conditions.push("mr.user_id = ?");
    values.push(options.userId);
  }
  if (options.agentId) {
    conditions.push("mr.agent_id = ?");
    values.push(options.agentId);
  }

  const whereClause = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const sql = `
    SELECT mr.* FROM memory_fts fts
    JOIN memory_records mr ON mr.rowid = fts.rowid
    WHERE memory_fts MATCH ?
    ${whereClause}
    ORDER BY rank
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(sql).all(...values, limit, offset) as Record<string, unknown>[];
  return rows.map(toCamelCase);
}
```

- [ ] **Step 4: Update `packages/memory/src/index.ts` to export search**

```typescript
export { getDatabase, closeDatabase, setDbPath } from "./db.js";
export type { Database } from "./db.js";
export { initSchema } from "./schema.js";
export { createMemory, getMemory, listMemories, deleteMemory } from "./repository.js";
export { searchMemories } from "./search.js";
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @agenthub/memory test
```

Expected: All tests (db + repository + search) PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/search.ts packages/memory/src/__tests__/search.test.ts packages/memory/src/index.ts
git commit -m "feat(memory): implement FTS5 full-text search"
```

---

### Task 6: Implement LLM Extractor

**Files:**
- Create: `packages/memory/src/extractor.ts`
- Create: `packages/memory/src/__tests__/extractor.test.ts`

**Interfaces:**
- Consumes: `createMemory`, `deleteMemory`, `searchMemories`, `getMemory` from internal modules
- Consumes: `CreateMemoryInput`, `ExtractedMemory` from `./types.js`
- Produces: `extractMemories(params, llmConfig?, customDb?): Promise<void>` — async function that calls an LLM to analyze conversation and extract/update/delete memories

- [ ] **Step 1: Write the failing test — create `packages/memory/src/__tests__/extractor.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { extractMemories } from "../extractor.js";
import { createMemory, getMemory, listMemories } from "../repository.js";
import { searchMemories } from "../search.js";

let db: DatabaseType;

const MOCK_PARAMS = {
  userId: "user-extract",
  agentId: "agent-extract",
  agentName: "TestBot",
  userMessage: "I prefer using tabs over spaces for indentation",
  agentResponse: "Got it! I'll use tabs when writing code for you.",
};

beforeAll(() => {
  db = createTestDb();
});

afterAll(() => {
  destroyTestDb(db);
});

describe("extractMemories", () => {
  it("calls LLM and persists extracted memories", async () => {
    // Mock fetch to return a simulated LLM response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  action: "add",
                  type: "preference",
                  content: "User prefers tabs over spaces for indentation",
                  importance: 8,
                  reason: "User explicitly stated tab preference",
                },
              ]),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, {
      apiKey: "test-key",
      endpoint: "https://fake-api.test/v1/chat/completions",
      model: "test-model",
    }, db);

    // Verify the fetch was called
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify the memory was persisted
    const results = searchMemories({ query: "tabs", userId: "user-extract", agentId: "agent-extract" }, db);
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("tabs");
    expect(results[0]!.type).toBe("preference");

    vi.unstubAllGlobals();
  });

  it("handles deletion operations from LLM output", async () => {
    // First, create a memory we'll "delete"
    const created = createMemory({
      userId: "user-extract",
      agentId: "agent-extract",
      type: "fact",
      content: "Old fact to be removed",
    }, db);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  action: "delete",
                  id: created.id,
                  reason: "This fact is no longer relevant",
                },
              ]),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, {
      apiKey: "test-key",
      endpoint: "https://fake-api.test/v1/chat/completions",
    }, db);

    // Verify the memory was deleted
    expect(getMemory(created.id, db)).toBeNull();

    vi.unstubAllGlobals();
  });

  it("handles LLM API failure gracefully (no throw)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Rate Limited",
    });
    vi.stubGlobal("fetch", mockFetch);

    // Should not throw — extraction is non-blocking
    await expect(
      extractMemories(MOCK_PARAMS, { apiKey: "test-key" }, db),
    ).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("handles invalid JSON response gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "This is not valid JSON at all" } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      extractMemories(MOCK_PARAMS, { apiKey: "test-key" }, db),
    ).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("handles 'noop' action without side effects", async () => {
    const before = listMemories({ userId: "user-extract" }, db);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                { action: "noop", reason: "Nothing new to remember" },
              ]),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, { apiKey: "test-key" }, db);

    const after = listMemories({ userId: "user-extract" }, db);
    expect(after.data.length).toBe(before.data.length);

    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @agenthub/memory test src/__tests__/extractor.test.ts
```

Expected: Fails with import error because `extractor.ts` doesn't exist.

- [ ] **Step 3: Create `packages/memory/src/extractor.ts`**

```typescript
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import { searchMemories } from "./search.js";
import { createMemory, deleteMemory } from "./repository.js";
import type { ExtractedMemory } from "./types.js";

// ─── Prompt template ─────────────────────────────────────────────────────────

function buildPrompt(
  userMessage: string,
  agentResponse: string,
  agentName: string,
  existingMemoriesJson: string,
): string {
  return `你是一个 AI 记忆提取系统。分析以下对话，提取需要 Agent 长期记住的信息。

需要关注：
1. 用户偏好（技术栈、代码风格、沟通偏好）
2. 项目决策（架构选择、设计模式）
3. 关键事实（项目路径、API 端点、配置信息）
4. 错误模式（遇到的 bug 和修复方式）
5. 上下文信息（用户角色、技术栈、项目目标）

对每条候选记忆，与已有记忆对比后决定操作：

对话：
用户: ${userMessage}
Agent (${agentName}): ${agentResponse}

已有记忆（最近相关的 5 条）：
${existingMemoriesJson}

输出 JSON 数组，每项：
{
  "action": "add" | "update" | "delete" | "noop",
  "id": "已有记忆的 id（update/delete 时需要）",
  "type": "fact" | "preference" | "decision" | "error_pattern" | "context",
  "content": "记忆内容",
  "importance": 1-10,
  "reason": "操作原因说明"
}`;
}

// ─── LLM call ─────────────────────────────────────────────────────────────────

async function callLLM(
  prompt: string,
  llmConfig?: { apiKey?: string; endpoint?: string; model?: string },
): Promise<string> {
  const apiKey = llmConfig?.apiKey ?? process.env["API_KEY"] ?? "";
  const endpoint =
    llmConfig?.endpoint ??
    process.env["LLM_BASE_URL"]?.replace(/\/+$/, "") + "/v1/chat/completions" ??
    "https://api.deepseek.com/v1/chat/completions";
  const model = llmConfig?.model ?? process.env["LLM_MODEL"] ?? "deepseek-chat";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a memory extraction system. Respond with valid JSON only, no markdown formatting.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      return "";
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data?.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parseExtractionResponse(response: string): ExtractedMemory[] | null {
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) return parsed as ExtractedMemory[];
  } catch {
    // Try extracting from markdown code block
    const match = response.match(/```(?:json)?\s*([\s\S]*?)(```|$)/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]!.trim());
        if (Array.isArray(parsed)) return parsed as ExtractedMemory[];
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Asynchronously extract memories from a conversation turn.
 *
 * This function:
 * 1. Searches existing relevant memories
 * 2. Calls the LLM with the conversation + existing memories
 * 3. Parses the LLM response and executes add/update/delete operations
 *
 * This is designed to be called fire-and-forget (non-blocking).
 * Errors are caught internally and logged — never thrown to the caller.
 */
export async function extractMemories(
  params: {
    userId: string;
    agentId: string;
    agentName: string;
    userMessage: string;
    agentResponse: string;
  },
  llmConfig?: { apiKey?: string; endpoint?: string; model?: string },
  customDb?: Database,
): Promise<void> {
  const db = customDb || getDatabase();

  try {
    // 1. Search existing relevant memories
    const existingMemories = searchMemories(
      {
        query: params.userMessage,
        agentId: params.agentId,
        limit: 5,
      },
      db,
    );

    const existingMemoriesJson = JSON.stringify(
      existingMemories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        tags: m.tags,
        importance: m.importance,
      })),
    );

    // 2. Build and send prompt
    const prompt = buildPrompt(
      params.userMessage,
      params.agentResponse,
      params.agentName,
      existingMemoriesJson,
    );

    const response = await callLLM(prompt, llmConfig);
    if (!response) return;

    // 3. Parse response
    const operations = parseExtractionResponse(response);
    if (!operations || operations.length === 0) return;

    // 4. Execute operations
    for (const op of operations) {
      switch (op.action) {
        case "add":
          if (op.type && op.content) {
            createMemory(
              {
                userId: params.userId,
                agentId: params.agentId,
                type: op.type,
                content: op.content,
                tags: op.tags,
                importance: op.importance ?? 1,
              },
              db,
            );
          }
          break;

        case "update":
          if (op.id) {
            deleteMemory(op.id, db);
          }
          if (op.type && op.content) {
            createMemory(
              {
                userId: params.userId,
                agentId: params.agentId,
                type: op.type,
                content: op.content,
                tags: op.tags,
                importance: op.importance ?? 1,
              },
              db,
            );
          }
          break;

        case "delete":
          if (op.id) {
            deleteMemory(op.id, db);
          }
          break;

        case "noop":
          break;
      }
    }
  } catch {
    // Extraction is non-blocking; swallow all errors
  }
}
```

- [ ] **Step 4: Update `packages/memory/src/index.ts` to export the extractor**

```typescript
export { getDatabase, closeDatabase, setDbPath } from "./db.js";
export type { Database } from "./db.js";
export { initSchema } from "./schema.js";
export { createMemory, getMemory, listMemories, deleteMemory } from "./repository.js";
export { searchMemories } from "./search.js";
export { extractMemories } from "./extractor.js";
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @agenthub/memory test
```

Expected: All tests (db + repository + search + extractor) PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/extractor.ts packages/memory/src/__tests__/extractor.test.ts packages/memory/src/index.ts
git commit -m "feat(memory): implement LLM-based memory extractor"
```

---

### Task 7: Server API routes for memory CRUD + search

**Files:**
- Create: `apps/server/src/routes/memory.ts`
- Modify: `apps/server/src/app.ts` (register routes)

**Interfaces:**
- Consumes: `@agenthub/memory` (createMemory, getMemory, listMemories, searchMemories, deleteMemory, initSchema)
- Consumes: `authenticate` middleware from `apps/server/src/middleware/jwt.js`
- Consumes: `@agenthub/shared` (MemoryType)
- Produces: 4 protected API endpoints:
  - `POST /api/memory/create` — manual memory creation
  - `GET /api/memory/list` — paginated listing with optional type/agentId filter
  - `GET /api/memory/search` — FTS5 full-text search
  - `DELETE /api/memory/delete` — delete by id

- [ ] **Step 1: Create `apps/server/src/routes/memory.ts`**

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MemoryType } from "@agenthub/shared";
import {
  createMemory,
  getMemory,
  listMemories,
  searchMemories,
  deleteMemory,
  initSchema,
} from "@agenthub/memory";

// ─── Types ───────────────────────────────────────────────────────────────────

type CreateMemoryBody = {
  agentId: string;
  type: MemoryType;
  content: string;
  tags?: string[];
  sourceMessageId?: string;
  conversationId?: string;
  importance?: number;
};

type ListMemoriesQuery = {
  agentId?: string;
  type?: MemoryType;
  limit?: string;
  offset?: string;
};

type SearchMemoriesQuery = {
  q: string;
  agentId?: string;
  limit?: string;
  offset?: string;
};

type DeleteMemoryQuery = {
  id: string;
};

// ─── Validation helpers ──────────────────────────────────────────────────────

const VALID_MEMORY_TYPES = ["fact", "preference", "decision", "error_pattern", "context"];

function validateCreateBody(body: unknown): body is CreateMemoryBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.agentId === "string" &&
    typeof b.content === "string" &&
    b.content.length > 0 &&
    typeof b.type === "string" &&
    VALID_MEMORY_TYPES.includes(b.type)
  );
}

function parseIntParam(val: string | undefined, defaultVal: number): number {
  const n = parseInt(val ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : defaultVal;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleCreate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!validateCreateBody(request.body)) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  const body = request.body as CreateMemoryBody;

  const memory = createMemory({
    userId: request.userId!,
    agentId: body.agentId,
    type: body.type,
    content: body.content,
    tags: body.tags,
    sourceMessageId: body.sourceMessageId,
    conversationId: body.conversationId,
    importance: body.importance,
  });

  return reply.status(201).send(memory);
}

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

  return reply.status(200).send(result);
}

async function handleSearch(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as SearchMemoriesQuery;

  if (!query.q || typeof query.q !== "string" || query.q.trim().length === 0) {
    return reply.status(400).send({ error: "Query parameter 'q' is required" });
  }

  const results = searchMemories({
    query: query.q,
    userId: request.userId!,
    agentId: query.agentId,
    limit: parseIntParam(query.limit, 50),
    offset: parseIntParam(query.offset, 0),
  });

  return reply.status(200).send(results);
}

async function handleDelete(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as DeleteMemoryQuery;

  if (!query.id) {
    return reply.status(400).send({ error: "Query parameter 'id' is required" });
  }

  // Check ownership
  const existing = getMemory(query.id);
  if (!existing) {
    return reply.status(404).send({ error: "Memory not found" });
  }
  if (existing.userId !== request.userId!) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  deleteMemory(query.id);
  return reply.status(204).send();
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  // Ensure the memory database schema is initialized on first route registration
  // (idempotent — only creates tables if they don't exist)
  initSchema();

  app.post("/api/memory/create", handleCreate);
  app.get("/api/memory/list", handleList);
  app.get("/api/memory/search", handleSearch);
  app.delete("/api/memory/delete", handleDelete);
}
```

- [ ] **Step 2: Register routes in `apps/server/src/app.ts`**

Add the import at the top (alphabetically between `marketRoutes` and `messageRoutes`):
```typescript
import { memoryRoutes } from "./routes/memory";
```

Add the registration inside the protected scope (after `marketRoutes` line):
```typescript
await protectedApp.register(memoryRoutes);
```

The relevant section of `app.ts` should now look like:

```typescript
import { marketRoutes } from "./routes/market";
import { memoryRoutes } from "./routes/memory";
import { messageRoutes } from "./routes/messages";
// ...
    await protectedApp.register(marketRoutes, { prefix: "/api/market" });
    await protectedApp.register(memoryRoutes);
    await protectedApp.register(fileRoutes, { prefix: "/api/files" });
```

Note: `memoryRoutes` does NOT use a prefix because the routes already include `/api/memory/` in their path definitions. This avoids a double-prefix issue.

- [ ] **Step 3: Verify the server builds and starts**

```bash
pnpm --filter @agenthub/server build
```

Expected: Build succeeds with no type errors (the memory route module compiles).

Then verify the routes are registered:
```bash
pnpm --filter @agenthub/server dev &
sleep 2
# The server should start without errors
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/memory.ts apps/server/src/app.ts
git commit -m "feat(server): add memory CRUD + search API routes"
```

---

### Task 8: Orchestrator integration — executor memory injection + post-execution extraction hook

**Files:**
- Modify: `apps/server/src/orchestrator/executor.ts` (memory injection into buildContext)
- Modify: `apps/server/src/routes/messages.ts` (post-execution extractMemories hook)

**Interfaces:**
- Consumes: `searchMemories` from `@agenthub/memory` (Task 5) — injected into executor's `buildContext()`
- Consumes: `extractMemories` from `@agenthub/memory` (Task 6) — called after agent responses are saved
- Consumes: `initSchema` from `@agenthub/memory` — ensures DB exists on first access

- [ ] **Step 1: Modify `apps/server/src/orchestrator/executor.ts` — add memory injection**

Add the import after the existing imports at the top:
```typescript
import { searchMemories } from "@agenthub/memory";
```

Add the `_memoryInjected` field and modify the `buildContext` method:

```typescript
export class SubTaskExecutor {
  /**
   * Track whether memory has been injected for this executor instance.
   * Only inject on the first SubTask to maximize prefix caching.
   */
  private _memoryInjected = false;

  // ... execute() stays the same ...

  private async buildContext(subtask: SubTask): Promise<AgentContext> {
    // Inject pinned messages as system context
    let pinnedContext: string | undefined;
    try {
      const pinnedMessages = await listPinnedMessages(subtask.conversationId);
      if (pinnedMessages.length > 0) {
        pinnedContext = pinnedMessages
          .map((m: { content: string }) => `[Pinned Context]: ${m.content}`)
          .join("\n");
      }
    } catch {
      // Ignore errors loading pinned messages
    }

    // Build system prompt parts
    const systemParts: string[] = [];
    if (pinnedContext) systemParts.push(pinnedContext);

    // Inject relevant memories only on the FIRST SubTask
    if (!this._memoryInjected) {
      try {
        const memories = searchMemories({
          query: subtask.instruction,
          agentId: subtask.agentId,
          limit: 5,
        });
        if (memories.length > 0) {
          systemParts.push(
            memories
              .map((m) => `[Memory - ${m.type}] ${m.content}`)
              .join("\n\n"),
          );
        }
      } catch {
        // Non-blocking — memories are a hint, not a requirement
      }
      this._memoryInjected = true;
    }

    return {
      conversationId: subtask.conversationId,
      message: subtask.instruction,
      history: subtask.context.map((c) => ({
        id: "",
        conversationId: subtask.conversationId,
        senderType: c.role === "user" ? ("user" as const) : ("contact" as const),
        senderId: c.role === "user" ? "user" : subtask.agentId,
        type: "text" as const,
        content: c.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as AgentContext["history"],
      agents: [],
      ...(systemParts.length > 0 ? { systemPrompt: systemParts.join("\n\n") } : {}),
    };
  }
}
```

- [ ] **Step 2: Modify `apps/server/src/routes/messages.ts` — add post-execution extraction hook**

Add the import at the top:
```typescript
import { extractMemories, initSchema } from "@agenthub/memory";
```

Add initialization call near the top of `runAgentExecution()` (before the `log.info(...)` line, as the first line inside the function):
```typescript
async function runAgentExecution(
  conversationId: string,
  content: string,
  cm: FastifyInstance["connectionManager"],
  log: FastifyInstance["log"],
): Promise<void> {
  initSchema(); // Ensure memory DB is initialized
  // ... rest of the existing function ...
```

Add the extraction hook after the final response is saved (after line 727, before the `donePayload`). Insert right after the `messageId = saved.id;` line and before `const donePayload`:

```typescript
      // Save AI response to database
      let messageId = "";
      if (finalResponse) {
        const saved = await dbCreateMessage({
          conversationId,
          senderType: "Contact",
          senderId: agent.id,
          type: "Text",
          content: finalResponse,
          parentId: null,
        });
        messageId = saved.id;

        // ── Long-term memory extraction ─────────────────────────────
        extractMemories({
          userId: conv.ownerId,
          agentId: agent.id,
          agentName: agent.name,
          userMessage: content,
          agentResponse: finalResponse,
        }).catch((err) => {
          log.error({ err }, "Memory extraction failed");
        });
      }
```

Similarly, add extraction in the orchestrator path in `runOrchestration()` — after each agent message is saved in the `onTaskCompleted` callback (inside the `try` block, after the `createMessage` call):

```typescript
      async (subtask, result) => {
        try {
          const msg = await createMessage({
            conversationId,
            senderType: "Contact",
            senderId: subtask.agentId,
            type: "Text",
            content: result.content,
            parentId: messageId,
          });
          log.info({ agentId: subtask.agentId }, "Agent message saved");

          // ── Long-term memory extraction for this agent's response ──
          extractMemories({
            userId: conversation.ownerId,
            agentId: subtask.agentId,
            agentName: subtask.agentName ?? subtask.agentId,
            userMessage: message.content,
            agentResponse: result.content,
          }).catch((err) => {
            log.error({ err, agentId: subtask.agentId }, "Memory extraction failed");
          });

          return msg.id;
        } catch (err) {
          log.error({ err, agentId: subtask.agentId }, "Failed to save agent message");
          return undefined;
        }
      },
```

- [ ] **Step 3: Verify the server builds**

```bash
pnpm build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/orchestrator/executor.ts apps/server/src/routes/messages.ts
git commit -m "feat(server): integrate memory injection and extraction hooks"
```

---

### Task 9: Install better-sqlite3 native dependency

**Files:** None (dependency resolution)

- [ ] **Step 1: Install dependencies**

```bash
pnpm install
```

Expected: better-sqlite3 native module compiles and installs successfully. (Node 18+ is required. On macOS, Xcode Command Line Tools handles the native compilation.)

- [ ] **Step 2: Verify the full test suite passes**

```bash
pnpm --filter @agenthub/memory test
```

Expected: All tests PASS.

- [ ] **Step 3: Verify the full project builds**

```bash
pnpm build
```

Expected: All packages build cleanly.

- [ ] **Step 4: Commit**

```bash
git add pnpm-lock.yaml
git commit -m "chore: install better-sqlite3 dependency for @agenthub/memory"
```

---

