import type { MemoryRecord, MemoryType } from "@agenthub/shared";
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import type { CreateMemoryInput } from "./types.js";
import { rowToMemoryRecord } from "./utils.js";
import { randomUUID } from "node:crypto";

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
  return row ? rowToMemoryRecord(row) : null;
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
    data: rows.map(rowToMemoryRecord),
    total,
  };
}

export function deleteMemory(id: string, customDb?: Database): void {
  const db = customDb || getDatabase();
  db.prepare("DELETE FROM memory_records WHERE id = ?").run(id);
}
