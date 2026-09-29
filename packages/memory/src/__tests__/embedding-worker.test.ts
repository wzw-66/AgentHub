import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory } from "../repository.js";
import { createBlobVectorIndex } from "../vector-index.js";
import {
  startEmbeddingWorker,
  listPendingEmbeddings,
  pendingEmbeddingCount,
} from "../worker.js";
import { FakeEmbeddingProvider } from "./fakes.js";
import { FakeSegmenter } from "./fakes.js";
import type { EmbeddingMode } from "../types.js";
import type { EmbeddingProvider } from "../embedding.js";

const seg = new FakeSegmenter(["缩进", "用户"]);

let db: DatabaseType;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  destroyTestDb(db);
});

function seed(id: string) {
  return createMemory({
    userId: "u1",
    conversationId: "c1",
    agentId: "a1",
    type: "fact",
    content: `content ${id}`,
  }, db, seg);
}

/**
 * 「一条坏向量毒死整批」的 provider —— 复刻 `bge-m3` + Ollama 的真实缺陷
 * （issue #14657：对某些技术文档返回 NaN，`assertFiniteVector` 因此抛错）。
 *
 * 接口 `embedDocuments(texts): Promise<Float32Array[]>` **没有逐条失败通道**
 * （spec §8.1 固定了签名），所以只要批里有一条要炸，整个 promise 就 reject ——
 * 实现方唯一能做的补偿就是**回退到逐条嵌入**。这个假实现刻意保留这个性质：
 * 批里含毒文本 → 整批 reject；只喂健康文本 → 成功。
 */
class PoisonedBatchProvider implements EmbeddingProvider {
  readonly id = "poisoned-batch";
  readonly model: string;
  readonly dim: number;
  readonly mode: EmbeddingMode;
  readonly fingerprint: string;

  /** 每批调用次数，用来断言回退的调用成本有上界。 */
  batchCalls = 0;

  private readonly inner: FakeEmbeddingProvider;

  constructor(
    dim: number,
    private readonly poisonMarker: string,
  ) {
    this.inner = new FakeEmbeddingProvider({ dim });
    this.dim = this.inner.dim;
    this.model = this.inner.model;
    this.mode = this.inner.mode;
    this.fingerprint = this.inner.fingerprint;
  }

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    this.batchCalls++;
    const poisoned = texts.findIndex((t) => t.includes(this.poisonMarker));
    if (poisoned >= 0) {
      throw new Error(
        `Embedding contains a non-finite value at doc[${poisoned}][0] (= NaN).`,
      );
    }
    return this.inner.embedDocuments(texts);
  }

  async embedQuery(text: string): Promise<Float32Array> {
    return this.inner.embedQuery(text);
  }

  async healthCheck(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}

/**
 * 会卡住的 provider：调用后停在闸门上，直到 `open()`。
 *
 * 用来观察「上一轮还没跑完时不会再开一轮」（spec §8.6 的 maxConcurrentBatches 默认 1）
 * —— 一轮耗时超过 intervalMs 时，重叠的轮次会重复嵌入同一批行。
 */
class GatedProvider extends FakeEmbeddingProvider {
  batchCalls = 0;
  private release!: () => void;
  private readonly gate = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  override async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    this.batchCalls++;
    await this.gate;
    return super.embedDocuments(texts);
  }

  open(): void {
    this.release();
  }
}

/** 可开关的「端点整体不可用」provider，用于区分「暂时性故障」与「单条坏数据」。 */
class OutageProvider implements EmbeddingProvider {
  readonly id = "outage";
  readonly model: string;
  readonly dim: number;
  readonly mode: EmbeddingMode;
  readonly fingerprint: string;

  down = true;

  private readonly inner: FakeEmbeddingProvider;

  constructor(dim: number) {
    this.inner = new FakeEmbeddingProvider({ dim });
    this.dim = this.inner.dim;
    this.model = this.inner.model;
    this.mode = this.inner.mode;
    this.fingerprint = this.inner.fingerprint;
  }

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    if (this.down) throw new Error("Embedding endpoint unreachable");
    return this.inner.embedDocuments(texts);
  }

  async embedQuery(text: string): Promise<Float32Array> {
    if (this.down) throw new Error("Embedding endpoint unreachable");
    return this.inner.embedQuery(text);
  }

  async healthCheck(): Promise<{ ok: boolean }> {
    return { ok: !this.down };
  }
}

