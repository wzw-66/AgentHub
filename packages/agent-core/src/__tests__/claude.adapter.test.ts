import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChunkType } from "@agenthub/shared";
import { ClaudeAdapter } from "../adapters/claude.adapter.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";

function createMockProcess() {
  const { Readable } = require("stream") as typeof import("stream");
  const mockStdout = new Readable({ read() {} });

  let closeHandler: ((code: number) => void) | null = null;

  const on = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    if (event === "close") {
      closeHandler = cb as (code: number) => void;
    }
    return mockProcess;
  });

  const kill = vi.fn();

  const mockProcess = {
    stdout: mockStdout,
    stdin: { write: vi.fn(), end: vi.fn() },
    stderr: { on: vi.fn() },
    on,
    kill,
    pid: 12345,
    _closeHandler: () => closeHandler,
    _triggerClose: (code: number) => {
      mockStdout.push(null);
      closeHandler?.(code);
    },
  };

  return mockProcess;
}

type MockProcess = ReturnType<typeof createMockProcess>;

describe("ClaudeAdapter", () => {
  let mockProcess: MockProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess = createMockProcess();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockProcess);
  });

  it("should spawn claude CLI with correct arguments", async () => {
    const adapter = new ClaudeAdapter({ cliPath: "claude" });
    const context = {
      conversationId: "conv-1",
      message: "Hello",
      history: [],
      agents: [],
    };

    // Push result event to end stream quickly
    mockProcess.stdout.push(
      JSON.stringify({ type: "result", result: "", session_id: "ses-1" }) + "\n",
    );

    const iterator = adapter.execute(context);
    // Consume the stream fully
    setTimeout(() => mockProcess._triggerClose(0), 10);
    for await (const _ of iterator) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--bare", "-p", "--output-format", "stream-json"]),
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  });

  it("should yield Text chunks from stdout stream-json events", async () => {
    const adapter = new ClaudeAdapter({ maxTurns: 10 });
    const context = {
      conversationId: "conv-1",
      message: "Hi",
      history: [],
      agents: [],
    };

    mockProcess.stdout.push(
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello " } },
      }) + "\n",
    );
    mockProcess.stdout.push(
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "World" } },
      }) + "\n",
    );
    mockProcess.stdout.push(
      JSON.stringify({ type: "result", result: "", session_id: "ses-123", usage: { input_tokens: 10, output_tokens: 5 } }) + "\n",
    );

    const iterator = adapter.execute(context);
    setTimeout(() => mockProcess._triggerClose(0), 10);

    const chunks: unknown[] = [];
    for await (const chunk of iterator) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({ type: ChunkType.Text, content: "Hello " });
    expect(chunks[1]).toMatchObject({ type: ChunkType.Text, content: "World" });
    expect(chunks[2]).toMatchObject({ type: ChunkType.Done });
  });

  it("should yield Error chunk on non-zero exit code", async () => {
    const adapter = new ClaudeAdapter();
    const context = {
      conversationId: "conv-1",
      message: "Hi",
      history: [],
      agents: [],
    };

    mockProcess.stdout.push(null);

    const iterator = adapter.execute(context);
    setTimeout(() => mockProcess._triggerClose(1), 10);

    const chunks: unknown[] = [];
    for await (const chunk of iterator) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]).toMatchObject({ type: ChunkType.Error });
  });

  it("should abort the process on abort()", async () => {
    const adapter = new ClaudeAdapter();
    const context = {
      conversationId: "conv-1",
      message: "Hi",
      history: [],
      agents: [],
    };

    // Push data so the generator will yield and thus start execution
    mockProcess.stdout.push(
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "a" } },
      }) + "\n",
    );

    const iterator = adapter.execute(context);

    // Advance the generator to trigger spawn + set this.process
    const firstResult = await iterator.next();

    // Generator should have started and spawn was called
    adapter.abort();
    expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");

    // Clean up — close the process
    setTimeout(() => mockProcess._triggerClose(0), 5);
    for await (const _ of iterator) {
      // drain
    }
  });

  it("should return healthy when claude --version succeeds", async () => {
    const versionProc = createMockProcess();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(versionProc);

    const adapter = new ClaudeAdapter();

    setTimeout(() => versionProc._triggerClose(0), 5);

    const result = await adapter.healthCheck();
    expect(result.status).toBe("healthy");
  });
});
