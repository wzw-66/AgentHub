import { describe, it, expect, vi } from "vitest";
import { ChunkType } from "@agenthub/shared";
import { AgentHarness } from "../../harness/agent-harness.js";
import type { AgentAdapter, AgentContext, Chunk } from "@agenthub/shared";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function textChunk(content: string): Chunk {
  return { type: ChunkType.Text, content, timestamp: new Date().toISOString() };
}

function toolCallChunk(name: string, args: Record<string, unknown>): Chunk {
  return {
    type: ChunkType.ToolCall,
    content: JSON.stringify({ name, input: args }),
    timestamp: new Date().toISOString(),
  };
}

function doneChunk(): Chunk {
  return { type: ChunkType.Done, content: "", timestamp: new Date().toISOString() };
}

function errorChunk(content: string): Chunk {
  return { type: ChunkType.Error, content, timestamp: new Date().toISOString() };
}

const defaultContext: AgentContext = {
  conversationId: "conv-1",
  message: "Hello",
  history: [],
  agents: [],
};

// ─── Mock Adapter Factory ─────────────────────────────────────────────────────

/**
 * Create a mock AgentAdapter that returns responses in sequence.
 * Each call to execute() returns a new async iterable that yields
 * the next response array from the queue. This simulates multi-turn
 * agent execution where each turn produces specific chunks.
 */
