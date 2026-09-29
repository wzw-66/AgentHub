import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb, TEST_VOCABULARY } from "./setup.js";
import { extractMemories } from "../extractor.js";
import { createMemory, getMemory, listMemories } from "../repository.js";
import { configureSearch, resetSearchDepsForTesting, searchMemories } from "../search.js";
import { setBm25ReadyForTesting } from "../worker.js";
import { FakeSegmenter } from "./fakes.js";

let db: DatabaseType;

/**
 * 与 `createTestDb` 写库时用的分词器**同一份词表** —— 写入侧与查询侧必须一致，
 * 否则索引里的词项与查询切出的词项对不上，命中会被静默丢掉（spec §8.3）。
 */
const seg = new FakeSegmenter(TEST_VOCABULARY);

const MOCK_PARAMS = {
  userId: "user-extract",
  conversationId: "conv-extract",
  agentId: "agent-extract",
  agentName: "TestBot",
  userMessage: "I prefer using tabs over spaces for indentation",
  agentResponse: "Got it! I'll use tabs when writing code for you.",
};

/**
 * 显式 LLM 配置 —— extractor 不再有 process.env 兜底（spec §4.9），
 * endpoint / model 必须由调用方（服务端 config.llm）显式传入。
 */
const LLM_CONFIG = {
  apiKey: "test-key",
  endpoint: "https://fake-api.test/v1/chat/completions",
  model: "test-model",
};

beforeAll(() => {
  db = createTestDb();
  // 索引就绪是显式的：createTestDb 只跑 DDL 迁移，不跑启动期的回填
  // （生产里那一步是 initializeMemory → reindexMemories）。
  setBm25ReadyForTesting(true);
  configureSearch({ segmenter: seg });
});

afterAll(() => {
  resetSearchDepsForTesting();
  destroyTestDb(db);
});

