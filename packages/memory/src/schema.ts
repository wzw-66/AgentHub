import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import { migrate } from "./migrations.js";

/**
 * 同步执行所有待应用的 schema 迁移。
 *
 * 只做 DDL —— content_seg / tags_seg 的数据回填与 FTS rebuild 依赖分词器，
 * 属于 reindexMemories 的职责（spec §9.4）。
 */
export function initSchema(customDb?: Database): void {
  const targetDb = customDb || getDatabase();
  migrate(targetDb);
}
