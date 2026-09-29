import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createTestUser, getAuthHeader } from "./helpers.js";
import type { Agent, AgentContext, AgentAdapter, Chunk, HealthStatus } from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";
import {
  buildMemoryContext,
  closeDatabase,
  configureSearch,
  createMemory,
  getDatabase,
  initSchema,
  reindexMemories,
  resetSearchDepsForTesting,
  setDbPath,
} from "@agenthub/memory";
import type { Segmenter } from "@agenthub/memory";
import { SubTaskExecutor } from "../orchestrator/executor.js";
import type { SubTask } from "../orchestrator/types.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

/**
 * spec §13 里「最重要的五个测试」之五：**单 agent 路径确实注入了记忆**。
 *
 * 这条路径此前从不注入 —— 1:1 聊天里记忆只写不读（§4.2）。缺口之所以能长期存在，
 * 是因为没有任何测试观察过 `systemPrompt` 里有没有 `[Memory - ...]`。含
 * 「包含某条记忆」的断言必须写在**真的会跑到注入那一步**的链路上，所以这里不 mock
 * `buildMemoryContext`，而是让它真的检索一个临时记忆库。
 */

const TEST_DATABASE_URL = process.env["TEST_DATABASE_URL"] || "file:./test.db";

/**
 * 按空白切分的确定性分词器。
 *
 * 刻意不用 jieba：测试不得依赖词典，且「写入与查询共用同一个分词器」这一条
 * （spec §8.3）在这里由**同一个对象**保证，不需要靠两处默认值恰好一致。
 */
const seg: Segmenter = {
  id: "test-whitespace",
  cut: (text: string) => text.split(/\s+/).filter((t) => t.length > 0),
};

// ─── Fake adapter ────────────────────────────────────────────────────────────

/** 每次 `execute` 收到的 context —— 断言系统提示词就是从这里读的。 */
const adapterContexts: AgentContext[] = [];

function fakeAdapter(): AgentAdapter {
  return {
    async *execute(context: AgentContext): AsyncIterable<Chunk> {
      adapterContexts.push(context);
      yield { type: ChunkType.Text, content: "Noted.", timestamp: new Date().toISOString() };
      yield { type: ChunkType.Done, content: "", timestamp: new Date().toISOString() };
    },
    abort: () => {},
    healthCheck: async (): Promise<HealthStatus> => ({ ok: true }),
  };
}

// 只替换 `createAdapter`：`AgentHarness` 与各中间件在这个测试里必须是**真的**，
// 否则被验的就不再是生产那条链路。
vi.mock("@agenthub/agent-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agenthub/agent-core")>();
  return { ...actual, createAdapter: () => fakeAdapter() };
});

/** 只实现消息链路真正会碰到的几个方法。 */
function fakeConnectionManager(): FastifyInstance["connectionManager"] {
  return {
    pushToConversation: () => {},
    broadcastToConversation: () => {},
    getConnectedUserIds: () => [],
    registerAdapter: () => {},
    removeAdapter: () => {},
    createInteraction: async () => "",
  } as unknown as FastifyInstance["connectionManager"];
}

function makeSubTask(overrides: Partial<SubTask>): SubTask {
  return {
    id: "sub-1",
    parentMessageId: "msg-1",
    conversationId: "conv-1",
    userId: "user-1",
    agentId: "agent-1",
    agentName: "MemBot",
    instruction: "",
    dependsOn: [],
    context: [],
    status: "pending",
    retryCount: 0,
    ...overrides,
  };
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "MemBot",
    provider: "Claude",
    model: "claude-sonnet-4",
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Agent;
}