describe("extractMemories", () => {
  it("calls LLM and persists extracted memories", async () => {
    // Mock fetch to return a simulated LLM response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  action: "add",
                  type: "preference",
                  content: "User prefers tabs over spaces for indentation",
                  importance: 8,
                  reason: "User explicitly stated tab preference",
                },
              ]),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, LLM_CONFIG, db);

    // Verify the fetch was called
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify the memory was persisted
    const results = await searchMemories(
      {
        query: "tabs",
        userId: "user-extract",
        scope: { conversationId: "conv-extract" },
        agentId: "agent-extract",
      },
      db,
    );
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("tabs");
    expect(results[0]!.type).toBe("preference");

    vi.unstubAllGlobals();
  });

  it("handles deletion operations from LLM output", async () => {
    // First, create a memory we'll "delete"
    const created = createMemory({
      userId: "user-extract",
      conversationId: "conv-extract",
      agentId: "agent-extract",
      type: "fact",
      content: "Old fact to be removed",
    }, db);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  action: "delete",
                  id: created.id,
                  reason: "This fact is no longer relevant",
                },
              ]),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, LLM_CONFIG, db);

    // Verify the memory was deleted
    expect(getMemory(created.id, db)).toBeNull();

    vi.unstubAllGlobals();
  });

  it("handles update operation from LLM output as an in-place update", async () => {
    // First, create a memory to be updated
    const created = createMemory({
      userId: "user-extract",
      conversationId: "conv-extract",
      agentId: "agent-extract",
      type: "fact",
      content: "Old content to update",
      importance: 3,
    }, db);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{
              action: "update",
              id: created.id,
              type: "preference",
              content: "Updated content with new preference",
              importance: 7,
              reason: "User preference changed",
            }]),
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, LLM_CONFIG, db);

    // id 与 created_at 必须保留 —— 这正是旧实现（delete + create）破坏的
    const updated = getMemory(created.id, db);
    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(created.id);
    expect(updated!.createdAt).toBe(created.createdAt);
    expect(updated!.content).toBe("Updated content with new preference");
    expect(updated!.type).toBe("preference");
    expect(updated!.importance).toBe(7);
    // 排除作用域列被就地更新顺手覆盖 —— 丢了它这条记忆就再也召不回（spec §7.1）
    expect(updated!.conversationId).toBe("conv-extract");

    // 更新必须也能被**检索**到：`mem_fts_au` 触发器读的是 `new.content_seg`，
    // 若 updateMemory 只写 content 而漏掉 content_seg，索引里留下的仍是旧词
    // （"Old content to update"）—— 只查 getMemory 看不出这种陈旧。
    //
    // 查询词必须**只出现在新内容里**：`buildFtsQuery` 是 OR 语义，用
    // "Updated content" 会被旧内容里的 "content" 命中而永远通过。
    const found = await searchMemories(
      {
        query: "preference",
        userId: "user-extract",
        scope: { conversationId: "conv-extract" },
        agentId: "agent-extract",
      },
      db,
    );
    expect(found.map((m) => m.id)).toContain(created.id);

    vi.unstubAllGlobals();
  });

  it("preserves the stored importance when the LLM update omits it", async () => {
    const created = createMemory({
      userId: "user-extract",
      conversationId: "conv-extract",
      agentId: "agent-extract",
      type: "fact",
      content: "Memory whose importance was considered",
      importance: 6,
    }, db);

    // LLM 只改措辞，没有重申 importance —— 这是最常见的一种 update
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{
              action: "update",
              id: created.id,
              type: "fact",
              content: "Reworded, importance not restated",
              reason: "Wording clarified",
            }]),
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, LLM_CONFIG, db);

    const updated = getMemory(created.id, db);
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe("Reworded, importance not restated");
    // 缺席 ≠ 重置为 1：patch 里没有 importance，这一列就不该被写
    expect(updated!.importance).toBe(6);

    vi.unstubAllGlobals();
  });

  it("handles LLM API failure gracefully (no throw)", async () => {
    // 失败现在会打一条 console.error（见 callLLM）—— 这里只关心不抛错，把噪音压掉
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Rate Limited",
    });
    vi.stubGlobal("fetch", mockFetch);

    // Should not throw — extraction is non-blocking
    await expect(
      extractMemories(MOCK_PARAMS, LLM_CONFIG, db),
    ).resolves.toBeUndefined();

    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("logs the HTTP status when the LLM call fails, instead of silently extracting zero", async () => {
    // 「LLM 挂了」与「这一轮确实没什么可记的」都产出 0 条记忆，没有日志就分不出来 ——
    // 而前者正是需要运维介入的那种失败。
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(extractMemories(MOCK_PARAMS, LLM_CONFIG, db)).resolves.toBeUndefined();

    expect(errorSpy.mock.calls.some(([m]) => String(m).includes("503"))).toBe(true);

    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("logs when the LLM call throws (connection refused) and still does not throw", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(extractMemories(MOCK_PARAMS, LLM_CONFIG, db)).resolves.toBeUndefined();

    expect(errorSpy.mock.calls.some(([m]) => String(m).includes("ECONNREFUSED"))).toBe(true);

    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("handles invalid JSON response gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "This is not valid JSON at all" } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      extractMemories(MOCK_PARAMS, LLM_CONFIG, db),
    ).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("handles 'noop' action without side effects", async () => {
    const before = listMemories({ userId: "user-extract" }, db);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                { action: "noop", reason: "Nothing new to remember" },
              ]),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, LLM_CONFIG, db);

    const after = listMemories({ userId: "user-extract" }, db);
    expect(after.data.length).toBe(before.data.length);

    vi.unstubAllGlobals();
  });
});

