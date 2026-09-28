import { describe, it, expect, vi } from "vitest";
import { createOpenAICompatibleEmbeddingProvider } from "../embedding.js";

function makeResponse(vectors: number[][], indices?: number[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: vectors.map((embedding, i) => ({ embedding, index: indices?.[i] ?? i })),
    }),
  };
}

function makeProvider(
  overrides: Partial<Parameters<typeof createOpenAICompatibleEmbeddingProvider>[0]> = {},
) {
  return createOpenAICompatibleEmbeddingProvider({
    baseUrl: "http://127.0.0.1:11434/v1",
    apiKey: "EMPTY",
    model: "bge-m3",
    dim: 3,
    ...overrides,
  });
}

describe("createOpenAICompatibleEmbeddingProvider", () => {
  it("posts to {baseUrl}/embeddings with model and input", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0], [0, 1, 0]]));
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await provider.embedDocuments(["a", "b"]);

    const [url, init] = fetchImpl.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("http://127.0.0.1:11434/v1/embeddings");
    expect(JSON.parse(init.body)).toEqual({ model: "bge-m3", input: ["a", "b"] });
    expect(init.headers["Authorization"]).toBe("Bearer EMPTY");
  });

  it("strips trailing slashes from baseUrl", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0]]));
    const provider = makeProvider({ baseUrl: "http://127.0.0.1:11434/v1///", fetchImpl: fetchImpl as unknown as typeof fetch });

    await provider.embedQuery("a");

    expect(fetchImpl.mock.calls[0]![0]).toBe("http://127.0.0.1:11434/v1/embeddings");
  });

  it("aligns results by data[].index, not by array position", async () => {
    // 服务端把两段文本的结果**反序**返回 —— OpenAI 兼容层不保证顺序
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { embedding: [0, 1, 0], index: 1 },
          { embedding: [1, 0, 0], index: 0 },
        ],
      }),
    });
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const [first, second] = await provider.embedDocuments(["first", "second"]);

    // "first" 应当拿到 index 0 的向量 [1,0,0]（归一化后仍是 [1,0,0]）
    expect([...first!]).toEqual([1, 0, 0]);
    expect([...second!]).toEqual([0, 1, 0]);
  });

  it("aligns a three-item shuffled batch by index", async () => {
    // 位次是任意排列、且与 input 顺序不同 —— 按数组位置对齐的实现必然错配。
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { embedding: [0, 0, 1], index: 2 },
          { embedding: [1, 0, 0], index: 0 },
          { embedding: [0, 1, 0], index: 1 },
        ],
      }),
    });
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const [a, b, c] = await provider.embedDocuments(["a", "b", "c"]);

    expect([...a!]).toEqual([1, 0, 0]);
    expect([...b!]).toEqual([0, 1, 0]);
    expect([...c!]).toEqual([0, 0, 1]);
  });

  it("rejects when the endpoint returns a different dimension than configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0, 0, 0]]));
    const provider = makeProvider({ dim: 3, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["a"])).rejects.toThrow(/dim/i);
  });

  it("validates the dimension on every call, not only the first", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(makeResponse([[1, 0, 0]]))
      .mockResolvedValueOnce(makeResponse([[1, 0, 0, 0, 0]]));
    const provider = makeProvider({ dim: 3, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedQuery("a")).resolves.toBeInstanceOf(Float32Array);
    await expect(provider.embedQuery("b")).rejects.toThrow(/dim/i);
  });

  it("rejects NaN vectors instead of letting them reach the index", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[NaN, 0, 0]]));
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["a"])).rejects.toThrow(/non-finite/i);
  });

  it("throws on a non-2xx response with the status in the message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "model not found",
    });
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["a"])).rejects.toThrow(/404/);
  });

  it("does not retry internally — the caller owns retry policy", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["a"])).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces over-long input as an error instead of storing a truncated vector", async () => {
    // bge-m3 的上下文窗口是 8192 token。超长输入时端点返回 4xx。
    // 期望：抛错 → 调用方按失败处理 → 不写库、下轮重试。
    // **绝不能**静默截断出一个与原文不符的向量 —— 那会让检索结果错误但无声。
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "input length exceeds maximum context length",
    });
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["x".repeat(100_000)])).rejects.toThrow(/400/);
  });

  it("applies a query prefix in asymmetric mode but not to documents", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0]]));
    const provider = makeProvider({
      mode: "asymmetric",
      queryPrefix: "为这个句子生成表示以用于检索相关文章：",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.embedQuery("缩进");

    const body = JSON.parse((fetchImpl.mock.calls[0] as [string, { body: string }])[1].body);
    expect(body.input).toEqual(["为这个句子生成表示以用于检索相关文章：缩进"]);
  });

  it("does not apply the query prefix to documents", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0]]));
    const provider = makeProvider({
      mode: "asymmetric",
      queryPrefix: "QUERY: ",
      documentPrefix: "PASSAGE: ",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.embedDocuments(["缩进"]);

    const body = JSON.parse((fetchImpl.mock.calls[0] as [string, { body: string }])[1].body);
    expect(body.input).toEqual(["PASSAGE: 缩进"]);
  });

  it("passes dimensions only when configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0]]));

    const without = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await without.embedQuery("a");
    const bodyA = JSON.parse((fetchImpl.mock.calls[0] as [string, { body: string }])[1].body);
    expect(bodyA.dimensions).toBeUndefined();

    const withDims = makeProvider({ dimensions: 3, fetchImpl: fetchImpl as unknown as typeof fetch });
    await withDims.embedQuery("a");
    const bodyB = JSON.parse((fetchImpl.mock.calls[1] as [string, { body: string }])[1].body);
    expect(bodyB.dimensions).toBe(3);
  });

  it("normalizes returned vectors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[3, 4, 0]]));
    const provider = makeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const v = await provider.embedQuery("a");

    expect(Math.sqrt([...v].reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 5);
  });

  it("reports a fingerprint that varies with model, dim and mode", async () => {
    const base = makeProvider();
    expect(base.fingerprint).toBe("bge-m3:3:symmetric");
    expect(makeProvider({ mode: "asymmetric" }).fingerprint).toBe("bge-m3:3:asymmetric");
    expect(makeProvider({ dim: 4 }).fingerprint).toBe("bge-m3:4:symmetric");
  });
});
