import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory, setDefaultSegmenter } from "../repository.js";
import { configureSearch, resetSearchDepsForTesting, searchMemories } from "../search.js";
import { createBlobVectorIndex } from "../vector-index.js";
import { FakeEmbeddingProvider, FakeSegmenter } from "./fakes.js";
import { setBm25ReadyForTesting } from "../worker.js";

let db: DatabaseType;

/**
 * 写入侧与查询侧必须共用**同一个**分词器（spec §8.3）：索引里的词项是写入侧切的，
 * 查询词项是查询侧切的，两端不一致时该行会被静默漏掉。
 */
const seg = new FakeSegmenter(["缩进", "用户", "偏好", "连接池", "格式化", "脚本"]);

beforeAll(() => {
  db = createTestDb();
  // createTestDb 只跑 DDL 迁移，不跑启动期的回填（生产里那一步是
  // initializeMemory → reindexMemories）。索引就绪必须**显式**声明 ——
  // 标志默认 false 会让 BM25 路整条跳过，那是 Task 13 刻意的设计。
  setBm25ReadyForTesting(true);
  setDefaultSegmenter(seg);
  configureSearch({ segmenter: seg });

  createMemory({
    userId: "user-search",
    conversationId: "conv-search",
    agentId: "agent-search",
    type: "fact",
    content: "The API endpoint is at https://api.example.com/v1",
    tags: ["api", "endpoint"],
  }, db);
  createMemory({
    userId: "user-search",
    conversationId: "conv-search",
    agentId: "agent-search",
    type: "preference",
    content: "User prefers camelCase naming convention",
    tags: ["naming", "style"],
  }, db);
  createMemory({
    userId: "user-search",
    conversationId: "conv-search",
    agentId: "agent-other",
    type: "decision",
    content: "Decided to use Prisma ORM for database access",
    tags: ["architecture", "database"],
  }, db);
  createMemory({
    userId: "user-search",
    conversationId: "conv-search",
    agentId: "agent-search",
    type: "context",
    content: "Project root is /home/user/projects/agenthub",
    tags: ["project", "path"],
  }, db);
});

afterAll(() => {
  resetSearchDepsForTesting();
  destroyTestDb(db);
});

const SCOPE = { conversationId: "conv-search" } as const;

describe("searchMemories", () => {
  it("finds memories matching the FTS query", async () => {
    const results = await searchMemories({ query: "API", userId: "user-search", scope: SCOPE, limit: 10 }, db);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.content.includes("api.example.com"))).toBe(true);
  });

  it("filters by agentId when provided", async () => {
    const results = await searchMemories(
      { query: "endpoint", userId: "user-search", scope: SCOPE, agentId: "agent-search" },
      db,
    );
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("API endpoint");
  });

  it("returns empty array when no match", async () => {
    const results = await searchMemories({ query: "zzzznonexistent", userId: "user-search", scope: SCOPE, limit: 10 }, db);
    expect(results.length).toBe(0);
  });

  it("respects limit", async () => {
    const results = await searchMemories({ query: "the", userId: "user-search", scope: SCOPE, limit: 1 }, db);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("returns memories from all conversations when scope is allConversations", async () => {
    createMemory({
      userId: "user-search",
      conversationId: "conv-other",
      agentId: "agent-search",
      type: "fact",
      content: "Zebra crossing fact only in another conversation",
    }, db);

    const scoped = await searchMemories({ query: "Zebra", userId: "user-search", scope: SCOPE }, db);
    expect(scoped.length).toBe(0);

    const global = await searchMemories(
      { query: "Zebra", userId: "user-search", scope: { allConversations: true } },
      db,
    );
    expect(global.length).toBe(1);
  });

  it("excludes memories from another conversation with a contradictory value", async () => {
    createMemory({
      userId: "user-search",
      conversationId: "conv-project-b",
      agentId: "agent-search",
      type: "preference",
      content: "Indentation should use two spaces",
    }, db);
    createMemory({
      userId: "user-search",
      conversationId: "conv-project-a",
      agentId: "agent-search",
      type: "preference",
      content: "Indentation should use a tab character",
    }, db);

    const a = await searchMemories(
      { query: "Indentation", userId: "user-search", scope: { conversationId: "conv-project-a" } },
      db,
    );
    expect(a.length).toBe(1);
    expect(a[0]!.content).toContain("tab");

    const b = await searchMemories(
      { query: "Indentation", userId: "user-search", scope: { conversationId: "conv-project-b" } },
      db,
    );
    expect(b.length).toBe(1);
    expect(b[0]!.content).toContain("two spaces");
  });

  it("excludes memories whose user_id does not match, even in the same conversation", async () => {
    createMemory({
      userId: "user-other",
      conversationId: "conv-shared",
      agentId: "agent-search",
      type: "fact",
      content: "Ostrich secret belonging to another user",
    }, db);
    createMemory({
      userId: "user-search",
      conversationId: "conv-shared",
      agentId: "agent-search",
      type: "fact",
      content: "Ostrich fact belonging to the current user",
    }, db);

    const results = await searchMemories(
      { query: "Ostrich", userId: "user-search", scope: { conversationId: "conv-shared" } },
      db,
    );
    expect(results.length).toBe(1);
    expect(results[0]!.userId).toBe("user-search");
  });
});