describe("extractMemories conversation scoping", () => {
  // 去重检索走 FTS5 + unicode61，多词查询是**隐式 AND**：一条种子记忆必须
  // 含有 userMessage 的全部词元才会成为候选。所以种子内容必须内嵌这句原话，
  // 否则 MATCH 返回空集，下面的 not.toContain 断言会因"候选为空"而空转通过。
  const FTS_MATCHING_PREFIX = MOCK_PARAMS.userMessage;

  it("persists extracted memories with the conversation id it was given", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{
              action: "add",
              type: "fact",
              content: "Aardvark fact scoped to a specific conversation",
              importance: 5,
            }]),
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(
      { ...MOCK_PARAMS, conversationId: "conv-scoped-42" },
      LLM_CONFIG,
      db,
    );

    const row = db
      .prepare("SELECT conversation_id FROM memory_records WHERE content = ?")
      .get("Aardvark fact scoped to a specific conversation") as
      | { conversation_id: string | null }
      | undefined;

    expect(row).toBeDefined();
    expect(row!.conversation_id).toBe("conv-scoped-42");

    vi.unstubAllGlobals();
  });

  it("scopes dedup candidates to this user and this conversation", async () => {
    // 正对照：同一用户 + 同一会话 —— 必须成为候选，否则下面的断言只是
    // 在空集上空转，证明不了任何过滤逻辑。
    createMemory({
      userId: "user-extract",
      conversationId: "conv-extract",
      agentId: "agent-extract",
      type: "preference",
      content: `${FTS_MATCHING_PREFIX} Marmot RIGHT-USER-RIGHT-CONVERSATION`,
      importance: 9,
    }, db);

    // 跨用户泄漏（spec §4.8 的一半）：同 agentId、同会话，只有 userId 不同
    createMemory({
      userId: "user-someone-else",
      conversationId: "conv-extract",
      agentId: "agent-extract",
      type: "preference",
      content: `${FTS_MATCHING_PREFIX} Quokka WRONG-USER`,
      importance: 9,
    }, db);

    // 跨会话泄漏（spec §4.8 的另一半）：同用户、同 agentId，只有会话不同
    createMemory({
      userId: "user-extract",
      conversationId: "conv-other",
      agentId: "agent-extract",
      type: "preference",
      content: `${FTS_MATCHING_PREFIX} Numbat WRONG-CONVERSATION`,
      importance: 9,
    }, db);

    let capturedPrompt = "";
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      // messages[1] 是 user prompt；messages[0] 是固定的 system 提示词，
      // 断言它等于什么都没断言。
      capturedPrompt = JSON.parse(init.body).messages[1].content as string;
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "[]" } }] }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, LLM_CONFIG, db);

    expect(capturedPrompt).toContain("Marmot");
    expect(capturedPrompt).not.toContain("Quokka");
    expect(capturedPrompt).not.toContain("Numbat");
    vi.unstubAllGlobals();
  });
});

describe("extractor LLM config resolution", () => {
  it("throws a descriptive error when no llm config is available", async () => {
    // 无 process.env 兜底，无 llmConfig —— 必须显式失败，不能猜测一个模型
    await expect(extractMemories(MOCK_PARAMS, undefined, db)).rejects.toThrow(/llm/i);
  });

  it("ignores process.env entirely, even when LLM_BASE_URL / LLM_MODEL are set", async () => {
    process.env["LLM_BASE_URL"] = "https://should-not-be-used.test";
    process.env["LLM_MODEL"] = "should-not-be-used-model";
    process.env["API_KEY"] = "should-not-be-used-key";
    try {
      // 若还残留任何 process.env 读取，这里就会拿着 env 值发请求而不是抛错
      await expect(extractMemories(MOCK_PARAMS, undefined, db)).rejects.toThrow(/llm/i);
    } finally {
      delete process.env["LLM_BASE_URL"];
      delete process.env["LLM_MODEL"];
      delete process.env["API_KEY"];
    }
  });

  it("uses the endpoint and model it was given, not environment defaults", async () => {
    process.env["LLM_BASE_URL"] = "https://should-not-be-used.test";
    process.env["LLM_MODEL"] = "should-not-be-used-model";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "[]" } }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(
      MOCK_PARAMS,
      { apiKey: "k", endpoint: "https://explicit.test/v1/chat/completions", model: "explicit-model" },
      db,
    );

    const [url, init] = mockFetch.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://explicit.test/v1/chat/completions");
    expect(JSON.parse(init.body).model).toBe("explicit-model");

    delete process.env["LLM_BASE_URL"];
    delete process.env["LLM_MODEL"];
    vi.unstubAllGlobals();
  });

  it("omits the Authorization header when apiKey is an empty string", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "[]" } }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(
      MOCK_PARAMS,
      { apiKey: "", endpoint: "https://local.test/v1/chat/completions", model: "local-model" },
      db,
    );

    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }];
    // `?? ""` 会让空串存活并拼出 `Bearer `（无凭据的畸形头）—— 比不带 header 更糟。
    // apiKey 本来就是可选的（本地端点不需要鉴权），空串应当等价于"没有 key"。
    expect(init.headers["Authorization"]).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});
