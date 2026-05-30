import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChunkType } from "@agenthub/shared";
import { OpenCodeAdapter } from "../adapters/opencode.adapter.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
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
    _triggerClose: (code: number) => {
      mockStdout.push(null);
      closeHandler?.(code);
    },
  };

  return mockProcess;
}

type MockProcess = ReturnType<typeof createMockProcess>;

describe("OpenCodeAdapter", () => {
  let mockProcess: MockProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess = createMockProcess();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockProcess);
  });

  it("should spawn opencode CLI with correct arguments", async () => {
    const adapter = new OpenCodeAdapter({
      model: "anthropic/claude-sonnet-4-6",
      cliPath: "opencode",
    });
    const context = {
      conversationId: "conv-1",
      message: "Hello",
      history: [],
      agents: [],
    };

    // End stream immediately with step_finish
    mockProcess.stdout.push(
      JSON.stringify({ type: "step_finish", tokens: {}, cost: 0 }) + "\n",
    );

    const iterator = adapter.execute(context);
    setTimeout(() => mockProcess._triggerClose(0), 10);

    for await (const _ of iterator) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["run", "--format", "json", "-m", "anthropic/claude-sonnet-4-6"]),
      expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
    );
  });

  it("should yield Text chunks from NDJSON events", async () => {
    const adapter = new OpenCodeAdapter();
    const context = {
      conversationId: "conv-1",
      message: "Hi",
      history: [],
      agents: [],
    };

    mockProcess.stdout.push(
      JSON.stringify({ type: "text", content: "Hello ", timestamp: 1712345678000, sessionID: "sess-1" }) + "\n",
    );
    mockProcess.stdout.push(
      JSON.stringify({ type: "text", content: "World", timestamp: 1712345679000, sessionID: "sess-1" }) + "\n",
    );
    mockProcess.stdout.push(
      JSON.stringify({ type: "step_finish", tokens: { input: 50, output: 20 }, cost: 0.001 }) + "\n",
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

  it("should yield Error chunk on non-zero exit", async () => {
    const adapter = new OpenCodeAdapter();
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

  it("should abort the process", async () => {
    const adapter = new OpenCodeAdapter();
    const context = {
      conversationId: "conv-1",
      message: "Hi",
      history: [],
      agents: [],
    };

    // Push data so the generator yields and starts execution
    mockProcess.stdout.push(
      JSON.stringify({ type: "text", content: "s", timestamp: 0, sessionID: "s" }) + "\n",
    );

    const iterator = adapter.execute(context);

    // Advance the generator to trigger spawn
    await iterator.next();

    adapter.abort();
    // On Windows, taskkill is used; on other platforms kill("SIGTERM") is called
    if (process.platform !== "win32") {
      expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
    }

    // Clean up
    setTimeout(() => mockProcess._triggerClose(0), 5);
    for await (const _ of iterator) {
      // drain
    }
  });

  it("should return healthy when opencode --version succeeds", async () => {
    const versionProc = createMockProcess();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(versionProc);

    const adapter = new OpenCodeAdapter();

    setTimeout(() => versionProc._triggerClose(0), 5);

    const result = await adapter.healthCheck();
    expect(result.status).toBe("healthy");
  });
});
