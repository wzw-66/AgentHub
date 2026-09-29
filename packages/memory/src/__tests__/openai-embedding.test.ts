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

    const vecs = await provider.embedDocuments(["a", "b", "c"]);
    const [a, b, c] = vecs;

    expect([...a!]).toEqual([1, 0, 0]);
    expect([...b!]).toEqual([0, 1, 0]);
    expect([...c!]).toEqual([0, 0, 1]);

    // 结果数组必须是实心（dense）的。`map` 会跳过稀疏数组的空洞，
    // 空洞不进回调就等于绕过全部校验；`Array.from` 会把空洞显形为 undefined。
    expect(Array.from(vecs).every((v) => v instanceof Float32Array)).toBe(true);
  });

  it("rejects when the endpoint returns fewer entries than inputs", async () => {
    // 缺失项必须是错误，不能是空洞：空洞会被 map 跳过，于是既不校验 dim、
    // 也不校验有限性，而 undefined 会以 Float32Array[] 的类型混进写入路径。
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(makeResponse([[1, 0, 0]])) // 3 个输入只回了 1 个
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) }); // 一个都没回
    const provider = makeProvider({ dim: 3, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["a", "b", "c"])).rejects.toThrow(
      /missing an entry for input index 1/,
    );
    await expect(provider.embedDocuments(["a"])).rejects.toThrow(
      /missing an entry for input index 0/,
    );
  });

  it("rejects an out-of-range index instead of leaving holes", async () => {
    // 越界 index 会把结果数组**撑长**：对 3 个输入写 index 5，长度变 6，
    // 在 3、4 处留下新洞。`map` 跳过这些新洞，于是既不校验也不抛错，
    // 洞（= undefined）照样能走到写入路径 —— 与「少回一条」是同一种损坏，
    // 只是触发方式不同，所以必须在写入之前就按越界拒绝。
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { embedding: [1, 0, 0], index: 0 },
          { embedding: [0, 1, 0], index: 1 },
          { embedding: [0, 0, 1], index: 2 },
          { embedding: [0, 0, 1], index: 5 },
        ],
      }),
    });
    const provider = makeProvider({ dim: 3, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["a", "b", "c"])).rejects.toThrow(/index 5/);
  });

  it("rejects an index equal to the batch length (boundary)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0], [0, 1, 0]], [0, 2]));
    const provider = makeProvider({ dim: 3, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.embedDocuments(["a", "b"])).rejects.toThrow(/index 2/);
  });

  it("resolves a dense array with no undefined entries on the in-range path", async () => {
    // 反面对照：输入与 index 一一对应时必须实心。`Array.from` 会把洞显形为
    // undefined —— 裸 `.every()` 会跳过洞并因此为带洞数组放行，那正是最初
    // 漏掉这个 bug 的原因。
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([[1, 0, 0], [0, 1, 0], [0, 0, 1]]));
    const provider = makeProvider({ dim: 3, fetchImpl: fetchImpl as unknown as typeof fetch });

    const vecs = await provider.embedDocuments(["a", "b", "c"]);
    const dense = Array.from(vecs) as Array<Float32Array | undefined>;

    expect(dense).toHaveLength(3);
    expect(dense.some((v) => v === undefined)).toBe(false);
    expect(dense.every((v) => v instanceof Float32Array)).toBe(true);
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
    const long = "x".repeat(100_000);

    await expect(provider.embedDocuments([long])).rejects.toThrow(/400/);

    // 端点必须收到**完整**原文。只断言「抛了 400」是不够的：一个先截断、
    // 再把截断后的文本发出去（并因此仍然拿到 400）的实现会照样通过。
    // 断言请求体里是未截断的原文，截断才变得可检出。
    const [, init] = fetchImpl.mock.calls[0] as [string, { body: string }];
    const sent = JSON.parse(init.body) as { input: string[] };
    expect(sent.input).toEqual([long]);
    expect(sent.input[0]!.length).toBe(100_000);
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

  it("folds the prefix content into the fingerprint", async () => {
    // 旧指纹 `model:dim:mode` 分不清「前缀是什么」，于是改前缀既不报错也不重算，
    // 新旧前缀的向量永久混用（spec §6.2 一直没兑现的那一半）。
    expect(makeProvider().fingerprint).toBe("bge-m3:3:symmetric"); // 无前缀：逐字不变
    expect(makeProvider({ queryPrefix: "Q: " }).fingerprint).not.toBe("bge-m3:3:symmetric");
    expect(makeProvider({ queryPrefix: "Q: " }).fingerprint).not.toBe(
      makeProvider({ queryPrefix: "Q2: " }).fingerprint,
    );
    // 文档侧前缀同样要进指纹：只覆盖查询侧会让「改文档前缀」继续静默失效
    expect(makeProvider({ documentPrefix: "D: " }).fingerprint).not.toBe(
      makeProvider().fingerprint,
    );
    // 两侧调换必须得到不同的指纹 —— 拼串而非分别哈希就会在这里漏掉
    expect(makeProvider({ queryPrefix: "A: ", documentPrefix: "B: " }).fingerprint).not.toBe(
      makeProvider({ queryPrefix: "B: ", documentPrefix: "A: " }).fingerprint,
    );
    // 用空格当分隔符时这一对会碰撞（两解都是 "query:  passage: "），
    // 但它们施加在文本上的前缀并不相同、向量也不同 —— 指纹必须区分得开
    expect(
      makeProvider({ queryPrefix: "query: ", documentPrefix: "passage: " }).fingerprint,
    ).not.toBe(
      makeProvider({ queryPrefix: "query:", documentPrefix: " passage: " }).fingerprint,
    );
    // 空串前缀 == 未配置前缀（都是「不加前缀」，向量相同，指纹也必须相同）
    expect(makeProvider({ queryPrefix: "", documentPrefix: "" }).fingerprint).toBe(
      "bge-m3:3:symmetric",
    );
  });

  it("aborts a request that accepts the connection but never responds", async () => {
    // 模拟「接受连接后永不回应」的端点：真实 fetch 会尊重 init.signal，故这个假
    // fetch 也必须尊重。忽略 signal 的假 fetch 不是这个故障的模型 —— 它只会让
    // 本测试挂到 vitest 超时（证明的是测试写错了，不是被测行为）。
    const fetchImpl = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), {
            once: true,
          });
        }),
    );
    const provider = makeProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      // 测试缝：把 5 秒压到 20ms，用例不必真的等超时（生产不该改这个选项）
      requestTimeoutMs: 20,
    });

    await expect(provider.embedQuery("a")).rejects.toThrow(/timeout/i);

    // 请求必须**带上**一个 abort signal —— 没有它，永不回应的端点会把读路径
    // 挂到 undici 默认的 headersTimeout（约 5 分钟）
    const [, init] = fetchImpl.mock.calls[0] as [string, { signal?: AbortSignal }];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
