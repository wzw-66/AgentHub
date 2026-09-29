import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createTestApp, createTestUser, getAuthHeader } from "./helpers";
import type { FastifyInstance } from "fastify";
import {
  createMemory,
  createBlobVectorIndex,
  closeDatabase,
  setDbPath,
  getDatabase,
  reindexMemories,
  createJiebaSegmenter,
} from "@agenthub/memory";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const TEST_DATABASE_URL = process.env["TEST_DATABASE_URL"] || "file:./test.db";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * 读 `/api/memory/list` 的 `globalPendingCount`。
 *
 * 字段名里的 `global` 是承重的：它与同响应里的 `orphanCount` 作用域不同
 * （那个按请求者过滤，这个按整个记忆库），名字必须自己说清楚。
 *
 * 刻意只读**路由响应**、不调 `pendingEmbeddingCount` 做对照 —— 拿被测实现去
 * 校验被测实现，两处一起错的时候测试照样绿。
 */
async function listGlobalPendingCount(
  app: FastifyInstance,
  auth: { authorization: string },
): Promise<number> {
  const res = await app.inject({ method: "GET", url: "/api/memory/list", headers: auth });
  expect(res.statusCode).toBe(200);
  return (res.json() as { globalPendingCount: number }).globalPendingCount;
}

const EMBEDDING_KEYS = [
  "EMBEDDING_BASE_URL",
  "EMBEDDING_API_KEY",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIM",
  "EMBEDDING_MODE",
  "EMBEDDING_DIMENSIONS",
] as const;

/** 进程环境是全局的：用例必须自己保证「未配置」这个前提，而不是假设 .env 干净。 */
function saveAndClearEmbedding(): Record<string, string | undefined> {
  const savedEmbedding: Record<string, string | undefined> = {};
  for (const key of EMBEDDING_KEYS) {
    savedEmbedding[key] = process.env[key];
    delete process.env[key];
  }
  return savedEmbedding;
}

function restoreEmbedding(savedEmbedding: Record<string, string | undefined>): void {
  for (const key of EMBEDDING_KEYS) {
    if (savedEmbedding[key] === undefined) delete process.env[key];
    else process.env[key] = savedEmbedding[key];
  }
}

