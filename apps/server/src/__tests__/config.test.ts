import { describe, it, expect, beforeEach, afterEach } from "vitest";

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
