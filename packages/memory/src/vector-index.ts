import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import { buildScopeClause } from "./scope.js";
import type { MemoryScope } from "./types.js";

export interface VectorIndex {
  upsert(memoryId: string, vec: Float32Array, fingerprint: string, model: string): void;
  remove(memoryId: string): void;
  search(
    query: Float32Array,
    k: number,
    filter: { userId: string; scope: MemoryScope },
  ): Array<{ memoryId: string; score: number }>;
  size(): number;
}

/**
 * 预编译语句缓存的最小结构类型。
 *
 * better-sqlite3 的类型只经 `export =` 暴露，`Statement` 取不到具名导入，
 * 而 `ReturnType<Database["prepare"]>` 会解析成含条件类型分支的联合，
 * 让可变参数 spread 报 TS2556。这里只需要 `all`。
 */
interface CachedStatement {
  all(...params: unknown[]): unknown[];
}

/**
 * 把 BLOB 里的 float32 读成 `Float32Array`。
 *
 * 正常路径零拷贝：better-sqlite3 返回的 `Buffer` 在 V8 堆外，直接在上面建视图，
 * 不把向量字节搬进 JS 堆。
 *
 * 但 `new Float32Array(buffer, byteOffset, dim)` 要求 `byteOffset` 是 4 的倍数，
 * 否则抛 `RangeError`。better-sqlite3 目前总是给 byteOffset 0（实测），
 * 这条分支是防御性的 —— 但 spec §12 要求「向量字节未对齐时回退到复制路径
 * 而非抛错」，所以保留并单独测试（导出仅供测试使用）。
 */
export function toFloat32View(buffer: Buffer, dim: number): Float32Array {
  if (buffer.byteOffset % 4 === 0) {
    return new Float32Array(buffer.buffer, buffer.byteOffset, dim);
  }
  // 复制路径：slice 出的 ArrayBuffer 从 0 开始，天然对齐。
  const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + dim * 4);
  return new Float32Array(copy);
}

/**
 * BLOB + JS 暴力余弦的向量索引。
 *
 * 规模：会话作用域让候选集从「某用户的所有记忆」缩到「某个项目的记忆」，
 * 单会话预期数百到数千条 —— 该规模下暴力扫描是微秒级。**会话作用域使
 * 暴力方案比全库检索更安全，而不是更勉强**（spec §8.4）。
 *
 * 过滤在读取向量字节之前由 SQL 完成，实际载入的不是全库。
 *
 * 作用域片段来自 `buildScopeClause`，与 BM25 路共用同一实现 —— 两路各写一份
 * 的话，分歧只在跨项目场景下暴露（spec §8.4）。该片段以 `r.` 为前缀，
 * 故 `memory_records` 必须别名为 `r`。
 */
export function createBlobVectorIndex(customDb?: Database): VectorIndex {
  const db = customDb || getDatabase();

  // 作用域只有两种取值，预编译语句按 SQL 文本缓存，避免每次 search 重新 prepare。
  const statementCache = new Map<string, CachedStatement>();

  function searchStatement(scopeSql: string): CachedStatement {
    const sql = `
      SELECT e.memory_id, e.vec, e.dim
      FROM memory_embeddings e
      JOIN memory_records r ON r.id = e.memory_id
      WHERE r.user_id = ?
        AND ${scopeSql}
    `;
    let stmt = statementCache.get(sql);
    if (!stmt) {
      stmt = db.prepare(sql);
      statementCache.set(sql, stmt);
    }
    return stmt;
  }

  return {
    upsert(memoryId: string, vec: Float32Array, fingerprint: string, model: string): void {
      db.prepare(`
        INSERT OR REPLACE INTO memory_embeddings (memory_id, fingerprint, model, dim, vec, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(
        memoryId,
        fingerprint,
        model,
        vec.length,
        // 不复制：vec.buffer / byteOffset 一起交给 SQLite，由它拷进页里
        Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength),
      );
    },

    remove(memoryId: string): void {
      db.prepare("DELETE FROM memory_embeddings WHERE memory_id = ?").run(memoryId);
    },

    search(query, k, filter) {
      const scope = buildScopeClause(filter.scope);
      const rows = searchStatement(scope.sql).all(filter.userId, ...scope.params) as Array<{
        memory_id: string;
        vec: Buffer;
        dim: number;
      }>;

      const scored: Array<{ memoryId: string; score: number }> = [];

      for (const row of rows) {
        // 维度不符的行直接跳过 —— 拿截断或补零的结果参与排序会得到垃圾分数
        if (row.dim !== query.length) continue;
        if (row.vec.byteLength !== row.dim * 4) continue;

        const stored = toFloat32View(row.vec, row.dim);

        // 向量已归一化，点积即余弦（spec §8.1）
        let dot = 0;
        for (let i = 0; i < row.dim; i++) dot += stored[i]! * query[i]!;

        scored.push({ memoryId: row.memory_id, score: dot });
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k);
    },

    size(): number {
      const row = db.prepare("SELECT COUNT(*) AS count FROM memory_embeddings").get() as {
        count: number;
      };
      return row.count;
    },
  };
}

/** 生产环境的默认索引（使用模块级 SQLite 单例）。 */
export function createMemoryVectorIndex(customDb?: Database): VectorIndex {
  return createBlobVectorIndex(customDb);
}
