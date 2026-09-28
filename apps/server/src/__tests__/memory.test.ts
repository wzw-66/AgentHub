import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createTestApp, createTestUser, getAuthHeader } from "./helpers";
import type { FastifyInstance } from "fastify";
import { createMemory, closeDatabase, setDbPath, getDatabase } from "@agenthub/memory";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const TEST_DATABASE_URL = process.env["TEST_DATABASE_URL"] || "file:./test.db";

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
