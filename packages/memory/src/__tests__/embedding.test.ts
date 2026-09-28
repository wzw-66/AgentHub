import { describe, it, expect } from "vitest";
import { normalize, assertFiniteVector, buildFingerprint } from "../embedding.js";
import { FakeEmbeddingProvider } from "./fakes.js";

describe("normalize", () => {
  it("scales a vector to unit length", () => {
    const out = normalize(new Float32Array([3, 4]));
    const norm = Math.sqrt(out[0]! ** 2 + out[1]! ** 2);
    expect(norm).toBeCloseTo(1, 5);
    expect(out[0]).toBeCloseTo(0.6, 5);
    expect(out[1]).toBeCloseTo(0.8, 5);
  });

  it("makes the dot product equal the cosine similarity", () => {
    const a = normalize(new Float32Array([1, 2, 3]));
    const b = normalize(new Float32Array([4, 5, 6]));
    const dot = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

    const cos =
      (1 * 4 + 2 * 5 + 3 * 6) /
      (Math.sqrt(1 + 4 + 9) * Math.sqrt(16 + 25 + 36));
    expect(dot).toBeCloseTo(cos, 5);
  });

  it("returns an all-zero vector unchanged instead of producing NaN", () => {
    const out = normalize(new Float32Array([0, 0, 0]));
    expect([...out]).toEqual([0, 0, 0]);
  });
});

describe("assertFiniteVector", () => {
  it("accepts a finite vector", () => {
    expect(() => assertFiniteVector(new Float32Array([0.1, -0.2]), "test")).not.toThrow();
  });

  it("rejects NaN components", () => {
    expect(() => assertFiniteVector(new Float32Array([0.1, NaN]), "doc[3]")).toThrow(/doc\[3\]/);
  });

  it("rejects Infinity components", () => {
    expect(() => assertFiniteVector(new Float32Array([Infinity]), "doc[0]")).toThrow(/doc\[0\]/);
  });

  it("rejects -Infinity components", () => {
    expect(() => assertFiniteVector(new Float32Array([-Infinity]), "doc[0]")).toThrow(/doc\[0\]/);
  });
});

describe("buildFingerprint", () => {
  it("changes when the model changes", () => {
    expect(buildFingerprint("bge-m3", 1024, "symmetric"))
      .not.toBe(buildFingerprint("bge-large-zh", 1024, "symmetric"));
  });

  it("changes when the dimension changes for the same model", () => {
    expect(buildFingerprint("qwen3-embedding", 1024, "symmetric"))
      .not.toBe(buildFingerprint("qwen3-embedding", 4096, "symmetric"));
  });

  it("changes when the mode changes for the same model and dimension", () => {
    expect(buildFingerprint("bge-m3", 1024, "symmetric"))
      .not.toBe(buildFingerprint("bge-m3", 1024, "asymmetric"));
  });
});

describe("FakeEmbeddingProvider", () => {
  const provider = new FakeEmbeddingProvider({ dim: 4 });

  it("returns one vector per input document", async () => {
    const vecs = await provider.embedDocuments(["a", "b", "c"]);
    expect(vecs.length).toBe(3);
    for (const v of vecs) expect(v.length).toBe(4);
  });

  it("returns a single vector for embedQuery", async () => {
    const v = await provider.embedQuery("a");
    expect(v.length).toBe(4);
  });

  it("is deterministic — the same text yields the same vector", async () => {
    const [a] = await provider.embedDocuments(["same text"]);
    const [b] = await provider.embedDocuments(["same text"]);
    expect([...a!]).toEqual([...b!]);
  });

  it("is normalized, so dot product equals cosine", async () => {
    const [v] = await provider.embedDocuments(["anything"]);
    const norm = Math.sqrt([...v!].reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("can be configured to return a wrong dimension, to exercise the guard", async () => {
    const bad = new FakeEmbeddingProvider({ dim: 4, actualDim: 8 });
    await expect(bad.embedDocuments(["a"])).rejects.toThrow(/dim/i);
  });

  it("can be configured to return NaN, to exercise the guard", async () => {
    const nan = new FakeEmbeddingProvider({ dim: 4, injectNaN: true });
    await expect(nan.embedDocuments(["a"])).rejects.toThrow(/finite|NaN/i);
  });

  it("tracks how many documents it has embedded", async () => {
    const counting = new FakeEmbeddingProvider({ dim: 4 });
    await counting.embedDocuments(["a", "b"]);
    await counting.embedQuery("c");
    expect(counting.embeddedCount).toBe(3);
  });

  it("defaults to symmetric mode, where both sides agree", async () => {
    expect(provider.mode).toBe("symmetric");
    const [doc] = await provider.embedDocuments(["same text"]);
    const query = await provider.embedQuery("same text");
    expect([...query]).toEqual([...doc!]);
  });

  it("routes embedQuery and embedDocuments down different paths when asymmetric", async () => {
    const asym = new FakeEmbeddingProvider({ dim: 4, mode: "asymmetric" });

    expect(asym.mode).toBe("asymmetric");
    expect(asym.fingerprint).toBe("fake-embedding:4:asymmetric");

    // 查询侧带了前缀、文档侧没有 → 同一段文本两侧得到**不同**的向量。
    // 若实现退回成单一的 `embed(text)`，这条断言必然失败（spec §8.1 / §13）。
    const [doc] = await asym.embedDocuments(["数据库连接池"]);
    const query = await asym.embedQuery("数据库连接池");
    expect([...query]).not.toEqual([...doc!]);

    // 查询侧确实带前缀：与「前缀 + 文本」当作文档嵌入的结果一致。
    const [prefixed] = await asym.embedDocuments(["query: 数据库连接池"]);
    expect([...query]).toEqual([...prefixed!]);
  });

  it("reports a failing dimension on the asymmetric query path too", async () => {
    const asym = new FakeEmbeddingProvider({ dim: 4, mode: "asymmetric", actualDim: 8 });
    await expect(asym.embedQuery("a")).rejects.toThrow(/dim/i);
  });

  it("health check reports ok", async () => {
    await expect(provider.healthCheck()).resolves.toEqual({ ok: true });
  });
});