describe("hybrid retrieval", () => {
  let vectorIndex: ReturnType<typeof createBlobVectorIndex>;
  let provider: FakeEmbeddingProvider;

  beforeAll(() => {
    vectorIndex = createBlobVectorIndex(db);
    provider = new FakeEmbeddingProvider({ dim: 8 });
    configureSearch({
      segmenter: seg,
      vectorIndex,
      embeddingProvider: provider,
      minSimilarity: 0,
    });
  });

  it("finds a memory through the vector leg when BM25 has no term overlap", async () => {
    const mem = createMemory({
      userId: "user-hybrid",
      conversationId: "conv-hybrid",
      agentId: "agent-hybrid",
      type: "preference",
      content: "Zebra",
    }, db, seg);

    // 用与记忆内容完全相同的文本生成查询向量，保证向量路必然命中
    const vec = await provider.embedQuery("Zebra");
    vectorIndex.upsert(mem.id, vec, provider.fingerprint, provider.model);

    const results = await searchMemories(
      { query: "Unrelated Query Text", userId: "user-hybrid", scope: { conversationId: "conv-hybrid" } },
      db,
    );

    expect(results.map((r) => r.id)).toContain(mem.id);
  });

  it("fuses both legs so a memory found by both outranks one found by a single leg", async () => {
    const both = createMemory({
      userId: "user-hybrid",
      conversationId: "conv-fuse",
      agentId: "agent-hybrid",
      type: "fact",
      content: "缩进 found by both legs",
    }, db, seg);
    const bm25Only = createMemory({
      userId: "user-hybrid",
      conversationId: "conv-fuse",
      agentId: "agent-hybrid",
      type: "fact",
      content: "缩进 found by bm25 only",
    }, db, seg);

    const bothVec = await provider.embedQuery("缩进 found by both legs");
    vectorIndex.upsert(both.id, bothVec, provider.fingerprint, provider.model);

    const results = await searchMemories(
      { query: "缩进", userId: "user-hybrid", scope: { conversationId: "conv-fuse" } },
      db,
    );

    const ids = results.map((r) => r.id);
    expect(ids).toContain(both.id);
    expect(ids).toContain(bm25Only.id);
    expect(ids.indexOf(both.id)).toBeLessThan(ids.indexOf(bm25Only.id));
  });

  it("drops vector results below minSimilarity so unrelated memories are not injected", async () => {
    configureSearch({
      segmenter: seg,
      vectorIndex,
      embeddingProvider: provider,
      minSimilarity: 0.999,
    });

    const mem = createMemory({
      userId: "user-threshold",
      conversationId: "conv-threshold",
      agentId: "agent-threshold",
      type: "fact",
      content: "Ocelot",
    }, db, seg);
    const vec = await provider.embedQuery("Ocelot");
    vectorIndex.upsert(mem.id, vec, provider.fingerprint, provider.model);

    // 与 "Ocelot" 无关的查询 + 高阈值 → 向量路即便找到它也必须丢弃
    const results = await searchMemories(
      { query: "Quokka", userId: "user-threshold", scope: { conversationId: "conv-threshold" } },
      db,
    );

    expect(results.map((r) => r.id)).not.toContain(mem.id);

    configureSearch({ segmenter: seg, vectorIndex, embeddingProvider: provider, minSimilarity: 0 });
  });

  it("returns BM25 results when the vector leg throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = new FakeEmbeddingProvider({ dim: 8, failuresRemaining: 1 });
    configureSearch({ segmenter: seg, vectorIndex, embeddingProvider: failing, minSimilarity: 0 });

    const mem = createMemory({
      userId: "user-degrade",
      conversationId: "conv-degrade",
      agentId: "agent-degrade",
      type: "fact",
      content: "缩进 should still be found",
    }, db, seg);

    const results = await searchMemories(
      { query: "缩进", userId: "user-degrade", scope: { conversationId: "conv-degrade" } },
      db,
    );

    expect(results.map((r) => r.id)).toContain(mem.id);
    // 降级必须留痕：向量路挂了要以 ERROR 现身，而不是让 BM25 的结果看起来
    // 像是「全部的相关记忆」
    expect(errorSpy.mock.calls.some(([message]) => String(message).includes("Vector leg"))).toBe(true);

    configureSearch({ segmenter: seg, vectorIndex, embeddingProvider: provider, minSimilarity: 0 });
    errorSpy.mockRestore();
  });

  it("never returns memories outside the requested conversation even via the vector leg", async () => {
    configureSearch({ segmenter: seg, vectorIndex, embeddingProvider: provider, minSimilarity: 0 });

    const inside = createMemory({
      userId: "user-scope-hybrid",
      conversationId: "conv-inside",
      agentId: "agent-scope-hybrid",
      type: "fact",
      content: "Quokka inside",
    }, db, seg);
    const outside = createMemory({
      userId: "user-scope-hybrid",
      conversationId: "conv-outside",
      agentId: "agent-scope-hybrid",
      type: "fact",
      content: "Quokka outside",
    }, db, seg);

    // 两条都被嵌入，且向量完全相同 —— 唯一能区分它们的就是作用域
    const vec = await provider.embedQuery("Quokka");
    vectorIndex.upsert(inside.id, vec, provider.fingerprint, provider.model);
    vectorIndex.upsert(outside.id, vec, provider.fingerprint, provider.model);

    const results = await searchMemories(
      { query: "Quokka", userId: "user-scope-hybrid", scope: { conversationId: "conv-inside" } },
      db,
    );

    const ids = results.map((r) => r.id);
    expect(ids).toContain(inside.id);
    expect(ids).not.toContain(outside.id);
  });

  it("returns an empty array when both legs are empty", async () => {
    configureSearch({ segmenter: seg, vectorIndex, embeddingProvider: provider, minSimilarity: 0 });
    const results = await searchMemories(
      { query: "zzzznothingmatchesthis", userId: "user-none", scope: { conversationId: "conv-none" } },
      db,
    );
    expect(results).toEqual([]);
  });

  it("skips the BM25 leg without returning an empty list when the index is not ready", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setBm25ReadyForTesting(false);
    configureSearch({ segmenter: seg, vectorIndex, embeddingProvider: provider, minSimilarity: 0 });

    const mem = createMemory({
      userId: "user-notready",
      conversationId: "conv-notready",
      agentId: "agent-notready",
      type: "fact",
      content: "Numbat via vector only",
    }, db, seg);
    const vec = await provider.embedQuery("Numbat via vector only");
    vectorIndex.upsert(mem.id, vec, provider.fingerprint, provider.model);

    const results = await searchMemories(
      { query: "Numbat via vector only", userId: "user-notready", scope: { conversationId: "conv-notready" } },
      db,
    );

    // BM25 路被跳过，但向量路仍然生效 —— 关键是「不可用」不等于「空榜单」
    expect(results.map((r) => r.id)).toContain(mem.id);
    // 「被跳过」必须留下痕迹：静默返回空榜单会让故障看起来像「没有匹配」（spec §7.7）
    expect(warnSpy.mock.calls.some(([message]) => String(message).includes("BM25"))).toBe(true);

    setBm25ReadyForTesting(true);
    warnSpy.mockRestore();
  });
});