describe("pending embeddings queue", () => {
  it("lists a memory with no embedding row as pending", () => {
    const mem = seed("m1");
    expect(pendingEmbeddingCount(db, "fp-a")).toBe(1);
    expect(listPendingEmbeddings(db, "fp-a")[0]!.id).toBe(mem.id);
  });

  it("stops listing a memory once it has a row with the same fingerprint", () => {
    const mem = seed("m1");
    const index = createBlobVectorIndex(db);
    index.upsert(mem.id, new Float32Array([1, 0, 0]), "fp-a", "model-a");

    expect(pendingEmbeddingCount(db, "fp-a")).toBe(0);
  });

  it("re-enqueues everything when the fingerprint changes", () => {
    const mem = seed("m1");
    const index = createBlobVectorIndex(db);
    index.upsert(mem.id, new Float32Array([1, 0, 0]), "fp-a", "model-a");

    expect(pendingEmbeddingCount(db, "fp-b")).toBe(1);
  });

  it("re-enqueues when only the dimension differs", () => {
    const mem = seed("m1");
    const index = createBlobVectorIndex(db);
    index.upsert(mem.id, new Float32Array([1, 0, 0]), "model-a:3:symmetric", "model-a");

    expect(pendingEmbeddingCount(db, "model-a:4:symmetric")).toBe(1);
  });

  it("reports nothing as pending when the fingerprint is not specified", () => {
    const mem = seed("m1");
    createBlobVectorIndex(db).upsert(mem.id, new Float32Array([1, 0, 0]), "fp-a", "model-a");

    // 不给 fingerprint 时只有「完全没有向量行」才算待嵌入 —— 否则换了模型之后
    // 一个只想知道「还有多少条没算过向量」的调用方会永远看到一个非零积压。
    expect(pendingEmbeddingCount(db)).toBe(0);
  });

  it("carries the content the worker must embed", () => {
    const mem = seed("m1");
    const [row] = listPendingEmbeddings(db, "fp-a");
    expect(row!.id).toBe(mem.id);
    expect(row!.content).toBe("content m1");
  });
});

