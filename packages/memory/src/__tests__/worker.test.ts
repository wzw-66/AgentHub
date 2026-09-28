import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { migrate } from "../migrations.js";
import {
  reindexMemories,
  isBm25Ready,
  setBm25ReadyForTesting,
  REINDEX_TIMEOUT_MS,
} from "../worker.js";
import { createMemory } from "../repository.js";
import { FakeSegmenter } from "./fakes.js";
import { buildFtsQuery } from "../fts-query.js";

/**
 * 词表刻意拆成「代码」「风格」两个词项。
 *
 * `FakeSegmenter` 是最长匹配，而 `setup.ts` 的共享词表里是整词「代码风格」——
 * 用它切 `["代码风格"]` 只会得到一个 token。断言 `"代码 风格"` 时若沿用那份词表，
 * 测试会因为「分词器挑的词不一样」而失败，与 `reindexMemories` 对错无关。
 */
const VOCABULARY = ["缩进", "用户", "偏好", "连接池", "代码", "风格"];
const seg = new FakeSegmenter(VOCABULARY);

let dbPath: string;
let db: Database.Database;

beforeEach(() => {
  dbPath = path.join(
    os.tmpdir(),
    `agenthub-reindex-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  setBm25ReadyForTesting(false);
});

afterEach(() => {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      /* ignore */
    }
  }
});

function insertRaw(id: string, content: string, tags = "[]"): void {
  db.prepare(
    `INSERT INTO memory_records (id, user_id, agent_id, type, content, tags, conversation_id, importance, created_at, updated_at)
     VALUES (?, 'u1', 'a1', 'fact', ?, ?, 'c1', 1, datetime('now'), datetime('now'))`,
  ).run(id, content, tags);
}

function ftsHits(query: string): unknown[] {
  const ftsQuery = buildFtsQuery(query, seg);
  if (ftsQuery === null) return [];
  return db.prepare("SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?").all(ftsQuery);
}

describe("REINDEX_TIMEOUT_MS", () => {
  it("is the bounded startup wait from spec §9.4", () => {
    expect(REINDEX_TIMEOUT_MS).toBe(30_000);
  });
});

describe("reindexMemories", () => {
  it("backfills content_seg and tags_seg for pre-existing rows", () => {
    insertRaw("m1", "用户偏好缩进", '["代码风格"]');

    const result = reindexMemories(seg, db);

    expect(result.backfilled).toBe(1);
    const row = db
      .prepare("SELECT content_seg, tags_seg FROM memory_records WHERE id = 'm1'")
      .get() as { content_seg: string; tags_seg: string };
    expect(row.content_seg).toBe("用户 偏好 缩进");
    expect(row.tags_seg).toBe("代码 风格");
  });

  it("makes backfilled rows searchable through the FTS index", () => {
    insertRaw("m1", "用户偏好缩进");
    reindexMemories(seg, db);

    expect(ftsHits("缩进").length).toBe(1);
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
    const row = db.prepare("SELECT content_seg FROM memory_records WHERE id = 'm-empty'").get() as {
      content_seg: string | null;
    };
    expect(row.content_seg).toBe("");
  });

  it("tolerates malformed tags JSON instead of aborting the backfill", () => {
    insertRaw("m-bad-tags", "用户偏好缩进", "not json");
    expect(reindexMemories(seg, db).backfilled).toBe(1);
    const row = db.prepare("SELECT tags_seg FROM memory_records WHERE id = 'm-bad-tags'").get() as {
      tags_seg: string | null;
    };
    expect(row.tags_seg).toBe("");
  });

  it("keeps the index consistent once the backfill is done — later writes are indexed too", () => {
    insertRaw("m1", "用户偏好缩进");
    reindexMemories(seg, db);

    // 触发器必须在 reindex 结束后复原，否则后续写入会静默不进索引
    createMemory(
      { userId: "u1", conversationId: "c1", agentId: "a1", type: "fact", content: "连接池缩进" },
      db,
      seg,
    );

    expect(ftsHits("连接池").length).toBe(1);
    expect(ftsHits("缩进").length).toBe(2);
  });

  it("leaves bm25 not-ready when the rebuild fails", () => {
    setBm25ReadyForTesting(true);
    // 没有 memory_fts 的库 —— rebuild 必然失败
    const bare = new Database(":memory:");
    try {
      expect(() => reindexMemories(seg, bare)).toThrow();
      expect(isBm25Ready()).toBe(false);
    } finally {
      bare.close();
    }
  });
});

describe("reindexMemories on a legacy database", () => {
  const legacyDbPaths: string[] = [];

  /** 一个「改造前」的库：旧表 + 旧 FTS（索引 content / tags）+ 旧触发器 + 已有数据。 */
  function makeLegacyDb(): Database.Database {
    const legacyPath = path.join(
      os.tmpdir(),
      `agenthub-legacy-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    legacyDbPaths.push(legacyPath);
    const legacy = new Database(legacyPath);
    legacy.pragma("journal_mode = WAL");
    legacy.pragma("foreign_keys = ON");
    legacy.exec(`
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
        VALUES ('legacy-cn', 'u1', 'a1', 'fact', '用户偏好缩进', '["代码风格"]', 'c1', 5, datetime('now'), datetime('now'));
      INSERT INTO memory_records (id, user_id, agent_id, type, content, tags, conversation_id, importance, created_at, updated_at)
        VALUES ('legacy-ascii', 'u1', 'a1', 'fact', 'connected pool', '[]', 'c1', 1, datetime('now'), datetime('now'));
    `);
    return legacy;
  }

  afterEach(() => {
    for (const p of legacyDbPaths.splice(0)) {
      for (const suffix of ["", "-wal", "-shm"]) {
        try {
          fs.unlinkSync(p + suffix);
        } catch {
          /* ignore */
        }
      }
    }
  });

  it("pins the SQLITE_CORRUPT_VTAB window that forces reindex to drop the triggers", () => {
    const legacy = makeLegacyDb();
    try {
      migrate(legacy);

      // 迁移刚 DROP/重建了 memory_fts：索引为空，而 memory_records 有数据。
      // 此时 UPDATE 已存在的行，`au` 触发器里的 'delete' 会发现索引里没有这个
      // rowid —— FTS5 报 SQLITE_CORRUPT_VTAB，即 "database disk image is malformed"。
      // 这正是回填期间必须先摘掉触发器的原因：先回填再重建（直觉顺序）在老库上
      // 必然失败，而且只在老库上失败。
      expect(() =>
        legacy
          .prepare("UPDATE memory_records SET content_seg = '用户 偏好 缩进' WHERE id = 'legacy-cn'")
          .run(),
      ).toThrow(/malformed/i);
    } finally {
      legacy.close();
    }
  });

  it("backfills and indexes a pre-populated legacy database without corrupting it", () => {
    const legacy = makeLegacyDb();
    try {
      migrate(legacy);

      const result = reindexMemories(seg, legacy);

      expect(result.backfilled).toBe(2);
      expect(isBm25Ready()).toBe(true);
    } finally {
      legacy.close();
    }
  });

  it("rebuilds the index even when nothing needs backfilling", () => {
    // 真实的升级路径：库已经被 v2 迁过、行是 Task 12 之后的代码写的（content_seg
    // 本来就填好了），只是索引还指着旧列。到 v3 时 DROP 重建让索引变空，而
    // `pending` 是 **0** —— 若把 rebuild 写成「有回填才跑」，这些行会静默检索不到。
    const legacy = makeLegacyDb();
    try {
      legacy.exec(`
        ALTER TABLE memory_records ADD COLUMN content_seg TEXT;
        ALTER TABLE memory_records ADD COLUMN tags_seg TEXT;
        PRAGMA user_version = 2;
      `);
      const seed = legacy.prepare(
        "UPDATE memory_records SET content_seg = ?, tags_seg = ? WHERE id = ?",
      );
      seed.run("用户 偏好 缩进", "代码 风格", "legacy-cn");
      seed.run("连接池", "", "legacy-ascii");

      migrate(legacy);
      expect(
        legacy.prepare("SELECT COUNT(*) AS c FROM memory_records WHERE content_seg IS NULL").get(),
      ).toEqual({ c: 0 });

      expect(reindexMemories(seg, legacy).backfilled).toBe(0);

      for (const term of ["缩进", "连接池"]) {
        const hits = legacy
          .prepare("SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?")
          .all(buildFtsQuery(term, seg)!);
        expect(hits.length).toBe(1);
      }
    } finally {
      legacy.close();
    }
  });

  it("makes pre-existing Chinese rows recallable end to end after migration", () => {
    const legacy = makeLegacyDb();
    try {
      migrate(legacy);
      reindexMemories(seg, legacy);

      const ftsQuery = buildFtsQuery("缩进", seg)!;
      const hits = legacy
        .prepare("SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?")
        .all(ftsQuery) as Array<{ rowid: number }>;
      expect(hits.length).toBe(1);

      // 索引必须覆盖**全部**行，而不只是回填过的那些
      const indexed = legacy.prepare("SELECT COUNT(*) AS c FROM memory_fts_docsize").get() as {
        c: number;
      };
      const records = legacy.prepare("SELECT COUNT(*) AS c FROM memory_records").get() as {
        c: number;
      };
      expect(indexed.c).toBe(records.c);

      // 触发器已复原：迁移后的写入照常进索引
      expect(() =>
        legacy
          .prepare(
            `INSERT INTO memory_records (id, user_id, agent_id, type, content, content_seg, tags, tags_seg, conversation_id, importance)
             VALUES ('post-1', 'u1', 'a1', 'fact', 'x', '连接池', '[]', '', 'c1', 1)`,
          )
          .run(),
      ).not.toThrow();
      const after = legacy
        .prepare("SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?")
        .all(buildFtsQuery("连接池", seg)!) as Array<{ rowid: number }>;
      expect(after.length).toBe(1);
    } finally {
      legacy.close();
    }
  });
});

describe("bm25Ready flag", () => {
  it("starts false for a fresh module state so callers must opt in", () => {
    setBm25ReadyForTesting(false);
    expect(isBm25Ready()).toBe(false);
  });
});
