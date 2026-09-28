import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { extractMemories } from "../extractor.js";
import { createMemory, getMemory, listMemories } from "../repository.js";
import { searchMemories } from "../search.js";

let db: DatabaseType;

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
});

afterAll(() => {
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
    const results = searchMemories(
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

  it("handles update operation from LLM output", async () => {
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

    // Verify the old memory is gone
    expect(getMemory(created.id, db)).toBeNull();

    // Verify the new memory exists with updated content
    const updatedResults = searchMemories(
      {
        query: "Updated content",
        userId: "user-extract",
        scope: { conversationId: "conv-extract" },
        agentId: "agent-extract",
      },
      db,
    );
    expect(updatedResults.length).toBe(1);
    expect(updatedResults[0]!.content).toBe("Updated content with new preference");
    expect(updatedResults[0]!.type).toBe("preference");
    expect(updatedResults[0]!.importance).toBe(7);
    // update 分支是 delete+create，重建的那行也必须带上会话 id（spec §4.7）
    expect(updatedResults[0]!.conversationId).toBe("conv-extract");

    vi.unstubAllGlobals();
  });

  it("handles LLM API failure gracefully (no throw)", async () => {
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
