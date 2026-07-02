import type { MemoryRecord } from "@agenthub/shared";
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import { rowToMemoryRecord } from "./utils.js";

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
  return rows.map(rowToMemoryRecord);
}
