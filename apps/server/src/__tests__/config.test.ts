import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildFingerprint,
  createOpenAICompatibleEmbeddingProvider,
} from "@agenthub/memory";

// BASE_URL / MODEL 是历史遗留的死键，这里一并隔离，避免用例之间互相污染。
const ENV_KEYS = [
  "API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "BASE_URL",
  "MODEL",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

// config 的 getter 是 lazy 的，所以每个用例都重新 import 同一个模块实例即可
async function loadConfig() {
  const mod = await import("../config/env.js");
  return mod;
}

describe("LLM config has no silent fallbacks", () => {
  it("throws when LLM_MODEL is missing instead of defaulting to deepseek-chat", async () => {
    process.env["API_KEY"] = "k";
    process.env["LLM_BASE_URL"] = "https://api.deepseek.com";

    const { config } = await loadConfig();
    expect(() => config.llm.model).toThrow(/LLM_MODEL/);
  });

  it("throws when LLM_BASE_URL is missing instead of defaulting to api.deepseek.com", async () => {
    process.env["API_KEY"] = "k";
    process.env["LLM_MODEL"] = "deepseek-v4-flash";

    const { config } = await loadConfig();
    expect(() => config.llm.baseUrl).toThrow(/LLM_BASE_URL/);
  });

  it("reads the value that is actually configured", async () => {
    process.env["API_KEY"] = "k";
    process.env["LLM_BASE_URL"] = "https://example.test";
    process.env["LLM_MODEL"] = "deepseek-v4-flash";

    const { config } = await loadConfig();
    expect(config.llm.model).toBe("deepseek-v4-flash");
    expect(config.llm.baseUrl).toBe("https://example.test");
    expect(config.llm.endpoint).toBe("https://example.test/v1/chat/completions");
  });

  it("carries a configured model that differs from the old default", async () => {
    // 旧兜底值恰好等于 .env 里配置的值，所以「模型没生效」从未被发现（spec §4.9）。
    // 这个用例用一个绝不可能撞上兜底的名字，证明配置值真的赢。
    process.env["API_KEY"] = "k";
    process.env["LLM_BASE_URL"] = "https://example.test";
    process.env["LLM_MODEL"] = "model-that-is-definitely-not-the-default";

    const { config } = await loadConfig();
    expect(config.llm.model).toBe("model-that-is-definitely-not-the-default");
  });

  it("ignores the dead keys BASE_URL and MODEL", async () => {
    process.env["API_KEY"] = "k";
    process.env["BASE_URL"] = "https://dead-key.test";
    process.env["MODEL"] = "dead-key-model";

    const { config } = await loadConfig();
    expect(() => config.llm.baseUrl).toThrow(/LLM_BASE_URL/);
    expect(() => config.llm.model).toThrow(/LLM_MODEL/);
  });
});

describe("apiKey stays optional so the degraded mode is reachable", () => {
  it("does not throw when API_KEY is absent", async () => {
    process.env["LLM_BASE_URL"] = "https://example.test";
    process.env["LLM_MODEL"] = "deepseek-v4-flash";

    const { config } = await loadConfig();
    expect(config.llm.apiKey).toBeUndefined();
    // 配置里其它字段仍然可读 —— 缺 key 不该拖垮整个 config.llm
    expect(config.llm.model).toBe("deepseek-v4-flash");
    expect(config.llm.baseUrl).toBe("https://example.test");
  });

  it("does not throw when API_KEY is present but empty", async () => {
    process.env["API_KEY"] = "";
    process.env["LLM_BASE_URL"] = "https://example.test";
    process.env["LLM_MODEL"] = "deepseek-v4-flash";

    const { config } = await loadConfig();
    expect(config.llm.apiKey).toBeFalsy();
  });
});

// ─── Embedding（spec §10.2）────────────────────────────────────────────────────

const EMBEDDING_KEYS = [
  "EMBEDDING_BASE_URL",
  "EMBEDDING_API_KEY",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIM",
  "EMBEDDING_MODE",
  "EMBEDDING_DIMENSIONS",
] as const;

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

/** 四个必填项各给一个合法值；调用方删掉其中一个来构造「不全」的场景。 */
function setCompleteEmbedding(): void {
  process.env["EMBEDDING_BASE_URL"] = "http://127.0.0.1:11434/v1";
  process.env["EMBEDDING_API_KEY"] = "EMPTY";
  process.env["EMBEDDING_MODEL"] = "bge-m3";
  process.env["EMBEDDING_DIM"] = "1024";
}

describe("embedding config", () => {
  it("is undefined when nothing is configured", async () => {
    const savedEmbedding = saveAndClearEmbedding();
    const { config } = await loadConfig();
    expect(config.embedding).toBeUndefined();
    restoreEmbedding(savedEmbedding);
  });

  it("is undefined when only some required keys are set — no partial fallback", async () => {
    const savedEmbedding = saveAndClearEmbedding();
    process.env["EMBEDDING_BASE_URL"] = "http://127.0.0.1:11434/v1";
    process.env["EMBEDDING_MODEL"] = "bge-m3";
    // 缺 API_KEY 与 DIM
    const { config } = await loadConfig();
    expect(config.embedding).toBeUndefined();
    restoreEmbedding(savedEmbedding);
  });

  // 四个必填项**各自**缺失都必须独立关闭向量路 —— 一个「缺了两个」的用例
  // 无法区分「四个都校验」与「只校验了其中两个」。
  it.each([
    ["EMBEDDING_BASE_URL"],
    ["EMBEDDING_API_KEY"],
    ["EMBEDDING_MODEL"],
    ["EMBEDDING_DIM"],
  ] as const)("is undefined when %s alone is missing", async (missingKey) => {
    const savedEmbedding = saveAndClearEmbedding();
    setCompleteEmbedding();
    delete process.env[missingKey];

    const { config } = await loadConfig();
    expect(config.embedding).toBeUndefined();
    restoreEmbedding(savedEmbedding);
  });

  it("parses a complete Ollama configuration", async () => {
    const savedEmbedding = saveAndClearEmbedding();
    setCompleteEmbedding();

    const { config } = await loadConfig();
    expect(config.embedding).toEqual({
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "EMPTY",
      model: "bge-m3",
      dim: 1024,
      mode: "symmetric",
    });
    restoreEmbedding(savedEmbedding);
  });

  it("rejects a non-numeric EMBEDDING_DIM", async () => {
    const savedEmbedding = saveAndClearEmbedding();
    setCompleteEmbedding();
    process.env["EMBEDDING_DIM"] = "not-a-number";

    const { config } = await loadConfig();
    expect(config.embedding).toBeUndefined();
    restoreEmbedding(savedEmbedding);
  });

  it("rejects a non-positive EMBEDDING_DIM", async () => {
    const savedEmbedding = saveAndClearEmbedding();
    setCompleteEmbedding();
    process.env["EMBEDDING_DIM"] = "0";

    const { config } = await loadConfig();
    expect(config.embedding).toBeUndefined();
    restoreEmbedding(savedEmbedding);
  });

  it("accepts an explicit asymmetric mode", async () => {
    const savedEmbedding = saveAndClearEmbedding();
    setCompleteEmbedding();
    process.env["EMBEDDING_MODEL"] = "bge-large-zh-v1.5";
    process.env["EMBEDDING_MODE"] = "asymmetric";

    const { config } = await loadConfig();
    expect(config.embedding?.mode).toBe("asymmetric");
    restoreEmbedding(savedEmbedding);
  });

  // 配置对象直接被喂给 `createOpenAICompatibleEmbeddingProvider`（index.ts），
  // 而 `/api/memory/list` 的 `pendingCount` 拿 `buildFingerprint(model, dim, mode)`
  // 去问「这个模型还有多少条没算」。两边必须给出同一个指纹 —— 否则队列会永远
  // 显示非零（或永远显示零），而库里的向量其实是另一个向量空间的。
  it("produces the provider whose fingerprint the pending queue is keyed on", async () => {
    const savedEmbedding = saveAndClearEmbedding();
    setCompleteEmbedding();

    const { config } = await loadConfig();
    const provider = createOpenAICompatibleEmbeddingProvider(config.embedding!);

    expect(provider.fingerprint).toBe(buildFingerprint("bge-m3", 1024, "symmetric"));
    expect(provider.fingerprint).toBe("bge-m3:1024:symmetric");
    restoreEmbedding(savedEmbedding);
  });

  it("falls back to symmetric — and only symmetric — for an unknown mode", async () => {
    const savedEmbedding = saveAndClearEmbedding();
    setCompleteEmbedding();
    process.env["EMBEDDING_MODE"] = "sideways";

    const { config } = await loadConfig();
    expect(config.embedding?.mode).toBe("symmetric");
    restoreEmbedding(savedEmbedding);
  });
});

describe("assertLlmConfig", () => {
  it("names the missing variable so the user can act on it", async () => {
    const { assertLlmConfig } = await loadConfig();

    // 逐个补齐，验证失败信息指向的是当下真正缺失的那个变量。
    expect(() => assertLlmConfig()).toThrow(/LLM_BASE_URL/);

    process.env["LLM_BASE_URL"] = "https://example.test";
    expect(() => assertLlmConfig()).toThrow(/LLM_MODEL/);
  });

  it("passes once the required variables are present", async () => {
    process.env["LLM_BASE_URL"] = "https://example.test";
    process.env["LLM_MODEL"] = "deepseek-v4-flash";

    const { assertLlmConfig } = await loadConfig();
    expect(() => assertLlmConfig()).not.toThrow();
  });

  it("does not require API_KEY — that would make the degraded mode unreachable", async () => {
    // API_KEY 刻意保持可选：缺失时 LLMIntentAnalyzer 走显式降级
    // （派发全部 agent）并打 warning，而不是让进程起不来。
    process.env["LLM_BASE_URL"] = "https://example.test";
    process.env["LLM_MODEL"] = "deepseek-v4-flash";
    // API_KEY 在 beforeEach 里已被删除

    const { assertLlmConfig, config } = await loadConfig();
    expect(() => assertLlmConfig()).not.toThrow();
    expect(config.llm.apiKey).toBeUndefined();
  });
});
