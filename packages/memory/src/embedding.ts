import type { EmbeddingMode } from "./types.js";

/**
 * 向量空间的指纹。模型相同但维度或前缀模式不同 → 向量不可混用。
 *
 * 这是**唯一**的向量失效判据。不能用 `model` 代替：Qwen3-Embedding 用同一
 * 模型名服务多个输出维度，只比 model 会让不同维度的向量混进同一个索引
 * 而不触发重算（spec §8.1）。
 */
export type EmbeddingFingerprint = string;

export function buildFingerprint(
  model: string,
  dim: number,
  mode: EmbeddingMode,
): EmbeddingFingerprint {
  return `${model}:${dim}:${mode}`;
}

/**
 * 向量化提供方。
 *
 * **接口刻意是不对称的**：`embedDocuments` 给索引侧、`embedQuery` 给查询侧。
 * 只有单一的 `embed(texts)` 会让「可插拔」在最有价值的那类模型上恰好失效 ——
 * 相当一部分检索模型要求查询与文档用不同方式嵌入：bge-*-zh 系查询侧必须加
 * `为这个句子生成表示以用于检索相关文章：`，E5 系用 `query:`/`passage:`，
 * `jina-embeddings-v3` 用请求体的 `task` 参数，Cohere v4 用 `input_type`。
 * 忘加前缀**不会报错**，它只会安静地把召回率拉低一档（spec §8.1）。
 *
 * 把不对称性放进接口后，各实现自己决定加不加前缀，检索层与 worker 无感：
 * 即使 `mode` 是 `symmetric`，检索层也永远调 `embedQuery`、worker 永远调
 * `embedDocuments`，所以将来换成非对称模型时调用方一行都不用改。
 *
 * 实现约定：返回的向量**必须已归一化为单位长度**（用 `normalize`），
 * 这样余弦相似度等于点积，向量路的距离计算退化成一重循环。
 */
export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dim: number;
  readonly mode: EmbeddingMode;
  readonly fingerprint: EmbeddingFingerprint;

  /** 索引侧：记忆正文与 tags。worker 批量调用。 */
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
  /** 查询侧：用户查询。检索时调用。 */
  embedQuery(text: string): Promise<Float32Array>;

  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

/**
 * 把向量缩放到单位长度，使余弦相似度**等于**点积。
 *
 * 后果是向量路的距离计算退化成一重循环，省掉每对向量的两次开方（spec §8.1）。
 *
 * 全零向量原样返回：不能走 `1 / sqrt(0) = Infinity` 把它变成 `NaN`，
 * 否则一个合法的退化输入会污染整个索引的排序。
 */
export function normalize(vec: Float32Array): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < vec.length; i++) sumSquares += vec[i]! * vec[i]!;

  if (sumSquares === 0) return vec; // 全零向量：保持原样，避免 0/0 = NaN

  const inv = 1 / Math.sqrt(sumSquares);
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i]! * inv;
  return out;
}

/**
 * 拒绝 NaN / Inf 向量。**必须在 `normalize` 之前调用**。
 *
 * **这不是通用的健壮性加固，而是 `bge-m3` + Ollama 的已知缺陷所要求的**
 * （issue #14657：对某些技术文档返回 NaN，spec §10.1）。NaN 会一路静默通过：
 * 长度校验通过（NaN 也是合法 float32）、归一化得 NaN、写库成功、
 * 点积传播为 NaN、`sort` 比较返回 false → 该条位次任意且不抛错。
 *
 * 「向量算不出来」必须表现为「这条记忆暂时只在 BM25 榜单里」，
 * 而不是「这条记忆带毒进入向量索引」—— 调用方捕获本错误后应丢弃该条并按失败计数。
 */
export function assertFiniteVector(vec: Float32Array, context: string): void {
  for (let i = 0; i < vec.length; i++) {
    if (!Number.isFinite(vec[i]!)) {
      throw new Error(
        `Embedding contains a non-finite value at ${context}[${i}] (= ${vec[i]}). ` +
          `The provider may be misconfigured, or hitting a known model bug.`,
      );
    }
  }
}

