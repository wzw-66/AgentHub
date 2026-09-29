import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import type { Segmenter } from "./segmenter.js";
import type { EmbeddingProvider } from "./embedding.js";
import type { VectorIndex } from "./vector-index.js";

/**
 * 期望中「启动期最多为索引重建等多久」（spec §9.4）。
 *
 * **它目前约束不了实际耗时。** `reindexMemories` 是同步的（better-sqlite3 的事务
 * 不能跨 `await`），定时器抢不赢一个不交还事件循环的调用：这次调用要么已经完成、
 * 要么已经抛出，不存在「超时了但仍在后台跑」的中间态。调用方的 `Promise.race`
 * 因此只是把「失败」与「超时」收敛到同一条降级路径，并没有实施真正的截止时间。
 * 要让这个值咬得住，得先让重建变得可中断/异步（分块提交，或挪到别的线程）——
 * 把同步事务从中间打断只会整段回滚，等于零进度。
 *
 * 取值本身也是拍脑袋定的（spec §15 第 13 条），取决于记忆表规模与分词吞吐：
 * 太短会让服务带着不可用的 BM25 启动，太长则启动被拖住。
 */
export const REINDEX_TIMEOUT_MS = 30_000;

let bm25Ready = false;

/**
 * BM25 路的就绪标志。
 *
 * 迁移会 DROP 并重建 `memory_fts`，此后索引为空而 `memory_records` 有数据。
 * 在这个窗口内 `MATCH` 会**静默返回 0 行**，RRF 会把「索引故障」当成
 * 「没有匹配」—— 故障被吞掉（spec §7.7）。
 *
 * 主路径下这个标志恒为 true：`reindexMemories` 在 `listen()` 之前 await 完成。
 * 它服务于「库太大、重建超时」的兜底路径。
 */
export function isBm25Ready(): boolean {
  return bm25Ready;
}

/** 仅测试用：直接摆布标志位，免得为了构造「已就绪」状态真的跑一次重建。 */
export function setBm25ReadyForTesting(ready: boolean): void {
  bm25Ready = ready;
}

interface TriggerRow {
  name: string;
  sql: string;
}

/**
 * 把 `tags` JSON 数组切成词项。解析失败按「没有 tags」处理 —— 迁移可能面对
 * 手写或历史遗留的行，一条烂数据不该让整个重建失败（那样 BM25 会永久不可用）。
 */
function segmentTags(raw: string, segmenter: Segmenter): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "";
  }
  if (!Array.isArray(parsed)) return "";
  return parsed
    .filter((tag): tag is string => typeof tag === "string")
    .flatMap((tag) => segmenter.cut(tag))
    .join(" ");
}

/**
 * 回填 `content_seg` / `tags_seg`，然后重建 FTS 索引。
 *
 * 只处理 DDL 迁移做不到的数据部分 —— 迁移负责结构与索引定义，这里负责灌数据
 * （spec §9.4）。可重入：只回填 `content_seg IS NULL` 的行。
 *
 * **必须在 `listen()` 之前 await 完成**：迁移重建出来的 `memory_fts` 是空的，
 * 这个「索引未就绪」的窗口只有靠这里的一次 `rebuild` 才能关掉。
 *
 * @throws 重建失败时抛出，且保持 `isBm25Ready() === false` —— 调用方据此降级为
 *   纯向量路，不要让它静默。
 */
