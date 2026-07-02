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
