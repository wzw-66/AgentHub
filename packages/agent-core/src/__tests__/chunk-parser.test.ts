import { describe, it, expect } from "vitest";
import { ChunkType, AgentProvider } from "@agenthub/shared";
import {
  createChunk,
  isDoneChunk,
  parseClaudeStreamJson,
  createClaudeStreamState,
  parseOpenCodeEvent,
  parseOpenAIStreamEvent,
  parseEventLine,
} from "../utils/chunk-parser.js";

describe("createChunk", () => {
  it("should create a chunk with the given type and content", () => {
    const chunk = createChunk(ChunkType.Text, "hello");
    expect(chunk.type).toBe(ChunkType.Text);
    expect(chunk.content).toBe("hello");
  });

  it("should attach metadata when provided", () => {
    const chunk = createChunk(ChunkType.Done, "", { usage: { tokens: 10 } });
    expect(chunk.metadata).toEqual({ usage: { tokens: 10 } });
  });

  it("should generate an ISO timestamp", () => {
    const chunk = createChunk(ChunkType.Text, "test");
    expect(chunk.timestamp).toBeDefined();
    expect(() => new Date(chunk.timestamp)).not.toThrow();
  });
});

describe("isDoneChunk", () => {
  it("should return true for Done chunks", () => {
    const chunk = createChunk(ChunkType.Done, "");
    expect(isDoneChunk(chunk)).toBe(true);
  });

  it("should return false for non-Done chunks", () => {
    const textChunk = createChunk(ChunkType.Text, "hi");
    expect(isDoneChunk(textChunk)).toBe(false);

    const errorChunk = createChunk(ChunkType.Error, "err");
    expect(isDoneChunk(errorChunk)).toBe(false);
  });
});

describe("parseClaudeStreamJson", () => {
  it("should parse a text delta event", () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello world" },
      },
    });
    const chunk = parseClaudeStreamJson(line);
    expect(chunk).not.toBeNull();
    expect(chunk!.type).toBe(ChunkType.Text);
    expect(chunk!.content).toBe("Hello world");
  });

  it("should parse a result event as done", () => {
    const line = JSON.stringify({
      type: "result",
      result: "done",
      session_id: "ses-123",
      usage: { total_cost_usd: 0.01 },
    });
    const chunk = parseClaudeStreamJson(line);
    expect(chunk).not.toBeNull();
    expect(chunk!.type).toBe(ChunkType.Done);
    expect(chunk!.metadata).toBeDefined();
    expect(chunk!.metadata!.usage).toBeDefined();
  });

  it("should return null for init events", () => {
    const line = JSON.stringify({
      type: "init",
      session_id: "ses-123",
      start_time: "2025-01-01T00:00:00Z",
    });
    expect(parseClaudeStreamJson(line)).toBeNull();
  });

  it("should return null for non-JSON lines", () => {
    expect(parseClaudeStreamJson("not json")).toBeNull();
  });

  it("should return null for empty lines", () => {
    expect(parseClaudeStreamJson("")).toBeNull();
    expect(parseClaudeStreamJson("  ")).toBeNull();
  });

  describe("tool call parsing (stateful)", () => {
    it("should track tool_use content_block_start and finalize on content_block_stop", () => {
      const state = createClaudeStreamState();

      // content_block_start with tool_use
      const startLine = JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "toolu_123",
            name: "bash",
            input: {},
          },
        },
      });
      expect(parseClaudeStreamJson(startLine, state)).toBeNull();
      expect(state.pendingToolCall).toEqual({
        id: "toolu_123",
        name: "bash",
        input: "",
      });

      // content_block_stop → finalizes tool call
      const stopLine = JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_stop", index: 0 },
      });
      const chunk = parseClaudeStreamJson(stopLine, state);
      expect(chunk).not.toBeNull();
      expect(chunk!.type).toBe(ChunkType.ToolCall);
      const parsed = JSON.parse(chunk!.content);
      expect(parsed.id).toBe("toolu_123");
      expect(parsed.name).toBe("bash");
      expect(parsed.input).toBe("");
      expect(state.pendingToolCall).toBeNull();
    });

    it("should accumulate input_json_delta between start and stop", () => {
      const state = createClaudeStreamState();

      // Start tool_use with empty input
      const startLine = JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 1,
          content_block: {
            type: "tool_use",
            id: "toolu_456",
            name: "edit",
            input: {},
          },
        },
      });
      parseClaudeStreamJson(startLine, state);
      expect(state.pendingToolCall).not.toBeNull();

      // Stream partial JSON deltas
      const delta1 = JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: '{"file":' },
        },
      });
      expect(parseClaudeStreamJson(delta1, state)).toBeNull();

      const delta2 = JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: '"src/main.ts",' },
        },
      });
      expect(parseClaudeStreamJson(delta2, state)).toBeNull();

      const delta3 = JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: '"content":"edited"}' },
        },
      });
      expect(parseClaudeStreamJson(delta3, state)).toBeNull();

      // Stop → finalize with accumulated input
      const stopLine = JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_stop", index: 1 },
      });
      const chunk = parseClaudeStreamJson(stopLine, state);
      expect(chunk).not.toBeNull();
      expect(chunk!.type).toBe(ChunkType.ToolCall);
      const parsed = JSON.parse(chunk!.content);
      expect(parsed.id).toBe("toolu_456");
      expect(parsed.name).toBe("edit");
      expect(parsed.input).toBe('{"file":"src/main.ts","content":"edited"}');
      expect(state.pendingToolCall).toBeNull();
    });

    it("should not emit tool call without state", () => {
      // Without state, content_block_start/stop are ignored
      const startLine = JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "toolu_1", name: "Read", input: {} },
        },
      });
      expect(parseClaudeStreamJson(startLine)).toBeNull();

      const stopLine = JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_stop", index: 0 },
      });
      expect(parseClaudeStreamJson(stopLine)).toBeNull();
    });

    it("should handle multiple tool calls sequentially", () => {
      const state = createClaudeStreamState();

      // First tool call
      const s1 = JSON.stringify({ type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "bash", input: {} } } });
      parseClaudeStreamJson(s1, state);
      const stop1 = JSON.stringify({ type: "stream_event", event: { type: "content_block_stop", index: 0 } });
      const c1 = parseClaudeStreamJson(stop1, state);
      expect(c1).not.toBeNull();
      expect(JSON.parse(c1!.content).id).toBe("toolu_1");
      expect(state.pendingToolCall).toBeNull();

      // Second tool call
      const s2 = JSON.stringify({ type: "stream_event", event: { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_2", name: "Read", input: {} } } });
      parseClaudeStreamJson(s2, state);
      const stop2 = JSON.stringify({ type: "stream_event", event: { type: "content_block_stop", index: 1 } });
      const c2 = parseClaudeStreamJson(stop2, state);
      expect(c2).not.toBeNull();
      expect(JSON.parse(c2!.content).id).toBe("toolu_2");
      expect(state.pendingToolCall).toBeNull();
    });
  });
});