export function reindexMemories(
  segmenter: Segmenter,
  customDb?: Database,
): { backfilled: number } {
  const db = customDb || getDatabase();

  // 标志随本次重建走：开始时降下，成功才升起。于是「失败」天然留下 false，
  // 调用方不需要额外调一个测试专用的 setter 来表达降级（spec §7.7）。
  bm25Ready = false;

  const run = db.transaction((): number => {
    const pending = db
      .prepare("SELECT id, content, tags FROM memory_records WHERE content_seg IS NULL")
      .all() as Array<{ id: string; content: string; tags: string }>;

    // ── 为什么回填期间要摘掉触发器 ────────────────────────────────────────────
    // 迁移刚 DROP/重建了 `memory_fts`：索引是**空**的，而 `memory_records` 有数据。
    // 此时对**已存在**的行做 UPDATE，`au` 触发器里的 'delete' 命令会发现索引里
    // 没有这个 rowid，FTS5 直接报 SQLITE_CORRUPT_VTAB（"database disk image is
    // malformed"）。这不是用法错误，而是外部内容表的一致性检查；新 INSERT 不受影响，
    // 所以它**只在老库上**出现 —— 空库上跑得通，上了真实数据才炸。
    //
    // 因此顺序是「摘触发器 → 回填 → rebuild → 复原触发器」：回填只写表，最后由
    // 一次 `rebuild` 把索引整体从表重建出来。跑完索引是表的派生物，不依赖触发器
    // 逐行正确，也不会把「索引与表不一致」的中间状态留给后续写入。
    //
    // 触发器 SQL 从 `sqlite_master` 原样取回再原样执行，不在本文件里重写一份 ——
    // 触发器是**迁移**的产物，这里只借用一下，避免两处定义漂移。
    const triggers = db
      .prepare(
        `SELECT name, sql FROM sqlite_master
         WHERE type = 'trigger' AND tbl_name = 'memory_records' AND name LIKE 'mem_fts_%' AND sql IS NOT NULL`,
      )
      .all() as TriggerRow[];
    for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name}"`);

    const update = db.prepare(
      "UPDATE memory_records SET content_seg = ?, tags_seg = ? WHERE id = ?",
    );
    for (const row of pending) {
      update.run(segmenter.cut(row.content).join(" "), segmentTags(row.tags, segmenter), row.id);
    }

    // external-content FTS5 表在内容变更后必须 rebuild
    db.prepare("INSERT INTO memory_fts(memory_fts) VALUES('rebuild')").run();

    for (const trigger of triggers) db.exec(trigger.sql);

    return pending.length;
  });

  const backfilled = run();
  bm25Ready = true;

  return { backfilled };
}

/** 一条待嵌入记忆：worker 需要的只有 id 与正文（`upsert` 前不需要读整行）。 */
interface PendingEmbedding {
  id: string;
  content: string;
}

/**
 * 队列的**唯一定义**：列表与计数共用同一段 SQL，两处判据不可能漂移。
 *
 * `fingerprint` 是**空安全**的：省略（绑定 NULL）时 `e.fingerprint != NULL`
 * 求值为 NULL（即假），于是「没有向量行」成为唯一判据 —— 否则一个只想知道
 * 「还有多少条没算过向量」的调用方会永远看到非零积压。
 */
const PENDING_EMBEDDINGS_FROM = `
  FROM memory_records r
  LEFT JOIN memory_embeddings e ON e.memory_id = r.id
  WHERE e.memory_id IS NULL OR e.fingerprint != ?
`;

/**
 * 待嵌入队列 —— **它就是一个 LEFT JOIN，没有状态列**（spec §6.2）。
 *
 * 「待嵌入」不是某个列上的状态，而是「没有一条指纹匹配的向量行」。这样做的
 * 好处：没有状态机可以写错、天然自愈（worker 崩了重启即可，行没了就再入队）、
 * 且 `fingerprint` 变更（换模型 / 换维度 / 换前缀模式）会**自动**让旧向量作废
 * 重算 —— 队列的前进判据与失效判据是同一个值，不可能漂移。
 *
 * 用 `fingerprint` 而不是 `model` 做判据是必需的：Qwen3-Embedding 用同一个
 * 模型名服务多个输出维度，只比 `model` 会让不同维度的向量混进同一个索引而不
 * 触发重算（spec §8.1）。
 *
 * `limit` **在 SQL 里生效**（spec §6.2 的 `LIMIT batchSize`）。必须如此：取回整条
 * 积压再在 JS 里切片，意味着每轮都把全部待嵌入行的 `content` 物化进 JS 堆、还要
 * 对全量结果排序，才做 O(batchSize) 的工作 —— 首次回填时整体退化成 O(N²)。
 */
