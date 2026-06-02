import { describe, it, expect } from "vitest";
import { MicroCompactMiddleware } from "../../harness/compression/micro-compact.js";
import { AutoCompactMiddleware } from "../../harness/compression/auto-compact.js";
import type { AgentContext, Chunk } from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";

const baseContext: AgentContext = {
  conversationId: "conv-1",
  message: "hello",
  history: [],
  agents: [],
};

describe("MicroCompactMiddleware", () => {
  it("should compact long tool output", () => {
    const mw = new MicroCompactMiddleware(true);
    const longOutput = "x".repeat(500);
    const context: AgentContext = {
      ...baseContext,
      message: `[Tool: read_file]\nInput: {"path":"/test.txt"}\nOutput: ${longOutput}`,
    };

    const result = mw.beforeAgent(context);
    expect(result.message).toContain("[Previous: used read_file →");
    expect(result.message).toContain("(500 chars)");
    expect(result.message.length).toBeLessThan(200);
  });

  it("should keep short tool output as-is", () => {
    const mw = new MicroCompactMiddleware(true);
    const context: AgentContext = {
      ...baseContext,
      message: "[Tool: read_file]\nInput: {}\nOutput: short result",
    };

    const result = mw.beforeAgent(context);
    expect(result.message).toContain("short result");
    expect(result.message).not.toContain("(chars)");
  });

  it("should not modify non-tool messages", () => {
    const mw = new MicroCompactMiddleware(true);
    const context: AgentContext = {
      ...baseContext,
      message: "Hello, how are you?",
    };

    const result = mw.beforeAgent(context);
    expect(result.message).toBe("Hello, how are you?");
  });

  it("should passthrough when disabled", () => {
    const mw = new MicroCompactMiddleware(false);
    const context: AgentContext = {
      ...baseContext,
      message: "[Tool: test]\nInput: {}\nOutput: " + "x".repeat(500),
    };

    const result = mw.beforeAgent(context);
    expect(result.message).toBe(context.message);
  });

  it("can be toggled at runtime", () => {
    const mw = new MicroCompactMiddleware(false);
    mw.setEnabled(true);

    const context: AgentContext = {
      ...baseContext,
      message: "[Tool: test]\nInput: {}\nOutput: " + "x".repeat(200),
    };

    const result = mw.beforeAgent(context);
    expect(result.message).toContain("[Previous: used test →");
  });
});

describe("AutoCompactMiddleware", () => {
  it("should not compact when context is small", () => {
    const mw = new AutoCompactMiddleware({ tokenThreshold: 100_000 });
    const context: AgentContext = {
      ...baseContext,
      systemPrompt: "You are a helpful assistant.",
    };

    const result = mw.beforeAgent(context);
    expect(result.systemPrompt).not.toContain("[Note: Context is large");
  });

  it("should warn when context exceeds threshold", () => {
    const mw = new AutoCompactMiddleware({ tokenThreshold: 10 });
    const largeContent = "Hello world! ".repeat(100);
    const context: AgentContext = {
      ...baseContext,
      message: largeContent,
      systemPrompt: "You are a helpful assistant.",
    };

    const result = mw.beforeAgent(context);
    expect(result.systemPrompt).toContain("[Note: Context is large");
  });

  it("should not flag twice", () => {
    const mw = new AutoCompactMiddleware({ tokenThreshold: 10 });
    const largeContent = "Hello world! ".repeat(100);
    const context: AgentContext = {
      ...baseContext,
      message: largeContent,
      systemPrompt: "You are a helpful assistant.",
    };

    // First call flags it
    const result = mw.beforeAgent(context);
    expect(result.systemPrompt).toContain("[Note: Context is large");

    // Second call (on original context) should not add the note again
    // The warned flag prevents re-adding, so result matches original context
    const result2 = mw.beforeAgent(context);
    expect(result2.systemPrompt).toBe("You are a helpful assistant.");
  });

  it("should compact when adapter is available", async () => {
    const mockAdapter = {
      summarize: async (_text: string) => "This is a summary of the conversation.",
    };

    const mw = new AutoCompactMiddleware({
      adapter: mockAdapter,
      tokenThreshold: 1, // Always trigger
    });

    const history = [
      { id: "1", conversationId: "c1", senderType: "user" as const, type: "Text" as const,
        content: "Hello", senderId: "u1", createdAt: "", updatedAt: "" },
    ];

    const result = await mw.compact({
      ...baseContext,
      history,
      systemPrompt: "Original prompt",
    });

    expect(result.history).toHaveLength(0);
    expect(result.systemPrompt).toContain("summary of the conversation");
  });

  it("should return context unchanged when no adapter", async () => {
    const mw = new AutoCompactMiddleware({ tokenThreshold: 100 });
    const result = await mw.compact(baseContext);
    expect(result).toBe(baseContext);
  });
});
