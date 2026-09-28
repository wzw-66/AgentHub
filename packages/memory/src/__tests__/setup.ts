import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { initSchema } from "../schema.js";
import { setDefaultSegmenter } from "../repository.js";
import { FakeSegmenter } from "./fakes.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

let _db: DatabaseType | undefined;

/**
 * 测试用固定词表。
 *
 * 让所有测试都不依赖 jieba 词典（constraints：测试不得依赖真实模型、jieba 词典、网络）——
 * 否则 jieba 升级会让写入侧 content_seg / tags_seg 的结果漂移（spec §8.2）。
 */
const TEST_VOCABULARY = [
  "缩进", "用户", "偏好", "连接池", "代码风格", "风格", "错误", "接口", "性能",
  "格式化", "脚本", "数据库", "架构", "项目", "路径", "配置",
];

export function createTestDb(): DatabaseType {
  setDefaultSegmenter(new FakeSegmenter(TEST_VOCABULARY));
  const testPath = path.join(os.tmpdir(), `agenthub-memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  _db = new Database(testPath);
  initSchema(_db);
  return _db;
}

export function destroyTestDb(testDb: DatabaseType): void {
  const dbPath = testDb.name;
  testDb.close();
  _db = undefined;
  try {
    if (dbPath) fs.unlinkSync(dbPath);
    // Also remove WAL and SHM files if they exist
    try { if (dbPath) fs.unlinkSync(dbPath + "-wal"); } catch { /* ignore */ }
    try { if (dbPath) fs.unlinkSync(dbPath + "-shm"); } catch { /* ignore */ }
  } catch { /* file may already be cleaned up */ }
}
