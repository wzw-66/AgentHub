import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Segmenter } from "@agenthub/memory";
import { closeDatabase, setDbPath, isBm25Ready, getDatabase } from "@agenthub/memory";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { checkEmbeddingHealth, initializeMemory } from "../services/memory-startup.js";
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
  warns: string[];
}

/** 收集日志而不打印，用于断言「失败真的留下了 WARN / ERROR」。 */
function captureLog(): CapturedLog {
  const info: string[] = [];
  const errors: Array<{ message: string; detail: unknown }> = [];
  const warns: string[] = [];
  return {
    info,
    errors,
    warns,
    log: {
      info: (message) => info.push(message),
      error: (message, detail) => errors.push({ message, detail }),
      warn: (message) => warns.push(message),
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

  it("cancels the reindex timeout so it cannot hold the event loop open", async () => {
    await ensureSchema();
    vi.useFakeTimers();
    try {
      const { log } = captureLog();
      await initializeMemory(passthrough, log);

      // 重建是同步的，竞速一定由它先落地。若 `finally` 里不清定时器，这里会剩下
      // 一个 30 秒的挂起定时器 —— server 里无害，但测试只因 vitest 强制退出才没暴露。
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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

describe("checkEmbeddingHealth", () => {
  it("warns with the detail and the consequence when the endpoint is broken", async () => {
    const { log, warns, info, errors } = captureLog();
    const broken = {
      healthCheck: async () => ({ ok: false, detail: "HTTP 404 from /embeddings — model not found" }),
    };

    await expect(checkEmbeddingHealth(broken, log)).resolves.toBe(false);

    expect(info).toEqual([]);
    expect(errors).toEqual([]);
    expect(warns.length).toBe(1);
    // 必须点到**具体原因**：只说「不健康」与不说没多大区别
    expect(warns[0]).toContain("model not found");
    // 后果必须写清：这条路下一律返回空榜单，检索退化成纯 BM25
    expect(warns[0]).toContain("BM25");
    expect(warns[0]).toContain("returns nothing");
    // 并且不能让人以为进程起不来（spec §10.3：向量路不阻止启动）
    expect(warns[0]).toContain("starts anyway");
  });

  it("is silent when the endpoint is healthy", async () => {
    const { log, warns, info, errors } = captureLog();

    await expect(
      checkEmbeddingHealth({ healthCheck: async () => ({ ok: true }) }, log),
    ).resolves.toBe(true);

    expect(warns).toEqual([]);
    expect(info).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("warns instead of silently skipping the check when healthCheck itself throws", async () => {
    const { log, warns } = captureLog();
    const explodingHealth = {
      healthCheck: async () => {
        throw new Error("socket hang up");
      },
    };

    await expect(checkEmbeddingHealth(explodingHealth, log)).resolves.toBe(false);

    // 抛错被当成「检查通过」= 又回到「什么都没验」，所以必须有 WARN
    expect(warns.length).toBe(1);
    expect(warns[0]).toContain("socket hang up");
    expect(warns[0]).toContain("BM25");
  });
});
