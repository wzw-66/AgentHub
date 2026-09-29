import type { MemoryRecord } from "@agenthub/shared";
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import type { EmbeddingProvider } from "./embedding.js";
import { fuseRankedLists } from "./fusion.js";
import { buildFtsQuery } from "./fts-query.js";
import { getMemoriesByIds } from "./repository.js";
import { buildScopeClause } from "./scope.js";
import { createJiebaSegmenter, type Segmenter } from "./segmenter.js";
import type { MemoryScope } from "./types.js";
import type { VectorIndex } from "./vector-index.js";
import { isBm25Ready } from "./worker.js";

/** 向量路的候选数。融合前每路各取这么多。 */
const LEG_CANDIDATES = 50;

/**
 * 低于该余弦相似度的向量结果被丢弃。
 *
 * 必要性：向量路对**任意**查询都会返回 top-k（暴力搜索总给出最近的 k 条）。
 * 会话作用域让候选集变小，**更容易「凑够」k 条无关记忆**（spec §7.5）。
 * 注入低相关记忆比不注入更糟 —— 浪费 token，且可能让 agent 产生错误确信。
 *
 * 具体取值留给 Spec 2 用消融实验标定（spec §16 第 1 条）。
 */
const DEFAULT_MIN_SIMILARITY = 0.35;

interface SearchDeps {
  segmenter: Segmenter;
  vectorIndex?: VectorIndex;
  embeddingProvider?: EmbeddingProvider;
  minSimilarity: number;
}

let deps: SearchDeps | undefined;

/**
 * 注入检索依赖。未调用时懒加载默认分词器，且向量路整体关闭。
 *
 * 用模块级注入而非函数参数，是为了让三个调用点（server 路由、orchestrator、
 * extractor）的签名保持简单 —— 它们关心的只有 query / userId / scope。
 *
 * 生产接线在 `apps/server/src/index.ts`：`vectorIndex` 与 `embeddingProvider`
 * 必须与嵌入 worker 用的是**同一个实例**，否则检索会去查一个 worker 从没写过的
 * 向量空间。`segmenter` 的一致性要求则是对**写入侧**而言的 —— 查询与写入必须用
 * 同一种切分，否则索引里的词项与查询切出的词项对不上（spec §8.3）。
 */
export function configureSearch(options: {
  segmenter: Segmenter;
  vectorIndex?: VectorIndex;
  embeddingProvider?: EmbeddingProvider;
  minSimilarity?: number;
}): void {
  deps = {
    segmenter: options.segmenter,
    ...(options.vectorIndex ? { vectorIndex: options.vectorIndex } : {}),
    ...(options.embeddingProvider ? { embeddingProvider: options.embeddingProvider } : {}),
    minSimilarity: options.minSimilarity ?? DEFAULT_MIN_SIMILARITY,
  };
}

/** 仅测试用：清空注入的依赖，回到默认状态。 */
export function resetSearchDepsForTesting(): void {
  deps = undefined;
}

function resolveDeps(): SearchDeps {
  if (!deps) {
    deps = { segmenter: createJiebaSegmenter(), minSimilarity: DEFAULT_MIN_SIMILARITY };
  }
  return deps;
}

interface SearchOptions {
  query: string;
  /** 必填 —— 租户边界（spec §4.8） */
  userId: string;
  /** 必填 —— 会话作用域（spec §1.1） */
  scope: MemoryScope;
  /** 可选 —— 仅供 Web UI 按 Agent 筛选 */
  agentId?: string;
  limit?: number;
  offset?: number;
}

/**
 * 双路混合检索：BM25 + 向量，用 RRF 融合。
 *
 * **必须异步** —— 内部需要一次 embedding 调用把 query 变成向量，这是 I/O。
 * 这不改变「检索 → 拼进提示词」的流程，调用方只是多了个 await（spec §6.3）。
 *
 * 降级：任一路失败都只让它自己变成空榜单，融合层没有降级分支（spec §5）——
 * 「缺失的榜单就是空集」这一条让 RRF 天然退化为另一路。
 */
