import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { initSchema } from "../schema.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

let _db: DatabaseType | undefined;

export function createTestDb(): DatabaseType {
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
