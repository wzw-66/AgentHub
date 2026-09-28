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
    // 全新库与老库走同一条路径，落点版本必须一致
    expect(currentVersion(db)).toBe(2);

    // 新库与老库迁移后应可写入
    const created = createMemory(
      { userId: "u", conversationId: "c", agentId: "a", type: "fact", content: "fresh" },
      db,
    );
    expect(created.conversationId).toBe("c");

    db.close();
  });

  it("tolerates a pre-existing memory_embeddings table instead of aborting", () => {
    const dbPath = freshDbPath();
    const db = new Database(dbPath);
    // 预置同名但结构不同的表 —— v2 用 CREATE TABLE IF NOT EXISTS，
    // 因此不会因它而中断（新表由 v2 事务内创建，不存在被中断的半成品状态）
    db.exec("CREATE TABLE memory_embeddings (memory_id TEXT PRIMARY KEY)");

    expect(currentVersion(db)).toBe(0);
    expect(() => migrate(db)).not.toThrow();
    expect(currentVersion(db)).toBe(2);

    db.close();
  });

  it("rolls back and does not advance user_version when a migration throws", () => {
    const dbPath = freshDbPath();
    const db = makeLegacyV0Db(dbPath);
    // legacy schema 就是 v1 的 schema，直接声明成 v1，让 migrate 从 v2 开始跑
    db.pragma("user_version = 1");
    // 预置一个让 v2 失败的冲突对象：SQLite 对 view 只接受 DROP VIEW，
    // `DROP TABLE memory_fts` 必然报错，于是 v2 在事务中途失败。
    db.exec("DROP TABLE memory_fts; CREATE VIEW memory_fts AS SELECT 1 AS x;");

    expect(currentVersion(db)).toBe(1);
    expect(() => migrate(db)).toThrow(/version 2/);

    // 关键断言：失败不推进版本
    expect(currentVersion(db)).toBe(1);

    // 结构也必须回滚 —— v2 先加的列与表都不能留下
    const cols = (db.prepare("PRAGMA table_info(memory_records)").all() as Array<{ name: string }>).map(
      (c) => c.name,
    );
    expect(cols).not.toContain("content_seg");
    expect(cols).not.toContain("tags_seg");
    const embeddings = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_embeddings'")
      .get();
    expect(embeddings).toBeUndefined();

    // 数据无损
    const row = db.prepare("SELECT content FROM memory_records WHERE id = 'legacy-1'").get() as {
      content: string;
    };
    expect(row.content).toBe("Legacy memory that must survive migration");

    db.close();
  });
});