describe("startEmbeddingWorker", () => {
  it("embeds pending memories and writes their vectors", async () => {
    const mem = seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, batchSize: 8, intervalMs: 0 });
    const result = await worker.runOnce();

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(index.size()).toBe(1);
    expect(pendingEmbeddingCount(db, provider.fingerprint)).toBe(0);

    const hits = index.search(new Float32Array(4).fill(0.25), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    expect(hits[0]!.memoryId).toBe(mem.id);

    worker.stop();
  });

  it("writes the provider fingerprint so the queue can advance", async () => {
    const mem = seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, intervalMs: 0 });
    await worker.runOnce();

    const row = db
      .prepare("SELECT fingerprint, model, dim FROM memory_embeddings WHERE memory_id = ?")
      .get(mem.id) as { fingerprint: string; model: string; dim: number };
    expect(row.fingerprint).toBe(provider.fingerprint);
    expect(row.model).toBe(provider.model);
    expect(row.dim).toBe(4);

    worker.stop();
  });

  it("is idempotent — a second run processes nothing", async () => {
    seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, intervalMs: 0 });
    expect((await worker.runOnce()).processed).toBe(1);
    expect((await worker.runOnce()).processed).toBe(0);

    worker.stop();
  });

  it("re-embeds the whole store when the fingerprint changes", async () => {
    const mem = seed("m1");
    const index = createBlobVectorIndex(db);

    const first = new FakeEmbeddingProvider({ dim: 4, model: "model-a" });
    const w1 = startEmbeddingWorker({ provider: first, index, db, intervalMs: 0 });
    expect((await w1.runOnce()).processed).toBe(1);
    expect(w1.pendingCount()).toBe(0);
    w1.stop();

    // 换维度（同一模型名，如 Qwen3 的 MRL）→ 旧向量作废，整库重新入队。
    const second = new FakeEmbeddingProvider({ dim: 8, model: "model-a" });
    const w2 = startEmbeddingWorker({ provider: second, index, db, intervalMs: 0 });
    expect(w2.pendingCount()).toBe(1);
    expect((await w2.runOnce()).processed).toBe(1);

    const row = db
      .prepare("SELECT fingerprint, dim FROM memory_embeddings WHERE memory_id = ?")
      .get(mem.id) as { fingerprint: string; dim: number };
    expect(row.fingerprint).toBe(second.fingerprint);
    expect(row.dim).toBe(8);
    // 主键是 memory_id，所以是覆盖而不是新增一行
    expect(index.size()).toBe(1);

    w2.stop();
  });

  it("respects batchSize", async () => {
    for (let i = 0; i < 5; i++) seed(`m${i}`);
    const provider = new FakeEmbeddingProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, batchSize: 2, intervalMs: 0 });
    expect((await worker.runOnce()).processed).toBe(2);
    expect(worker.pendingCount()).toBe(3);

    worker.stop();
  });

  it("does not advance the queue while the provider is down", async () => {
    seed("m1");
    const provider = new OutageProvider(4);
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, intervalMs: 0 });
    const result = await worker.runOnce();

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(index.size()).toBe(0);
    // 下一轮会重试
    expect(worker.pendingCount()).toBe(1);

    worker.stop();
  });

  it("recovers on the next run after a transient failure", async () => {
    seed("m1");
    const provider = new OutageProvider(4);
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, intervalMs: 0 });
    await worker.runOnce();

    provider.down = false;
    const second = await worker.runOnce();

    expect(second.processed).toBe(1);
    expect(second.failed).toBe(0);
    expect(index.size()).toBe(1);

    worker.stop();
  });

  it("skips a batch whose vectors are the wrong dimension without writing anything", async () => {
    seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4, actualDim: 8 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, intervalMs: 0 });
    const result = await worker.runOnce();

    expect(result.failed).toBe(1);
    expect(index.size()).toBe(0);

    worker.stop();
  });

  it("skips NaN vectors without poisoning the index", async () => {
    seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4, injectNaN: true });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, intervalMs: 0 });
    const result = await worker.runOnce();

    expect(result.failed).toBe(1);
    expect(index.size()).toBe(0);

    worker.stop();
  });

  it("drops one poisoned item without losing the rest of its batch", async () => {
    const good1 = seed("good-1");
    const poisoned = seed("poisoned");
    const good2 = seed("good-2");

    // 毒文本只出现在一条记忆里：整批调用必然 reject（接口没有逐条失败通道）。
    const provider = new PoisonedBatchProvider(4, "poisoned");
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, batchSize: 8, intervalMs: 0 });
    const result = await worker.runOnce();

    // 关键断言：健康的两条**确实写进了索引**，而不只是失败计数看着对。
    // 去掉逐条回退后这里是 0，测试会红。
    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
    expect(index.size()).toBe(2);

    const hits = index.search(new Float32Array(4).fill(0.25), 10, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    expect(hits.map((h) => h.memoryId).sort()).toEqual([good1.id, good2.id].sort());

    // 坏的那条不写库、留在队列里等下一轮（永远重试，不静默丢数据）
    expect(pendingEmbeddingCount(db, provider.fingerprint)).toBe(1);
    expect(listPendingEmbeddings(db, provider.fingerprint)[0]!.id).toBe(poisoned.id);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM memory_embeddings WHERE memory_id = ?")
        .get(poisoned.id),
    ).toEqual({ count: 0 });

    worker.stop();
  });

  it("bounds the per-item fallback to one extra call per item", async () => {
    for (let i = 0; i < 4; i++) seed(`m${i}`);
    const provider = new PoisonedBatchProvider(4, "m1");
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, batchSize: 8, intervalMs: 0 });
    const result = await worker.runOnce();

    expect(result.processed).toBe(3);
    expect(result.failed).toBe(1);
    // 1 次整批 + 4 次逐条 = 5，不是「每条都重取整批」的 4+16 次。
    expect(provider.batchCalls).toBe(5);

    worker.stop();
  });

  it("keeps the loop alive after a failing batch", async () => {
    seed("m1");
    const provider = new OutageProvider(4);
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, intervalMs: 0 });
    // 连续失败不抛异常、不改变状态
    await expect(worker.runOnce()).resolves.toEqual({ processed: 0, failed: 1 });
    await expect(worker.runOnce()).resolves.toEqual({ processed: 0, failed: 1 });

    provider.down = false;
    expect((await worker.runOnce()).processed).toBe(1);

    worker.stop();
  });

  it("runs on the interval until stop() is called", async () => {
    seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, intervalMs: 5 });
    await new Promise((r) => setTimeout(r, 50));

    expect(index.size()).toBe(1);
    expect(worker.pendingCount()).toBe(0);

    worker.stop();
  });

  it("does not start a second round while one is still in flight", async () => {
    seed("m1");
    const provider = new GatedProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, intervalMs: 5 });
    await new Promise((r) => setTimeout(r, 40)); // 足够跑好几个 tick

    // 第一轮卡在闸门上，队列因此还没推进 —— 若允许重叠，这里会是好几个 batch call
    expect(provider.batchCalls).toBe(1);
    expect(worker.pendingCount()).toBe(1);

    provider.open();
    await new Promise((r) => setTimeout(r, 20));

    expect(index.size()).toBe(1);
    expect(worker.pendingCount()).toBe(0);

    worker.stop();
  });

  it("stops processing further batches after stop() is called", async () => {
    seed("m1");
    const provider = new FakeEmbeddingProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, intervalMs: 5 });
    worker.stop();
    await new Promise((r) => setTimeout(r, 30));

    expect(index.size()).toBe(0);
  });

  it("stop() is idempotent and safe to call twice", () => {
    const provider = new FakeEmbeddingProvider({ dim: 4 });
    const index = createBlobVectorIndex(db);

    const worker = startEmbeddingWorker({ provider, index, db, intervalMs: 5 });
    worker.stop();
    expect(() => worker.stop()).not.toThrow();
  });
});