describe("memory injection into the agent system prompt", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let dbPath: string;
  let userId: string;
  let conversationId: string;
  let auth: { authorization: string };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
    await prisma.$connect();
    const user = await createTestUser(prisma, "test.mem.inject@example.com");
    userId = user.id;
    auth = getAuthHeader(userId);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: "test.mem.inject@example.com" } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    adapterContexts.length = 0;

    // ── 记忆库：临时文件，与业务库严格分开（两个 SQLite 文件不可合并） ──────
    dbPath = path.join(
      os.tmpdir(),
      `agenthub-mem-inject-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    closeDatabase();
    setDbPath(dbPath);
    initSchema();
    configureSearch({ segmenter: seg });
    // 走生产启动的同一条数据路径把 BM25 顶到就绪；未就绪时检索会整条跳过并返回 []，
    // 断言会以「注入坏了」的样子红，而其实只是索引没开。
    reindexMemories(seg, getDatabase());

    // ── 业务库：一个 single 会话 + 一个 Agent contact ──────────────────────
    const contact = await prisma.contact.create({
      data: { userId, name: "MemBot", provider: "Claude", systemPrompt: "You are MemBot." },
    });
    const conversation = await prisma.conversation.create({
      data: { title: "Injection Conv", type: "single", ownerId: userId, contactIds: [contact.id] },
    });
    conversationId = conversation.id;

    app = await buildApp(fakeConnectionManager());
    await app.ready();
  });

  afterEach(async () => {
    // 记忆抽取是 fire-and-forget，会往临时记忆库写东西 —— 先关掉它再删库。
    await app.close();
    await prisma.message.deleteMany({ where: { conversationId } });
    await prisma.conversation.deleteMany({ where: { ownerId: userId } });
    await prisma.contact.deleteMany({ where: { userId } });
    closeDatabase();
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
    }
    resetSearchDepsForTesting();
    vi.unstubAllGlobals();
  });

  function seed(content: string, conversation = conversationId, memoryUserId = userId): void {
    createMemory(
      {
        userId: memoryUserId,
        conversationId: conversation,
        agentId: "agent-1",
        type: "preference",
        content,
      },
      getDatabase(),
      seg,
    );
  }

  it("injects long-term memories into the single-agent system prompt", async () => {
    seed("User prefers tab indentation in this project");
    // 抽取会打 LLM —— stub 掉，测试绝不发网络请求。
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));

    const res = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/messages/create`,
      headers: auth,
      payload: { content: "indentation" },
    });
    expect(res.statusCode).toBe(201);

    await vi.waitFor(() => expect(adapterContexts.length).toBeGreaterThan(0));

    const { systemPrompt } = adapterContexts[0]!;
    expect(systemPrompt).toBeDefined();
    expect(systemPrompt).toContain("[Memory - preference]");
    expect(systemPrompt).toContain("User prefers tab indentation in this project");
  });

  it("injects exactly the block the shared helper produces for the same inputs", async () => {
    // 「路径一致」：两条链路（orchestrator / 单 agent）都必须拿到**逐字相同**的
    // 记忆块 —— 之前正是两条链路各写一份拼接逻辑，单 agent 那份漏掉了注入。
    seed("User prefers tab indentation in this project");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));

    const expected = await buildMemoryContext({
      userId,
      conversationId,
      query: "indentation",
      customDb: getDatabase(),
    });
    expect(expected).toBeDefined();

    const res = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/messages/create`,
      headers: auth,
      payload: { content: "indentation" },
    });
    expect(res.statusCode).toBe(201);

    await vi.waitFor(() => expect(adapterContexts.length).toBeGreaterThan(0));
    expect(adapterContexts[0]!.systemPrompt).toContain(expected!);
  });

  it("does not inject an empty block when there is nothing relevant", async () => {
    seed("User prefers tab indentation in this project");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));

    const res = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/messages/create`,
      headers: auth,
      payload: { content: "completely unrelated wording" },
    });
    expect(res.statusCode).toBe(201);

    await vi.waitFor(() => expect(adapterContexts.length).toBeGreaterThan(0));
    const { systemPrompt } = adapterContexts[0]!;
    // agent.systemPrompt 仍然在，但没有任何 memory 段落 —— 不能拼出一个空块。
    expect(systemPrompt).toContain("You are MemBot.");
    expect(systemPrompt).not.toContain("[Memory -");
  });

  describe("orchestrator path", () => {
    it("injects the same shared-helper block", async () => {
      seed("User prefers tab indentation in this project");
      const query = "indentation";

      const expected = await buildMemoryContext({
        userId,
        conversationId,
        query,
        customDb: getDatabase(),
      });
      expect(expected).toBeDefined();

      const executor = new SubTaskExecutor();
      await executor.execute(
        makeSubTask({ userId, conversationId, instruction: query }),
        makeAgent(),
        () => {},
      );

      await vi.waitFor(() => expect(adapterContexts.length).toBeGreaterThan(0));
      expect(adapterContexts[0]!.systemPrompt).toContain(expected!);
    });

    it("injects only once per executor so later sub-tasks keep a fixed prefix", async () => {
      seed("User prefers tab indentation in this project");

      const executor = new SubTaskExecutor();
      const agent = makeAgent();
      await executor.execute(
        makeSubTask({ id: "sub-1", userId, conversationId, instruction: "indentation" }),
        agent,
        () => {},
      );
      await executor.execute(
        makeSubTask({ id: "sub-2", userId, conversationId, instruction: "indentation" }),
        agent,
        () => {},
      );

      await vi.waitFor(() => expect(adapterContexts.length).toBe(2));
      expect(adapterContexts[0]!.systemPrompt).toContain("[Memory -");
      // 第二次没有记忆段落（这里也没有 pinned 消息，所以整段 systemPrompt 其实是空的 ——
      // 用 `?? ""` 是为了只在「记忆被重复注入」时失败，不绑定别的系统段落的有无）。
      expect(adapterContexts[1]!.systemPrompt ?? "").not.toContain("[Memory -");
    });
  });
});