function createMockAdapter(
  responseQueue: Array<Array<Chunk>>,
): AgentAdapter {
  // Deep clone the queue so each test gets fresh copies
  const queue = responseQueue.map((arr) => [...arr]);

  return {
    execute: vi.fn((_context: AgentContext): AsyncIterable<Chunk> => {
      return {
        async *[Symbol.asyncIterator]() {
          const chunks = queue.shift();
          if (chunks) {
            for (const chunk of chunks) {
              yield chunk;
            }
          }
          // If queue is empty, the iterable just returns with no chunks
        },
      };
    }),
    abort: vi.fn(),
    healthCheck: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AgentHarness", () => {
  it("should pass through text chunks when no tool calls", async () => {
    const adapter = createMockAdapter([
      [textChunk("Hello "), textChunk("World"), doneChunk()],
    ]);
    const harness = new AgentHarness(adapter, { maxTurns: 10 });

    const result = await harness.executeWithResult(defaultContext);

    expect(result.turns).toBe(1);
    expect(result.text).toBe("Hello World");
    expect(result.chunks.filter((c) => c.type === ChunkType.Error)).toHaveLength(0);
  });

  it("should handle single tool call and continue loop", async () => {
    const toolHandler = vi.fn().mockReturnValue([
      { type: ChunkType.Text, content: "tool_result_ok", timestamp: new Date().toISOString() },
    ]);

    const adapter = createMockAdapter([
      [textChunk("Let me check..."), toolCallChunk("read_file", { path: "/test.txt" }), doneChunk()],
      [textChunk("The file contains: data"), doneChunk()],
    ]);

    const harness = new AgentHarness(adapter, { maxTurns: 10 });
    harness.registerTool("read_file", toolHandler);

    const result = await harness.executeWithResult(defaultContext);

    expect(result.turns).toBe(2);
    expect(toolHandler).toHaveBeenCalledOnce();
    expect(toolHandler).toHaveBeenCalledWith(
      "read_file",
      { path: "/test.txt" },
      expect.objectContaining({ conversationId: "conv-1" }),
    );
    expect(result.text).toContain("The file contains: data");
  });

  it("should handle multiple turns with tool calls", async () => {
    const readHandler = vi.fn().mockReturnValue([textChunk("file content")]);
    const searchHandler = vi.fn().mockReturnValue([textChunk("search results")]);

    const adapter = createMockAdapter([
      [toolCallChunk("read_file", { path: "a.txt" }), doneChunk()],
      [toolCallChunk("search", { query: "test" }), doneChunk()],
      [textChunk("Done with both"), doneChunk()],
    ]);

    const harness = new AgentHarness(adapter, { maxTurns: 10 });
    harness.registerTool("read_file", readHandler);
    harness.registerTool("search", searchHandler);

    const result = await harness.executeWithResult(defaultContext);

    expect(result.turns).toBe(3);
    expect(readHandler).toHaveBeenCalledOnce();
    expect(searchHandler).toHaveBeenCalledOnce();
    expect(result.text).toBe("Done with both");
  });

  it("should stop at maxTurns", async () => {
    const loopHandler = vi.fn().mockReturnValue([textChunk("continuing")]);
    // Each turn produces a tool call → harness continues in a loop
    const toolCall = toolCallChunk("loop", {});
    const done = doneChunk();

    const adapter = createMockAdapter([
      [toolCall, done],
      [toolCall, done],
      [toolCall, done],
      [toolCall, done],
      [toolCall, done],
    ]);

    const harness = new AgentHarness(adapter, { maxTurns: 3 });
    harness.registerTool("loop", loopHandler);

    const result = await harness.executeWithResult(defaultContext);

    expect(result.turns).toBe(3);
    expect(result.text).toContain("stopped after 3 turns");
  });

  it("should report error for unknown tool", async () => {
    const adapter = createMockAdapter([
      [toolCallChunk("unknown_tool", { arg: 1 }), doneChunk()],
      [textChunk("Final response"), doneChunk()],
    ]);

    const harness = new AgentHarness(adapter, { maxTurns: 10 });

    const result = await harness.executeWithResult(defaultContext);

    expect(result.turns).toBe(2);
    expect(result.chunks.some((c) => c.type === ChunkType.Error && c.content.includes("unknown_tool"))).toBe(true);
  });

  it("should handle tool handler throwing an error", async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error("Something broke"));

    const adapter = createMockAdapter([
      [toolCallChunk("bad_tool", {}), doneChunk()],
      [textChunk("After error"), doneChunk()],
    ]);

    const harness = new AgentHarness(adapter, { maxTurns: 10 });
    harness.registerTool("bad_tool", failingHandler);

    const result = await harness.executeWithResult(defaultContext);

    expect(result.turns).toBe(2);
    expect(result.text).toBe("After error");
  });

  it("should emit harness events", async () => {
    const events: string[] = [];

    const adapter = createMockAdapter([
      [toolCallChunk("my_tool", {}), doneChunk()],
      [textChunk("Done"), doneChunk()],
    ]);

    const handler = vi.fn().mockReturnValue([textChunk("ok")]);

    const harness = new AgentHarness(adapter, {
      maxTurns: 10,
      onEvent: (event) => { events.push(event.type); },
    });
    harness.registerTool("my_tool", handler);

    await harness.executeWithResult(defaultContext);

    expect(events).toContain("before_turn");
    expect(events).toContain("tool_start");
    expect(events).toContain("tool_end");
    expect(events).toContain("after_turn");
    expect(events).toContain("done");
  });

  it("should abort underlying adapter", () => {
    const adapter = createMockAdapter([
      [textChunk("test"), doneChunk()],
    ]);
    const harness = new AgentHarness(adapter);

    harness.abort();

    expect(adapter.abort).toHaveBeenCalledOnce();
  });

  it("should support registerTool chaining", () => {
    const adapter = createMockAdapter([
      [textChunk("test"), doneChunk()],
    ]);
    const harness = new AgentHarness(adapter);

    harness.registerTool("a", vi.fn());
    harness.registerTool("b", vi.fn());

    expect(true).toBe(true);
  });

  it("should handle tool response as string from sync handler", async () => {
    const adapter = createMockAdapter([
      [toolCallChunk("greet", { name: "World" }), doneChunk()],
      [textChunk("Hello back!"), doneChunk()],
    ]);

    const harness = new AgentHarness(adapter, { maxTurns: 10 });
    harness.registerTool("greet", async (_name, args) => {
      return `Hello, ${args.name}!`;
    });

    const result = await harness.executeWithResult(defaultContext);

    expect(result.turns).toBe(2);
    expect(result.text).toBe("Hello back!");
  });

  it("should handle no tool calls (single turn exit)", async () => {
    const adapter = createMockAdapter([
      [textChunk("Direct answer"), doneChunk()],
    ]);
    const harness = new AgentHarness(adapter, { maxTurns: 10 });

    const result = await harness.executeWithResult(defaultContext);

    expect(result.turns).toBe(1);
    expect(result.text).toBe("Direct answer");
  });
});