export async function searchMemories(
  options: SearchOptions,
  customDb?: Database,
): Promise<MemoryRecord[]> {
  const db = customDb || getDatabase();
  const { segmenter, vectorIndex, embeddingProvider, minSimilarity } = resolveDeps();
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  // 两路都必须**出现在数组里**，失败的那一路是空榜单而不是被省略的槽位 ——
  // fusion 的契约是「缺失 = 空集」，靠省略表达会让下标错位。
  const bm25List = runBm25Leg(options, segmenter, db);
  const vectorList = await runVectorLeg(options, embeddingProvider, vectorIndex, minSimilarity);

  const fused = fuseRankedLists([bm25List, vectorList]);

  // ── 请求级过滤：user + scope + agentId，**一次性、对两路统一生效** ──────────
  //
  // agentId 只能在这里生效：向量路的 `filter` 是冻结的 `{ userId, scope }`
  // （spec §8.4），表达不了 agent；而 agentId 是 `searchMemories` 契约里保留的
  // 展示层筛选（spec §11，MemoryPanel 的「Agent: [全部 ▼]」）。只把它加在 BM25 路
  // 会让「按 Agent 筛选」漏出别的 agent 的记忆，还会让被过滤掉的 BM25 命中
  // 被未过滤的向量命中挤下去 —— 两路各自的过滤条件一旦分家就会漂移。
  //
  // 它同时是纵深防御：两路都已按 user/scope 过滤过，这里再查一次是防止将来
  // 某一 leg 的过滤被改错。位置在**切片之前** —— 被滤掉的条目必须由后面的条目
  // 补位，否则调用方拿到的是短页（filter 放在 slice 之后就会丢掉这个性质）。
  const allowed = allowedMemoryIds(options, db);
  const permitted = fused.filter((entry) => allowed.has(entry.memoryId));

  const page = permitted.slice(offset, offset + limit);
  if (page.length === 0) return [];

  // 回查完整记录，保持融合后的顺序
  return getMemoriesByIds(page.map((p) => p.memoryId), db);
}

/**
 * 本次请求允许出现的 id 全集：user + scope +（可选）agentId。
 *
 * 这是 agentId 的**唯一**生效点 —— 两路各加一次就会漂移，而向量路根本加不了。
 */
function allowedMemoryIds(options: SearchOptions, db: Database): Set<string> {
  const scope = buildScopeClause(options.scope);
  const conditions = ["r.user_id = ?", scope.sql];
  const values: unknown[] = [options.userId, ...scope.params];

  if (options.agentId) {
    conditions.push("r.agent_id = ?");
    values.push(options.agentId);
  }

  const rows = db
    .prepare(`SELECT id FROM memory_records r WHERE ${conditions.join(" AND ")}`)
    .all(...values) as Array<{ id: string }>;

  return new Set(rows.map((r) => r.id));
}

/** BM25 路：预分词 + OR 查询。任一步失败都返回空榜单，不影响向量路。 */
function runBm25Leg(
  options: SearchOptions,
  segmenter: Segmenter,
  db: Database,
): Array<{ memoryId: string }> {
  // 索引未就绪时**跳过**，而不是执行 MATCH 拿一个空榜单 ——
  // 「没有匹配」与「不可用」在 RRF 里表现相同，但语义完全不同（spec §7.7）。
  // 少了这条 warning，一次索引故障会以「没有相关记忆」的样子被读走。
  if (!isBm25Ready()) {
    console.warn("[memory] BM25 leg skipped: FTS index is not ready");
    return [];
  }

  try {
    const ftsQuery = buildFtsQuery(options.query, segmenter);
    if (ftsQuery === null) return [];

    // 作用域片段来自 `buildScopeClause`，它以 `r.` 为前缀 ——
    // 所以这里的别名必须是 `r`，与向量路共用同一份过滤实现（spec §8.4）。
    // agentId **不在这里**过滤：它由 `allowedMemoryIds` 对两路统一施加。
    const scope = buildScopeClause(options.scope);
    const conditions = ["r.user_id = ?", scope.sql];
    const values: unknown[] = [ftsQuery, options.userId, ...scope.params];

    const rows = db
      .prepare(`
        SELECT r.id FROM memory_fts fts
        JOIN memory_records r ON r.rowid = fts.rowid
        WHERE memory_fts MATCH ?
          AND ${conditions.join("\n          AND ")}
        ORDER BY rank
        LIMIT ?
      `)
      .all(...values, LEG_CANDIDATES) as Array<{ id: string }>;

    return rows.map((r) => ({ memoryId: r.id }));
  } catch (err) {
    console.error("[memory] BM25 leg failed, degrading to vector only:", err);
    return [];
  }
}

/** 向量路：查询向量化 + 暴力余弦。失败时返回空榜单，让 RRF 退化为纯 BM25。 */
async function runVectorLeg(
  options: SearchOptions,
  provider: EmbeddingProvider | undefined,
  index: VectorIndex | undefined,
  minSimilarity: number,
): Promise<Array<{ memoryId: string }>> {
  if (!provider || !index) return [];

  try {
    const queryVec = await provider.embedQuery(options.query);
    // 阈值在**融合之前**、只作用于向量路自己的名次上（spec §7.5）：
    // 放进融合层就变成了拿余弦去和 BM25 的量纲比，两边不可比。
    return index
      .search(queryVec, LEG_CANDIDATES, { userId: options.userId, scope: options.scope })
      .filter((hit) => hit.score >= minSimilarity)
      .map((hit) => ({ memoryId: hit.memoryId }));
  } catch (err) {
    console.error("[memory] Vector leg failed, degrading to BM25 only:", err);
    return [];
  }
}
