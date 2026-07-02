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
