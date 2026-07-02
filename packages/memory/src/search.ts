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
