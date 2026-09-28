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
  const conditions: string[] = ["r.user_id = ?", scope.sql];
  // 顺序必须与 WHERE 子句一致：MATCH 占位符在最前，其后依次是 userId、scope、agentId
  const values: unknown[] = [options.query, options.userId, ...scope.params];

  if (options.agentId) {
    conditions.push("r.agent_id = ?");
    values.push(options.agentId);
  }

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const sql = `
    SELECT r.* FROM memory_fts fts
    JOIN memory_records r ON r.rowid = fts.rowid
    WHERE memory_fts MATCH ?
      AND ${conditions.join("\n      AND ")}
    ORDER BY rank
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(sql).all(...values, limit, offset) as Record<string, unknown>[];
  return rows.map(rowToMemoryRecord);
}
