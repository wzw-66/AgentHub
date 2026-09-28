import type { Database } from "./db.js";

/**
 * 按 `PRAGMA user_version` 顺序执行的迁移。
 *
 * 存在理由：`CREATE TABLE IF NOT EXISTS` 对已存在的表静默跳过任何结构变更。
 * 换 FTS 分词器必须 DROP 虚表并 rebuild，IF NOT EXISTS 做不到 —— 结果是
 * 「以为修好了，实际中文仍查不到」（spec §4.5）。
 *
 * 划分：v1 是「本次改造前就存在的 schema」（对老库是 no-op，对新库是建库），
 * v2 是 P1 的实际变更（`content_seg` / `tags_seg` 列 + `memory_embeddings` 表）。
 * 两者共用同一条代码路径，不需要「新库/老库」分支。
 *
 * **v3**：`memory_fts` 的 DROP/重建 + 三个触发器改指向 `content_seg` / `tags_seg`。
 * 刻意不放在 v2 —— 重建虚表会让索引瞬间变空，只有在同一处紧接着 `rebuild`
 * 才能把「索引未就绪」的窗口关掉；拆到两个迁移会留下「搜索静默返回空」的中间状态。
 * 注意 v3 只做**结构**：索引重建后是空的，灌数据是 `reindexMemories` 的职责。
 *
 * `MIGRATIONS` 是**只追加**列表：新增迁移在末尾追加一项即可，不要改动已发布项。
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

      // 纯 DDL，不回填 —— content_seg / tags_seg 的数据由 reindexMemories 负责（spec §9.4）。
      // memory_fts 与 mem_fts_* 触发器在本迁移里保持原样（仍索引 content / tags）；
      // 换列是 v3，见文件头注释。
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
    },
  },
  {
    version: 3,
    up(db) {
      // 把 FTS 索引从原始 `content` / `tags` 换到分词后的 `content_seg` / `tags_seg`。
      // `IF NOT EXISTS` 做不到这件事（对已存在的虚表静默跳过），必须 DROP 再建；
      // 外部内容表契约（content= / content_rowid=）与 unicode61 分词器保持不变，
      // 只有被索引的列变了 —— spec §9.4。
      //
      // 触发器必须先删再建：`CREATE TRIGGER` 没有 `OR REPLACE`，同名触发器会
      // 直接报 "trigger mem_fts_ai already exists" 让整个迁移回滚。
      //
      // 注意本迁移结束时 memory_fts 是**空的**（刚建出来），而 memory_records 有数据。
      // 这个窗口必须由调用方紧接着 `reindexMemories` 关掉，见 worker.ts。
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

/** 本文件已知的最高版本号，也是 `migrate()` 敢碰的上限。 */
const NEWEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

export function currentVersion(db: Database): number {
  const row = db.pragma("user_version") as Array<{ user_version: number }> | number;
  if (typeof row === "number") return row;
  return row[0]?.user_version ?? 0;
}

export function migrate(db: Database): { from: number; to: number } {
  const from = currentVersion(db);
  let version = from;

  // 比本文件更新的库：说明这份代码比库旧（回滚了版本、或两个版本共用了一个库文件）。
  // 不抛的话下面会安静地返回 {from, to: from}，服务带着「以为迁移过了」的假设继续跑。
  if (from > NEWEST_VERSION) {
    throw new Error(
      `Memory database is at schema version ${from}, but this build only knows up to ` +
        `${NEWEST_VERSION}. Refusing to touch it — the database was migrated by a newer build.`,
    );
  }

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