export function listPendingEmbeddings(
  customDb?: Database,
  fingerprint?: string,
  limit?: number,
): Array<{ id: string; content: string }> {
  const db = customDb || getDatabase();
  const sql = `SELECT r.id, r.content ${PENDING_EMBEDDINGS_FROM} ORDER BY r.created_at ASC`;
  const params: unknown[] = [fingerprint ?? null];

  // 不给 limit 时不拼 LIMIT：调用方（回填 CLI、可观测性）可能确实要全量。
  if (limit === undefined) {
    return db.prepare(sql).all(...params) as Array<{ id: string; content: string }>;
  }
  params.push(limit);
  return db.prepare(`${sql} LIMIT ?`).all(...params) as Array<{
    id: string;
    content: string;
  }>;
}

/** 队列长度。与 `listPendingEmbeddings` 共用同一段 WHERE，两者不可能给出不同答案。 */
export function pendingEmbeddingCount(customDb?: Database, fingerprint?: string): number {
  const db = customDb || getDatabase();
  const row = db
    .prepare(`SELECT COUNT(*) AS count ${PENDING_EMBEDDINGS_FROM}`)
    .get(fingerprint ?? null) as { count: number };
  return row.count;
}

/**
 * 后台嵌入 worker：把待嵌入队列一批批喂给 `EmbeddingProvider`，写进 `VectorIndex`。
 *
 * 写入路径**不碰** embedding 服务（`createMemory` 恒不调用它），所以向量算不出来
 * 只会让这条记忆暂时只出现在 BM25 榜单里，不会让记忆本身写不进去（spec §6.2）。
 *
 * `runOnce()` 导出给测试与一次性回填用；正常运行时它也由内部定时器驱动。
 * **嵌入失败不会抛出**：计入 `failed`、下轮重试；只有数据库层面的意外错误才会
 * 冒泡（定时器回调会接住并记日志，循环不会因此死掉）。
 */
