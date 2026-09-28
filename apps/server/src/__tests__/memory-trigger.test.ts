import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { triggerMemoryExtraction, pendingExtractionCount } from "../services/memory-trigger.js";
import { searchMemories, getDatabase, setDbPath, closeDatabase, initSchema } from "@agenthub/memory";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

let dbPath: string;
const silentLog = { error: () => {}, warn: () => {} };

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `agenthub-trigger-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  closeDatabase();
  setDbPath(dbPath);
  // 服务端没有全局 schema setup；记忆库的表由调用方显式建（`routes/memory.ts` 亦然）。
  initSchema();
});

afterEach(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
  }
  vi.unstubAllGlobals();
});

describe("triggerMemoryExtraction", () => {
  it("persists the memory with the conversation id it was given", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{
              action: "add",
              type: "preference",
              content: "Numbat preference recorded through the trigger helper",
              importance: 6,
            }]),
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    triggerMemoryExtraction({
      userId: "user-trigger",
      conversationId: "conv-trigger-7",
      agentId: "agent-trigger",
      agentName: "TriggerBot",
      userMessage: "some user message",
      agentResponse: "some agent response",
      llm: { apiKey: "test-key", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
      log: silentLog,
    });

    // fire-and-forget —— 等到信号量归零
    await vi.waitFor(() => expect(pendingExtractionCount()).toBe(0));

    const found = searchMemories(
      { query: "Numbat", userId: "user-trigger", scope: { conversationId: "conv-trigger-7" } },
      getDatabase(),
    );
    expect(found.length).toBe(1);
    expect(found[0]!.conversationId).toBe("conv-trigger-7");
  });

  it("does not make the same memory reachable from another conversation", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{
              action: "add",
              type: "fact",
              content: "Ocelot fact confined to its own conversation",
            }]),
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    triggerMemoryExtraction({
      userId: "user-trigger",
      conversationId: "conv-trigger-7",
      agentId: "agent-trigger",
      agentName: "TriggerBot",
      userMessage: "u",
      agentResponse: "a",
      llm: { apiKey: "test-key", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
      log: silentLog,
    });
    await vi.waitFor(() => expect(pendingExtractionCount()).toBe(0));

    const elsewhere = searchMemories(
      { query: "Ocelot", userId: "user-trigger", scope: { conversationId: "conv-somewhere-else" } },
      getDatabase(),
    );
    expect(elsewhere.length).toBe(0);
  });

  it("logs a failed extraction instead of swallowing it, and never throws", async () => {
    const errors: unknown[] = [];
    // 让 extractMemories 真的 reject：把记忆库指到一个不可能打开的路径
    // （以本用例的 db 文件为父目录）。用真实失败而非 stub，验证的才是 helper
    // 自己的 catch 分支。
    //
    // 注意：这里**不能**用「fetch reject」来触发 —— extractor 的 callLLM 内部
    // 已把网络错误吞掉并返回 ""，所以 LLM 故障不会让 extractMemories reject，
    // 也就到不了这个 catch。LLM 故障下「调用方不被炸」由下一个用例覆盖。
    closeDatabase();
    setDbPath(path.join(dbPath, "nested.db"));

    expect(() =>
      triggerMemoryExtraction({
        userId: "user-trigger",
        conversationId: "conv-trigger-7",
        agentId: "agent-trigger",
        agentName: "TriggerBot",
        userMessage: "u",
        agentResponse: "a",
        llm: { apiKey: "test-key", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
        log: { error: (obj) => errors.push(obj), warn: () => {} },
      }),
    ).not.toThrow();

    await vi.waitFor(() => expect(pendingExtractionCount()).toBe(0));
    expect(errors.length).toBe(1);
  });

  it("does not throw or leak the semaphore when the LLM call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(() =>
      triggerMemoryExtraction({
        userId: "user-trigger",
        conversationId: "conv-trigger-7",
        agentId: "agent-trigger",
        agentName: "TriggerBot",
        userMessage: "u",
        agentResponse: "a",
        llm: { apiKey: "test-key", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
        log: silentLog,
      }),
    ).not.toThrow();

    // 关键不变量：无论提取成功、失败还是被 LLM 吞掉，信号量都必须归零，
    // 否则后续提取会永久排队。
    await vi.waitFor(() => expect(pendingExtractionCount()).toBe(0));
  });
});