describe("Memory API", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let auth: { authorization: string };
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `agenthub-memory-route-${Date.now()}.db`);
    closeDatabase();
    setDbPath(dbPath);

    prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
    await prisma.$connect();
    app = await createTestApp();
    await app.ready();

    // `app.ready()` 会注册 `routes/memory.ts`，它顺带跑 `initSchema()`。
    // 接着走生产启动的同一条数据路径把 BM25 索引顶到就绪：`isBm25Ready()` 为 false
    // 时检索会**跳过** BM25 路（spec §7.7），下面的搜索断言就会拿到空数组。
    reindexMemories(createJiebaSegmenter(), getDatabase());

    const user = await createTestUser(prisma, "test.mem.route@example.com");
    auth = getAuthHeader(user.id);
    (globalThis as { __memUserId?: string }).__memUserId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: "test.mem.route@example.com" } });
    await app.close();
    await prisma.$disconnect();
    closeDatabase();
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
    }
  });

  it("searches across all conversations from the UI endpoint", async () => {
    const userId = (globalThis as { __memUserId?: string }).__memUserId!;
    createMemory({
      userId,
      conversationId: "conv-ui-a",
      agentId: "agent-ui",
      type: "fact",
      content: "Pangolin fact stored in conversation A",
    }, getDatabase());
    createMemory({
      userId,
      conversationId: "conv-ui-b",
      agentId: "agent-ui",
      type: "fact",
      content: "Pangolin fact stored in conversation B",
    }, getDatabase());

    const res = await app.inject({
      method: "GET",
      url: "/api/memory/search?q=Pangolin",
      headers: auth,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ conversationId?: string }>;
    expect(body.length).toBe(2);
    expect(new Set(body.map((m) => m.conversationId))).toEqual(
      new Set(["conv-ui-a", "conv-ui-b"]),
    );
  });

  it("reports orphanCount for memories with no conversation id", async () => {
    const userId = (globalThis as { __memUserId?: string }).__memUserId!;
    const db = getDatabase();

    // 基线：此时该用户只有上一用例写入的两条「有会话」记忆，无主计数必须是 0
    // 而不是 undefined —— `COUNT(*)` 无 GROUP BY 恒返回一行。
    const before = await app.inject({ method: "GET", url: "/api/memory/list", headers: auth });
    expect(before.statusCode).toBe(200);
    expect((before.json() as { orphanCount: number }).orphanCount).toBe(0);

    db.prepare(
      `INSERT INTO memory_records (id, user_id, agent_id, type, content, tags, conversation_id, importance, created_at, updated_at)
       VALUES ('orphan-1', ?, 'agent-ui', 'fact', 'Orphaned memory with no conversation', '[]', NULL, 1, datetime('now'), datetime('now'))`,
    ).run(userId);
    // 另一个用户的无主记忆 —— 计数必须按请求者过滤，不能被它抬高。
    db.prepare(
      `INSERT INTO memory_records (id, user_id, agent_id, type, content, tags, conversation_id, importance, created_at, updated_at)
       VALUES ('orphan-other-user', 'some-other-user', 'agent-ui', 'fact', 'Orphan owned by another user', '[]', NULL, 1, datetime('now'), datetime('now'))`,
    ).run();

    const res = await app.inject({ method: "GET", url: "/api/memory/list", headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { total: number; orphanCount: number };
    expect(body.orphanCount).toBe(1);
  });

  it("reports how many memories still wait for an embedding", async () => {
    const userId = (globalThis as { __memUserId?: string }).__memUserId!;
    const db = getDatabase();
    const savedEmbedding = saveAndClearEmbedding();
    try {
      const baseline = await listGlobalPendingCount(app, auth);

      const memory = createMemory(
        {
          userId,
          conversationId: "conv-pending",
          agentId: "agent-ui",
          type: "fact",
          content: "Waiting for its vector",
        },
        db,
      );

      // 真值会随队列走 —— 硬编码的 0 在这一步就会露馅。
      expect(await listGlobalPendingCount(app, auth)).toBe(baseline + 1);

      // 有了一条向量行，队列就前进。**必须等于基线而不是基线+1减去别的数**：
      // 计数按「没有匹配的向量行」判据，不按「有没有向量行」猜。
      createBlobVectorIndex(db).upsert(
        memory.id,
        new Float32Array([1, 0, 0, 0]),
        "any-fingerprint",
        "any-model",
      );
      expect(await listGlobalPendingCount(app, auth)).toBe(baseline);
    } finally {
      restoreEmbedding(savedEmbedding);
    }
  });

  it("counts pending against the configured model's fingerprint", async () => {
    const userId = (globalThis as { __memUserId?: string }).__memUserId!;
    const db = getDatabase();
    const index = createBlobVectorIndex(db);
    const savedEmbedding = saveAndClearEmbedding();
    // 已配好的向量路：模型 bge-m3、1024 维、symmetric ⇒ 指纹 "bge-m3:1024:symmetric"
    // （`buildFingerprint` 的格式；这里写死字面量而不是调它，否则路由用错公式也能通过）。
    process.env["EMBEDDING_BASE_URL"] = "http://127.0.0.1:11434/v1";
    process.env["EMBEDDING_API_KEY"] = "EMPTY";
    process.env["EMBEDDING_MODEL"] = "bge-m3";
    process.env["EMBEDDING_DIM"] = "1024";

    try {
      const memory = createMemory(
        {
          userId,
          conversationId: "conv-fingerprint",
          agentId: "agent-ui",
          type: "fact",
          content: "Embedded under one model, then another",
        },
        db,
      );
      const vec = new Float32Array([1, 0, 0, 0]);
      const baseline = await listGlobalPendingCount(app, auth);

      // 指纹匹配 → 队列前进
      index.upsert(memory.id, vec, "bge-m3:1024:symmetric", "bge-m3");
      expect(await listGlobalPendingCount(app, auth)).toBe(baseline - 1);

      // 同一模型名、不同维度/模式是**另一个向量空间**：旧向量不算数，该条重新入队。
      // 若路由只判「有没有向量行」，这一步会错误地保持 baseline - 1。
      index.upsert(memory.id, vec, "bge-m3:1024:asymmetric", "bge-m3");
      expect(await listGlobalPendingCount(app, auth)).toBe(baseline);
    } finally {
      restoreEmbedding(savedEmbedding);
    }
  });

  it("rejects a create without a conversation id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/memory/create",
      headers: auth,
      payload: {
        agentId: "agent-ui",
        type: "fact",
        content: "Memory that would silently become an orphan",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects a create with an empty conversation id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/memory/create",
      headers: auth,
      payload: {
        agentId: "agent-ui",
        type: "fact",
        content: "Memory that would silently become an orphan",
        conversationId: "",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("creates a memory when a conversation id is supplied", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/memory/create",
      headers: auth,
      payload: {
        agentId: "agent-ui",
        type: "fact",
        content: "Memory properly scoped to its conversation",
        conversationId: "conv-create-ok",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { conversationId?: string };
    expect(body.conversationId).toBe("conv-create-ok");
  });
});
