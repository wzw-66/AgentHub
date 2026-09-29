import type { EmbeddingMode } from "./types.js";

/**
 * 单次 embedding HTTP 请求的超时（毫秒）。
 *
 * **这不是可选的健壮性加固，而是读路径的正确性问题。** 检索在聊天关键路径上：
 * `routes/messages.ts` 在 `harness.execute(...)` 之前 await `buildMemoryContext`，
 * 而后者 await `embedQuery`。连接被**拒绝**（Ollama 没在跑）会快速失败并正确降级，
 * 已有测试覆盖；但一个**接受连接后永不回应**的端点会让读路径一直挂着，直到
 * undici 默认的 `headersTimeout`（约 5 分钟）。消息本身已落库、201 也照常返回
 * （执行是 fire-and-forget），所以可见症状是「agent 对每条消息都静默地永不回复」。
 *
 * 5000ms 对本地 Ollama 绰绰有余（毫秒级），也远在 spec §6.4 的延迟预算之内；
 * 超时后与其它 leg 失败同形：fetch reject → embed reject → `runVectorLeg` 捕获
 * → 空榜单 → RRF 退化为纯 BM25。
 */
const EMBEDDING_REQUEST_TIMEOUT_MS = 5_000;

/**
 * 向量空间的指纹。模型相同但维度、模式或**前缀内容**不同 → 向量不可混用。
 *
 * 这是**唯一**的向量失效判据。不能用 `model` 代替：Qwen3-Embedding 用同一
 * 模型名服务多个输出维度，只比 model 会让不同维度的向量混进同一个索引
 * 而不触发重算（spec §8.1）。
 */
export type EmbeddingFingerprint = string;

/**
 * 前缀内容的短指纹：把 `queryPrefix` 与 `documentPrefix` 两段一起哈希。
 * 两侧都为空（未配置前缀，即默认配置）时返回空串。
 *
 * **为什么前缀必须是指纹的一部分**：队列的判据是「没有一条指纹匹配的向量行」
 * （见 worker.ts 的 `PENDING_EMBEDDINGS_FROM`），而旧指纹 `model:dim:mode` 里
 * 不含前缀内容 —— `mode` 只区分 symmetric/asymmetric，区分不了**前缀是什么**。
 * 于是改一个前缀既不报错、也不重算：老文档带着旧前缀的向量继续匹配，
 * 新文档用新前缀，两套向量永久混在同一个索引里，召回率静默降一档 ——
 * 正是 spec §8.1 说的「不会报错，它只会安静地把召回率拉低一档」，
 * 也是 spec §6.2「维度或前缀模式变更同样自动作废」一直没兑现的那一半。
 *
 * 用 FNV-1a 32 位十六进制：稳定、短、零依赖。这里只需区分「前缀不同」，
 * 不需要密码学强度（前缀是操作者的配置，不是攻击面）。
 *
 * 两段用 **NUL** 拼接，不用空格：`E5` 风格的两个真实配置
 * `("query: ", "passage: ")` 与 `("query:", " passage: ")` 用空格拼接会得到
 * 完全相同的串（`"query:  passage: "`），而它们**施加在文本上的前缀并不相同**,
 * 向量也不同 —— 指纹一旦碰撞就等于回到「换了前缀不重算」的老毛病。shell 与
 * dotenv 都不可能让变量值含 NUL，故 NUL 是这里安全的定界符。
 */
export function prefixDigest(queryPrefix: string, documentPrefix: string): string {
  // 两侧都为空 ⇒ 空串，使默认配置的指纹与改造前**逐字相同**。
  if (queryPrefix === "" && documentPrefix === "") return "";

  let hash = 0x811c9dc5;
  const combined = `${queryPrefix}\u0000${documentPrefix}`;
  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * 构造指纹。
 *
 * 注意 `prefixDigest` 是第 4 个参数，**省略即「无前缀」**。调用方只要设了
 * `EMBEDDING_QUERY_PREFIX` / `EMBEDDING_DOCUMENT_PREFIX` 就必须传
 * `prefixDigest(query, document)`，否则前缀变更又不会触发重算 —— 两个构造点
 * 因此必须共用同一个 `prefixDigest`。
 *
 * **这是对 spec §8.1 的有意扩展，不是静默偏离。** §8.1 把签名写成
 * `${model}:${dim}:${mode}`，但 §6.2 又要求「维度或前缀模式变更同样自动作废」——
 * 后者靠前者无法兑现（`mode` 分不清前缀内容）。补上前缀分量恰恰是让 §6.2 成真的
 * 那个改动，故签名扩展是 spec 授权的，而非绕过 spec。
 *
 * **向后不兼容（有意的）**：任何已存库的、不含前缀分量的旧指纹都不再匹配新值。
 * 于是升级后会发生**一次全量重嵌** —— 这正是旧指纹没能触发的那次重嵌，
 * 是正确结果，不是副作用。
 */
export function buildFingerprint(
  model: string,
  dim: number,
  mode: EmbeddingMode,
  prefixDigestValue = "",
): EmbeddingFingerprint {
  // 无前缀时保持 `model:dim:mode` 原样：默认配置的指纹语义不变。
  return prefixDigestValue === ""
    ? `${model}:${dim}:${mode}`
    : `${model}:${dim}:${mode}:${prefixDigestValue}`;
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
  /**
   * 单次请求的超时（毫秒）。默认 `EMBEDDING_REQUEST_TIMEOUT_MS`。
   *
   * 这是**测试缝**：生产不该改它（5 秒的选择理由见常量本身）。测试把它压到
   * 毫秒级，才能在不真等 5 秒的前提下断言「挂住的端点会被超时切断并降级」。
   */
  requestTimeoutMs?: number;
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
  const requestTimeoutMs = options.requestTimeoutMs ?? EMBEDDING_REQUEST_TIMEOUT_MS;

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
      // 「接受连接后永不回应」的端点会把整条读路径挂住（见常量说明）。超时后
      // fetch 以 TimeoutError 拒绝，与其它失败同形，由 runVectorLeg 捕获成空榜单。
      signal: AbortSignal.timeout(requestTimeoutMs),
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
      // 越界下标同样能造出空洞，而且绕开上面的缺失项校验：对 3 个输入写
      // `ordered[5]` 会把长度撑到 6，在 3、4 处留下**新**洞；`map` 跳过这些
      // 新洞、既不校验也不抛错，undefined 照样走到写入路径 —— 与「少回一条」
      // 是同一种损坏，只是触发方式不同。所以越界必须在写入**之前**拦下。
      if (target < 0 || target >= texts.length) {
        throw new Error(
          `Embedding response for model "${options.model}" has an out-of-range index ${target} ` +
            `for a batch of ${texts.length} input(s) — the endpoint returned a malformed response.`,
        );
      }
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
    fingerprint: buildFingerprint(
      options.model,
      options.dim,
      mode,
      prefixDigest(options.queryPrefix ?? "", options.documentPrefix ?? ""),
    ),

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
