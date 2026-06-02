import { describe, it, expect } from "vitest";
import { MemoryMiddleware } from "../../harness/memory/memory-middleware.js";
import type { AgentContext, Chunk } from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";

const baseContext: AgentContext = {
  conversationId: "conv-1",
  message: "What is the capital of France?",
  history: [],
  agents: [],
};

describe("MemoryMiddleware", () => {
  it("should inject relevant memories into system prompt", () => {
    const mw = new MemoryMiddleware();
    const store = mw.getStore();

    // Add a relevant fact
    store.add({
      content: "User is interested in European geography",
      classification: "permanent",
      keywords: ["geography", "europe", "capital"],
    });

    // Add an irrelevant fact
    store.add({
      content: "User likes pizza",
      classification: "temporary",
      keywords: ["food", "pizza"],
    });

    const result = mw.beforeAgent(baseContext);

    expect(result.systemPrompt).toContain("[Relevant Memories]");
    expect(result.systemPrompt).toContain("European geography");
    expect(result.systemPrompt).not.toContain("pizza");
  });

  it("should not inject memories when no keywords match", () => {
    const mw = new MemoryMiddleware();
    const store = mw.getStore();

    store.add({
      content: "User likes cats",
      classification: "temporary",
      keywords: ["cats", "pets"],
    });

    const result = mw.beforeAgent({
      ...baseContext,
      message: "Hello",
    });

    expect(result.systemPrompt).toBeUndefined();
  });

  it("should extract facts from agent output on afterAgent", () => {
    const mw = new MemoryMiddleware({ debounceMs: 0 });
    const store = mw.getStore();

    const chunks: Chunk[] = [
      { type: ChunkType.Text, content: "The capital of France is Paris. It is located in Europe.", timestamp: "" },
    ];

    mw.afterAgent(baseContext, chunks);

    // Should have extracted and stored facts
    expect(store.size).toBeGreaterThan(0);

    // The extracted facts should be retrievable
    const results = store.retrieve(["capital"]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((f) => f.content.toLowerCase().includes("capital"))).toBe(true);
  });

  it("should not extract facts within debounce window", () => {
    const mw = new MemoryMiddleware({ debounceMs: 60_000 }); // 1 minute debounce
    const store = mw.getStore();

    const chunks: Chunk[] = [
      { type: ChunkType.Text, content: "The capital of France is Paris.", timestamp: "" },
    ];

    mw.afterAgent(baseContext, chunks);
    const sizeAfterFirst = store.size;

    mw.afterAgent(baseContext, chunks);
    // Should not have added more due to debounce
    expect(store.size).toBe(sizeAfterFirst);
  });

  it("should provide access to the underlying store", () => {
    const mw = new MemoryMiddleware();
    const store = mw.getStore();
    expect(store).toBeDefined();
    expect(store.size).toBe(0);
  });
});
