import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const DEFAULT_DIR = path.join(os.homedir(), ".agenthub");
const DEFAULT_PATH = path.join(DEFAULT_DIR, "memory.db");

let db: DatabaseType | null = null;
let configuredPath: string | undefined;

export function getDatabase(customPath?: string): DatabaseType {
  if (db) return db;

  const resolvedPath = customPath || configuredPath || DEFAULT_PATH;

  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return db;
}

export function setDbPath(customPath: string): void {
  configuredPath = customPath;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export type { DatabaseType as Database };
