import type { Segmenter } from "./segmenter.js";

/**
 * 把用户查询编译成 FTS5 MATCH 表达式。
 *
 * 三个要点（spec §8.3）：
 * 1. **OR 而非 AND。** FTS5 默认按 AND 处理，多词查询必然返回空 —— 这是现状
 *    中文之外的第二条失效原因。OR 让部分命中也能召回，相关性交给 BM25 排序。
 * 2. **每个词项加双引号。** 既转义 FTS5 语法字符（* " ( ) : ^ -），
 *    又让单个词项作为短语匹配而非被当作操作符。
 * 3. **返回 null 表示查询为空**，调用方据此跳过 BM25 路，不执行 `MATCH ''`。
 */
export function buildFtsQuery(query: string, seg: Segmenter): string | null {
  const terms = seg.cut(query).filter((t) => t.trim().length > 0);
  if (terms.length === 0) return null;

  return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");
}