describe("parseOpenCodeEvent", () => {
  it("should parse a text event", () => {
    const line = JSON.stringify({
      type: "text",
      content: "Here is the result",
      timestamp: 1712345678000,
      sessionID: "sess-abc",
    });
    const chunk = parseOpenCodeEvent(line);
    expect(chunk).not.toBeNull();
    expect(chunk!.type).toBe(ChunkType.Text);
    expect(chunk!.content).toBe("Here is the result");
  });

  it("should parse a tool_use event", () => {
    const line = JSON.stringify({
      type: "tool_use",
      name: "read_file",
      callID: "call-456",
      input: { path: "/tmp/test.txt" },
      state: { output: "file contents" },
    });
    const chunk = parseOpenCodeEvent(line);
    expect(chunk).not.toBeNull();
    expect(chunk!.type).toBe(ChunkType.ToolCall);
    expect(chunk!.content).toContain("read_file");
  });

  it("should parse an error event", () => {
    const line = JSON.stringify({
      type: "error",
      message: "Something went wrong",
    });
    const chunk = parseOpenCodeEvent(line);
    expect(chunk).not.toBeNull();
    expect(chunk!.type).toBe(ChunkType.Error);
    expect(chunk!.content).toBe("Something went wrong");
  });

  it("should parse a step_finish event as done", () => {
    const line = JSON.stringify({
      type: "step_finish",
      tokens: { input: 100, output: 50 },
      cost: 0.002,
      reason: "end_turn",
    });
    const chunk = parseOpenCodeEvent(line);
    expect(chunk).not.toBeNull();
    expect(chunk!.type).toBe(ChunkType.Done);
    expect(chunk!.metadata!.cost).toBe(0.002);
  });

  it("should return null for non-JSON lines", () => {
    expect(parseOpenCodeEvent("not json")).toBeNull();
  });

  it("should return null for unknown event types", () => {
    const line = JSON.stringify({ type: "step_start" });
    expect(parseOpenCodeEvent(line)).toBeNull();
  });
});

describe("parseOpenAIStreamEvent", () => {
  it("should parse a content delta", () => {
    const line = "data: " + JSON.stringify({
      choices: [{ delta: { content: "Hello" } }],
    });
    const chunk = parseOpenAIStreamEvent(line);
    expect(chunk).not.toBeNull();
    expect(chunk!.type).toBe(ChunkType.Text);
    expect(chunk!.content).toBe("Hello");
  });

  it("should handle [DONE] signal", () => {
    const chunk = parseOpenAIStreamEvent("data: [DONE]");
    expect(chunk).not.toBeNull();
    expect(chunk!.type).toBe(ChunkType.Done);
  });

  it("should return null for non-data lines", () => {
    expect(parseOpenAIStreamEvent("not data line")).toBeNull();
  });

  it("should return null for empty delta", () => {
    const line = "data: " + JSON.stringify({
      choices: [{ delta: {} }],
    });
    expect(parseOpenAIStreamEvent(line)).toBeNull();
  });
});

describe("parseEventLine", () => {
  it("should dispatch Claude events", () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "hi" },
      },
    });
    const chunk = parseEventLine(AgentProvider.Claude, line);
    expect(chunk).not.toBeNull();
    expect(chunk!.type).toBe(ChunkType.Text);
  });

  it("should dispatch OpenCode events", () => {
    const line = JSON.stringify({ type: "text", content: "hello" });
    const chunk = parseEventLine(AgentProvider.OpenCode, line);
    expect(chunk).not.toBeNull();
    expect(chunk!.type).toBe(ChunkType.Text);
  });

  it("should dispatch Custom (OpenAI) events", () => {
    const line = "data: " + JSON.stringify({
      choices: [{ delta: { content: "hi" } }],
    });
    const chunk = parseEventLine(AgentProvider.Custom, line);
    expect(chunk).not.toBeNull();
    expect(chunk!.type).toBe(ChunkType.Text);
  });
});