export interface OpenAICompatibleEmbeddingOptions {
  /** 端点根，例如 "http://127.0.0.1:11434/v1"。代码会拼上 "/embeddings"。 */
  baseUrl: string;
  /** Ollama 不校验 key，但传空串会让部分客户端报错 —— 用 "EMPTY"。 */
  apiKey: string;
  model: string;
  /** 期望维度。会与端点实际返回的长度校验，不符即抛错（spec §8.1）。 */
  dim: number;
  mode?: EmbeddingMode;
  /** MRL 降维参数，仅部分模型支持（如 Qwen3 系）。不传则用模型原生维度。 */
  dimensions?: number;
  /** 非对称模型的查询侧前缀。`bge-m3` 不需要。 */
  queryPrefix?: string;
  /** 非对称模型的文档侧前缀。 */
  documentPrefix?: string;
  /** 注入点，仅测试用。 */
  fetchImpl?: typeof fetch;
}

interface EmbeddingApiResponse {
  data: Array<{ embedding: number[]; index?: number }>;
}

/**
 * OpenAI 兼容的 embedding provider。
 *
 * Ollama 的 `/v1/embeddings` 就是 OpenAI 格式，所以本地部署 bge-m3 时
 * 这个实现一行都不用改，只换配置（spec §10.1）。
 *
 * - **不内部重试** —— 重试策略统一由 worker 与检索层决定（spec §8.1）
 * - **按 `data[].index` 对齐** —— OpenAI 兼容层不保证返回顺序与 input 一致
 * - **校验 dim 与有限性** —— 两者都是静默数据损坏点（spec §8.1）
 */
export function createOpenAICompatibleEmbeddingProvider(
  options: OpenAICompatibleEmbeddingOptions,
): EmbeddingProvider {
  const mode: EmbeddingMode = options.mode ?? "symmetric";
  const doFetch = options.fetchImpl ?? fetch;
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/embeddings`;

  /** `label` 只用于非有限值报错里的定位（`doc[2]` / `query[0]`）。 */
  async function embed(texts: string[], label: "doc" | "query" | "health" = "doc"): Promise<Float32Array[]> {
    const body: Record<string, unknown> = { model: options.model, input: texts };
    if (options.dimensions !== undefined) body["dimensions"] = options.dimensions;

    const response = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = typeof response.text === "function" ? await response.text() : "";
      throw new Error(
        `Embedding request failed: HTTP ${response.status} from ${endpoint}${detail ? ` — ${detail}` : ""}`,
      );
    }

    const payload = (await response.json()) as EmbeddingApiResponse;

    // 按 index 对齐，不依赖数组顺序。
    //
    // 必须**填实**每个槽位：`new Array(n)` 是稀疏数组，而 `Array.prototype.map`
    // 会跳过空洞、不调用回调 —— 那样下面的缺失项校验就成了死代码，端点少回
    // 一条时既不校验也不抛错，而是返回带洞的数组，`undefined` 直接混进写入路径。
    const ordered = new Array<Float32Array | undefined>(texts.length).fill(undefined);
    payload.data.forEach((item, position) => {
      const target = item.index ?? position;
      ordered[target] = Float32Array.from(item.embedding);
    });

    return ordered.map((vec, i) => {
      if (!vec) {
        throw new Error(
          `Embedding response for model "${options.model}" is missing an entry for input index ${i}.`,
        );
      }
      if (vec.length !== options.dim) {
        throw new Error(
          `Embedding dim mismatch for model "${options.model}": the endpoint returned ` +
            `${vec.length}-dimensional vectors but this provider is configured for dim=${options.dim}. ` +
            `Fix the configuration — the read path parses dim floats, so a mismatch would ` +
            `silently truncate the stored vector.`,
        );
      }
      // 必须在 normalize 之前：NaN 能原样穿过 normalize，之后再也认不出来。
      assertFiniteVector(vec, `${label}[${i}]`);
      return normalize(vec);
    });
  }

  return {
    id: "openai-compatible",
    model: options.model,
    dim: options.dim,
    mode,
    fingerprint: buildFingerprint(options.model, options.dim, mode),

    async embedDocuments(texts: string[]): Promise<Float32Array[]> {
      const prefix = options.documentPrefix ?? "";
      return embed(texts.map((t) => `${prefix}${t}`));
    },

    async embedQuery(text: string): Promise<Float32Array> {
      const prefix = options.queryPrefix ?? "";
      const [vec] = await embed([`${prefix}${text}`], "query");
      if (!vec) throw new Error("Embedding request returned no vector for the query");
      return vec;
    },

    async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
      try {
        await embed(["health"], "health");
        return { ok: true };
      } catch (err) {
        return { ok: false, detail: (err as Error).message };
      }
    },
  };
}
