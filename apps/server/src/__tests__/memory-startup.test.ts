import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Segmenter } from "@agenthub/memory";
import { closeDatabase, setDbPath, isBm25Ready, getDatabase } from "@agenthub/memory";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { initializeMemory } from "../services/memory-startup.js";
import type { MemoryStartupLog } from "../services/memory-startup.js";

let dbPath: string;

beforeEach(() => {
  dbPath = path.join(
    os.tmpdir(),
    `agenthub-memory-startup-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  closeDatabase();
  setDbPath(dbPath);
});

afterEach(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      /* ignore */
    }
  }
});

interface CapturedLog {
  log: MemoryStartupLog;
  info: string[];
  errors: Array<{ message: string; detail: unknown }>;
}

/** 收集日志而不打印，用于断言「失败真的留下了 ERROR」。 */
function captureLog(): CapturedLog {
  const info: string[] = [];
  const errors: Array<{ message: string; detail: unknown }> = [];
  return {
    info,
    errors,
    log: {
      info: (message) => info.push(message),
      error: (message, detail) => errors.push({ message, detail }),
    },
  };
}

const passthrough: Segmenter = { id: "passthrough", cut: (text) => [text] };

/** 在 `reindexMemories` 内部真的抛错的分词器 —— 真实失败，不是打桩。 */
const exploding: Segmenter = {
  id: "exploding",
  cut: () => {
    throw new Error("segmentation exploded");
  },
};

/** 建库（schema 由 initializeMemory 里的迁移负责）。 */
async function ensureSchema(): Promise<void> {
  await initializeMemory(passthrough, captureLog().log);
}

/** 一行「改造前」风格的旧数据：content_seg 为空，所以必然进入回填待办。 */
function seedPendingRow(id: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO memory_records (id, user_id, agent_id, type, content, tags, conversation_id, importance)
       VALUES (?, 'u1', 'a1', 'fact', '用户偏好缩进', '[]', 'c1', 1)`,
    )
    .run(id);
}

describe("initializeMemory", () => {
  it("migrates, reindexes and reports readiness on the happy path", async () => {
    const { log, info, errors } = captureLog();

    await initializeMemory(passthrough, log);

    expect(errors).toEqual([]);
    expect(info).toEqual(["[memory] reindexed 0 memories; BM25 ready"]);
    expect(isBm25Ready()).toBe(true);
  });

  it("backfills pre-existing rows and reports how many", async () => {
    await ensureSchema();
    seedPendingRow("legacy-1");

    const { log, info, errors } = captureLog();
    await initializeMemory(passthrough, log);

    expect(errors).toEqual([]);
    expect(info).toEqual(["[memory] reindexed 1 memories; BM25 ready"]);
  });

  it("logs at ERROR and leaves isBm25Ready() false when the rebuild fails", async () => {
    await ensureSchema();
    const { log, errors } = captureLog();
    // 先成功一次把标志顶到 true —— 这样下面的 false 证明的是「被降级」，
    // 而不是一个从未被设置过的初值
    seedPendingRow("legacy-1");
    await initializeMemory(passthrough, log);
    expect(isBm25Ready()).toBe(true);

    // 再来一行待回填的行，分词器才会在事务里真的抛
    seedPendingRow("legacy-2");
    await initializeMemory(exploding, log);

    expect(isBm25Ready()).toBe(false);
    expect(errors.length).toBe(1);
    const { message, detail } = errors[0]!;
    // 运维读到的必须是真实状态：失败、没有后台重试、只能靠重启恢复
    expect(message).toContain("DISABLED for this process run");
    expect(message).toContain("NOT being retried in the background");
    expect(message).not.toContain("until it completes");
    expect(detail).toBeInstanceOf(Error);
  });

  it("does not fail the process — a broken rebuild still resolves", async () => {
    await ensureSchema();
    seedPendingRow("legacy-1");
    const { log, info } = captureLog();

    await expect(initializeMemory(exploding, log)).resolves.toBeUndefined();

    expect(info).toEqual([]);
    expect(isBm25Ready()).toBe(false);
  });
});