export function startEmbeddingWorker(opts: {
  provider: EmbeddingProvider;
  index: VectorIndex;
  /** 默认 32 */
  batchSize?: number;
  /** 默认 5000ms；传 0 表示只手动 runOnce()，不自动轮询 */
  intervalMs?: number;
  /** 注入点：不传则用模块级 SQLite 单例。测试传临时库。 */
  db?: Database;
}): {
  stop(): void;
  runOnce(): Promise<{ processed: number; failed: number }>;
  pendingCount(): number;
} {
  const batchSize = opts.batchSize ?? 32;
  const intervalMs = opts.intervalMs ?? 5000;
  const db = opts.db;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  /**
   * 至多一轮在飞（spec §8.6 的 `maxConcurrentBatches` 默认 1）。
   *
   * 一轮 32 条在 CPU 上跑 Ollama 很容易超过 5 秒，而**在写库之前队列不会推进**，
   * 于是「每 5 秒开一轮」会变成 N 个并发请求重复嵌入同一批行：积压一点没少，
   * 本地推理进程先被打满。跳过与在飞轮重叠的 tick 即可。
   */
  let running = false;

  /**
   * 嵌入一批文本，返回与入参等长的数组；失败的位置是 `undefined`。
   *
   * ── 为什么要逐条回退 ────────────────────────────────────────────────────
   * spec §13 要求「一条坏向量不写库、计入失败计数、不影响同批其他条」，但接口
   * `embedDocuments(texts): Promise<Float32Array[]>` **没有逐条失败通道**：只要
   * 有一条要炸，整个 promise 就 reject（spec §8.1 固定了签名，不能改）。所以
   * 「不影响同批其他条」只能靠**行为**实现：整批 reject 时把这一批拆成单条重试，
   * 健康条目照常落库，只有真正坏的那条计入失败。
   *
   * 触发场景是具体的：`bge-m3` + Ollama 对某些技术文档返回 NaN（issue #14657），
   * 而技术文档正是本项目的文档类别，`assertFiniteVector` 会拒收这些向量。
   *
   * ── 成本上界 ────────────────────────────────────────────────────────────
   * 最坏 1 次整批 + N 次单条 = N+1 次调用，即 2 倍工作量 —— 不会退化成「每条都
   * 重取整批」的二次方。端点整体不可用时这 N 次单条调用是纯粹的浪费，但无法在
   * 调用方区分「整批挂」与「单条毒」，且下一轮仍从整批开始重试。
   */
  async function embedBatch(
    items: PendingEmbedding[],
  ): Promise<Array<Float32Array | undefined>> {
    try {
      const vectors = await opts.provider.embedDocuments(items.map((item) => item.content));
      if (vectors.length === items.length) return vectors;
      // 接口承诺「一进一出」。少回/多回条时不能把 `undefined`（数组空洞）静默
      // 混进写入路径 —— 走与整批 reject 相同的回退路径，让能救的条目被救回来。
      console.error(
        `[memory] embedding provider returned ${vectors.length} vectors for ` +
          `${items.length} input(s); falling back to per-item embedding`,
      );
    } catch (err) {
      console.error("[memory] embedding batch failed, falling back to per-item:", err);
    }

    const out: Array<Float32Array | undefined> = items.map(() => undefined);

    // 单条时「整批调用」就是「逐条调用」，立刻原样重试没有意义（只是把一次失败
    // 变成两次），下一轮定时器会重试。
    if (items.length === 1) return out;

    for (let i = 0; i < items.length; i++) {
      try {
        const [vec] = await opts.provider.embedDocuments([items[i]!.content]);
        if (!vec) throw new Error("provider returned no vector for a single input");
        out[i] = vec;
      } catch (err) {
        // 这条不写库、计入失败，同批其他条已经/仍将正常落库。
        console.error(
          `[memory] embedding failed for memory ${items[i]!.id}; it stays pending:`,
          err,
        );
      }
    }
    return out;
  }

  async function runOnce(): Promise<{ processed: number; failed: number }> {
    // 批次边界走 SQL：整条积压不进 JS 堆（spec §6.2）。
    const pending = listPendingEmbeddings(db, opts.provider.fingerprint, batchSize);
    if (pending.length === 0) return { processed: 0, failed: 0 };

    const vectors = await embedBatch(pending);

    let processed = 0;
    let failed = 0;
    for (let i = 0; i < pending.length; i++) {
      const vec = vectors[i];
      if (!vec) {
        failed++;
        continue;
      }
      try {
        opts.index.upsert(pending[i]!.id, vec, opts.provider.fingerprint, opts.provider.model);
        processed++;
      } catch (err) {
        // 落库失败同样是「该条失败」—— 与坏向量同类，不该让同批其他条陪葬。
        console.error(`[memory] failed to write the embedding for ${pending[i]!.id}:`, err);
        failed++;
      }
    }
    return { processed, failed };
  }

  if (intervalMs > 0) {
    timer = setInterval(() => {
      if (stopped || running) return;
      running = true;
      // 单轮失败不能让定时器死掉，也不能留下 unhandled rejection：
      // 吞掉并记日志，下一轮自然重试（spec §6.2）。
      void runOnce()
        .catch((err) => {
          console.error("[memory] embedding worker round failed, will retry next round:", err);
        })
        .finally(() => {
          running = false;
        });
    }, intervalMs);
    // 定时器不该阻止进程退出（否则测试与优雅关闭都会挂住）
    timer.unref();
  }

  return {
    /**
     * 停掉轮询。**已在飞行中的那一轮会跑完** —— 它的写入是幂等的
     * （`INSERT OR REPLACE`），且一条已算好的向量没有理由丢掉。
     * `runOnce()` 仍可手动调用（回填 CLI 的用法）。
     */
    stop(): void {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
    },

    runOnce,

    pendingCount(): number {
      return pendingEmbeddingCount(db, opts.provider.fingerprint);
    },
  };
}
