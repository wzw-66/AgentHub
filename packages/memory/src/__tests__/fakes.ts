import type { Segmenter } from "../segmenter.js";
import type { EmbeddingMode } from "../types.js";
import {
  buildFingerprint,
  normalize,
  assertFiniteVector,
  type EmbeddingProvider,
} from "../embedding.js";

/** 一段既非空白、也非 CJK 的连续字符（CJK Ext-A / 基本区 / 兼容区）。 */
const NON_CJK_RUN = /^[^\s㐀-䶿一-鿿豈-﫿]+/;

/**
 * 确定性分词器：按空格切分并保留整段。
 *
 * 所有非分词测试都用它，使测试不依赖 jieba 的词典 —— 否则 jieba 升级
 * 会导致大量无关测试结果漂移（spec §8.2）。
 *
 * 它的切分策略是「按空格 + 按已知词表最长匹配 + 兜底」，足以驱动 BM25 的往返测试。
 *
 * **兜底必须与 jieba 对齐**：词表没命中时，CJK 落成单字，非 CJK 则整段保留。
 * jieba 实测把 `"User prefers tabs"` 切成 `["User","prefers","tabs"]`，**不会**
 * 拆成字母；若这里按单字符切，索引里就是 `t a b s`，而查询侧（同一个假分词器）
 * 产出的却是 `tabs` —— 两端不一致，断言会因为「假分词器与真 jieba 行为不同」
 * 而失败，与业务逻辑无关。标点无需在这里切：unicode61 会再切一次。
 */
export class FakeSegmenter implements Segmenter {
  readonly id = "fake";

  constructor(private readonly vocabulary: string[] = []) {}

  cut(text: string): string[] {
    if (!text || text.trim().length === 0) return [];

    const terms: string[] = [];
    const sorted = [...this.vocabulary].sort((a, b) => b.length - a.length);
    let rest = text;

    outer: while (rest.length > 0) {
      if (/\s/.test(rest[0]!)) {
        rest = rest.slice(1);
        continue;
      }
      for (const word of sorted) {
        if (word.length > 0 && rest.startsWith(word)) {
          terms.push(word);
          rest = rest.slice(word.length);
          continue outer;
        }
      }
      const run = NON_CJK_RUN.exec(rest);
      if (run) {
        terms.push(run[0]);
        rest = rest.slice(run[0].length);
        continue;
      }
      terms.push(rest[0]!);
      rest = rest.slice(1);
    }

    return terms.filter((t) => t.trim().length > 0);
  }
}

/** 非对称实现下查询侧的前缀（E5 风格），文档侧不加。 */
export const FAKE_QUERY_PREFIX = "query: ";

/**
 * 确定性 embedding provider。
 *
 * 不依赖网络、不依赖真实模型 —— 用字符的 char code 累加进一个伪随机状态，
 * 同样的文本永远得到同样的向量（spec §13 的测试前提）。
 *
 * `mode: "asymmetric"` 时查询侧加 `FAKE_QUERY_PREFIX`、文档侧不加，两个方法
 * 因此走**不同的代码路径** —— 这是 spec §13 验收「接口确实不对称」的手段；
 * 若实现退化成单一的 `embed(text)`，同一段文本两侧的向量就会相同，测试会红。
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly id = "fake";
  readonly model: string;
  readonly dim: number;
  readonly mode: EmbeddingMode;
  readonly fingerprint: string;

  embeddedCount = 0;

  private readonly actualDim: number;
  private readonly injectNaN: boolean;
  private readonly failuresRemaining: number;
  private calls = 0;

  constructor(options: {
    dim: number;
    model?: string;
    mode?: EmbeddingMode;
    /** 故意返回错误长度，用于测试 dim 校验 */
    actualDim?: number;
    /** 故意返回 NaN，用于测试有限性校验 */
    injectNaN?: boolean;
    /** 前 N 次调用抛错，用于测试重试 */
    failuresRemaining?: number;
  }) {
    this.dim = options.dim;
    this.actualDim = options.actualDim ?? options.dim;
    this.injectNaN = options.injectNaN ?? false;
    this.failuresRemaining = options.failuresRemaining ?? 0;
    this.mode = options.mode ?? "symmetric";
    this.model = options.model ?? "fake-embedding";
    this.fingerprint = buildFingerprint(this.model, this.dim, this.mode);
  }

  private makeVector(text: string): Float32Array {
    const raw = new Float32Array(this.actualDim);
    let state = 2166136261;
    for (let i = 0; i < text.length; i++) {
      state = (state ^ text.charCodeAt(i)) * 16777619;
    }
    for (let i = 0; i < this.actualDim; i++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      raw[i] = (state / 0xffffffff) * 2 - 1;
    }
    if (this.injectNaN && this.actualDim > 0) raw[0] = NaN;
    return raw;
  }

  /** 查询侧的文本变换：只有非对称实现才与前缀有关。 */
  private queryText(text: string): string {
    return this.mode === "asymmetric" ? FAKE_QUERY_PREFIX + text : text;
  }

  private guard(vec: Float32Array, context: string): Float32Array {
    if (vec.length !== this.dim) {
      throw new Error(
        `Embedding dim mismatch: provider returned ${vec.length} but is configured for ${this.dim}`,
      );
    }
    assertFiniteVector(vec, context);
    return normalize(vec);
  }

  private maybeFail(): void {
    this.calls++;
    if (this.calls <= this.failuresRemaining) {
      throw new Error("FakeEmbeddingProvider: simulated failure");
    }
  }

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    this.maybeFail();
    const out = texts.map((t, i) => this.guard(this.makeVector(t), `doc[${i}]`));
    this.embeddedCount += texts.length;
    return out;
  }

  async embedQuery(text: string): Promise<Float32Array> {
    this.maybeFail();
    this.embeddedCount += 1;
    return this.guard(this.makeVector(this.queryText(text)), "query");
  }

  async healthCheck(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}
