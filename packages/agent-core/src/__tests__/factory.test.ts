import { describe, it, expect } from "vitest";
import { createAdapter } from "../factory.js";
import { ClaudeAdapter } from "../adapters/claude.adapter.js";
import { OpenCodeAdapter } from "../adapters/opencode.adapter.js";
import { CustomAgentAdapter } from "../adapters/custom.adapter.js";

describe("createAdapter", () => {
  it("should return ClaudeAdapter for 'claude'", () => {
    const adapter = createAdapter("claude", { cliPath: "claude" });
    expect(adapter).toBeInstanceOf(ClaudeAdapter);
  });

  it("should return OpenCodeAdapter for 'opencode'", () => {
    const adapter = createAdapter("opencode", { model: "anthropic/claude-sonnet-4-6" });
    expect(adapter).toBeInstanceOf(OpenCodeAdapter);
  });

  it("should return CustomAgentAdapter for 'custom'", () => {
    const adapter = createAdapter("custom", {
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(adapter).toBeInstanceOf(CustomAgentAdapter);
  });

  it("should throw for unsupported providers", () => {
    expect(() => createAdapter("unknown", {})).toThrow(
      /unsupported agent provider/i,
    );
  });
});
