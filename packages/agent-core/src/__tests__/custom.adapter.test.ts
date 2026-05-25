import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChunkType } from "@agenthub/shared";
import { CustomAgentAdapter } from "../adapters/custom.adapter.js";

describe("CustomAgentAdapter", () => {
  const config = {
    endpoint: "https://api.openai.com/v1/chat/completions",
    apiKey: "sk-test",
    model: "gpt-4o",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("should send POST to the configured endpoint", async () => {
    const adapter = new CustomAgentAdapter(config);
    const context = {
      conversationId: "conv-1",
      message: "Hello",
      history: [],
      agents: [],
    };

    // Mock a response that ends immediately
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const chunks: unknown[] = [];
    for await (const chunk of adapter.execute(context)) {
      chunks.push(chunk);
    }

    expect(fetch).toHaveBeenCalledWith(
      config.endpoint,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("should yield Text chunks from SSE stream", async () => {
    const adapter = new CustomAgentAdapter(config);
    const context = {
      conversationId: "conv-1",
      message: "Hello",
      history: [],
      agents: [],
    };

    const sseData = [
      'data: {"choices":[{"delta":{"content":"Hello "}}]}',
      'data: {"choices":[{"delta":{"content":"World"}}]}',
      "data: [DONE]",
    ].join("\n");

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseData));
        controller.close();
      },
    });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const chunks: unknown[] = [];
    for await (const chunk of adapter.execute(context)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]).toMatchObject({ type: ChunkType.Text, content: "Hello " });
    expect(chunks[1]).toMatchObject({ type: ChunkType.Text, content: "World" });
  });

  it("should yield Error chunk on HTTP error", async () => {
    const adapter = new CustomAgentAdapter(config);
    const context = {
      conversationId: "conv-1",
      message: "Hello",
      history: [],
      agents: [],
    };

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    const chunks: unknown[] = [];
    for await (const chunk of adapter.execute(context)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]).toMatchObject({ type: ChunkType.Error });
  });

  it("should abort via AbortController", async () => {
    const adapter = new CustomAgentAdapter(config);
    const context = {
      conversationId: "conv-1",
      message: "Hello",
      history: [],
      agents: [],
    };

    // Mock fetch to hang until aborted via signal
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, opts: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        });
      },
    );

    const iterator = adapter.execute(context);

    // Start consuming in background so the generator begins executing
    const consumePromise = (async () => {
      const chunks: unknown[] = [];
      for await (const chunk of iterator) {
        chunks.push(chunk);
      }
      return chunks;
    })();

    // Wait for the generator to start and call fetch
    await new Promise((r) => setTimeout(r, 10));

    // Abort — this should cause fetch to reject
    adapter.abort();

    const chunks = (await consumePromise) as Array<{ type: unknown }>;
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].type).toBe(ChunkType.Error);
  });

  it("should check health by sending a minimal request", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });

    const adapter = new CustomAgentAdapter(config);
    const result = await adapter.healthCheck();

    expect(result.status).toBe("healthy");
    expect(fetch).toHaveBeenCalledWith(
      config.endpoint,
      expect.objectContaining({
        body: expect.stringContaining("max_tokens"),
      }),
    );
  });

  it("should return unhealthy when health check fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    const adapter = new CustomAgentAdapter(config);
    const result = await adapter.healthCheck();

    expect(result.status).toBe("unhealthy");
  });
});
