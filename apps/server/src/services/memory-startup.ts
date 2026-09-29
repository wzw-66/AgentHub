import type { Segmenter } from "@agenthub/memory";
import { initSchema, reindexMemories, REINDEX_TIMEOUT_MS } from "@agenthub/memory";

/** 启动期只用到这三级。注入进来，测试才能断言「失败真的留下了 WARN/ERROR 日志」。 */
export interface MemoryStartupLog {
  info(message: string): void;
  error(message: string, detail: unknown): void;
  warn(message: string): void;
}

/**
 * 降级时必须让运维读到**真实状态**：失败了、没有在后台继续、BM25 这一轮进程里
 * 一直是关的、只能靠重启恢复。写成「until it completes」是在描述一个本实现不可能
 * 处于的状态（`reindexMemories` 是同步的，要么已经返回、要么已经抛出）。
 */
const BM25_DEGRADED_MESSAGE =
  "[memory] ERROR: index rebuild failed. BM25 recall is DISABLED for this process run " +
  "and is NOT being retried in the background — restart the server once the cause is fixed. " +
  "Retrieval degrades to the vector leg only. Details:";

/**
 * 启动期记忆索引初始化：迁移（DDL）→ 回填 + 重建（数据）。
 *
 * 顺序钉死为「迁移 → 回填 → 监听」，调用方必须在 `listen()` **之前** await 本函数：
 * 迁移会把 `memory_fts` DROP 再建，此后索引是空的而记忆表有数据。在这个窗口内
 * `MATCH` 静默返回 0 行，RRF 会把「索引故障」当成「没有匹配」——故障被吞掉（spec §7.7）。
 * 回填在服务接受请求前完成，窗口就根本不存在，所以主路径下 `isBm25Ready()` 恒为 true
 * （spec §9.4）。
 *
 * 重建**慢/失败**不阻止启动：记忆是辅助能力，让整个 server（聊天、Agent 执行、
 * 全部 API）因为一个记忆索引重建失败而起不来，爆炸半径不成比例。但「不阻止启动」
 * 不等于「静默降级」——失败必须留下 ERROR 日志与 `isBm25Ready() === false`
 * 这个可观测标志。
 *
 * 注意这里**没有**后台重试：`reindexMemories` 是同步的，本次调用要么已经完成、
 * 要么已经抛出，不存在「服务已经开始接请求、重建还在后台跑」的状态。降级到下一次
 * 重启为止。要真正把 `REINDEX_TIMEOUT_MS` 变成截止时间，得先让重建可中断/异步。
 *
 * `initSchema()` 刻意留在 try 之外：DDL 失败是配置/磁盘层面的致命问题，与「重建慢」
 * 不同，它意味着记忆能力的前提不成立（spec §12）。
 */
export async function initializeMemory(
  segmenter: Segmenter,
  log: MemoryStartupLog = console,
): Promise<void> {
  initSchema();

  let timeout: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => reindexMemories(segmenter)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("reindex timeout")), REINDEX_TIMEOUT_MS);
      }),
    ]);
    log.info(`[memory] reindexed ${result.backfilled} memories; BM25 ready`);
  } catch (err) {
    log.error(BM25_DEGRADED_MESSAGE, err);
  } finally {
    // 竞速赢家（重建完成）先于 30 秒定时器落地时，定时器还在等 —— 不清掉会让事件
    // 循环多活 30 秒。server 里无害，但测试只因 vitest 强制退出才没暴露，掩盖了它。
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * 向量路健康检查的降级文案。说的是**真实状态**：接线是通的（worker 在跑、会重试），
 * 但此刻这条路上什么都回不来，所以每次检索都在无声地只用 BM25。
 */
const EMBEDDING_UNHEALTHY_CONSEQUENCE =
  "the vector leg is wired but currently returns nothing — every search silently " +
  "degrades to BM25 only. The server starts anyway (spec §10.3): the worker keeps " +
  "retrying, so this heals by itself once the endpoint is fixed.";

/**
 * 启动期验证 embedding 端点是否**真的**可用，而不是只看四个变量是否都在。
 *
 * `EmbeddingProvider.healthCheck()` 早就实现了，却从没被调用过 —— 后果是一个拼错的
 * `EMBEDDING_MODEL` 或一个没起来的端点，在启动日志里与健康状态**长得一模一样**：
 * `[memory] embedding enabled: bge-m3 (1024d, symmetric)`。而那种状态的真实签名是
 * `{"processed":0,"failed":2} pending: 2`（spec §12）—— 向量路永远回空榜单，
 * 只有盯着 worker 的计数才看得出来。
 *
 * **刻意不阻止启动**（spec §10.3）：向量路是可选能力，端点暂时不可用不该让整个
 * server（聊天、Agent 执行、全部 API）起不来。但「不阻止启动」不等于「静默降级」，
 * 所以失败必须留下一条带 `detail` 的 WARN。
 *
 * @returns 健康则为 `true`；不健康或检查本身抛错则 `false`（调用方据此决定是否
 *   打「enabled」那条 info —— 见 apps/server/src/index.ts）。
 */
export async function checkEmbeddingHealth(
  provider: { healthCheck(): Promise<{ ok: boolean; detail?: string }> },
  log: MemoryStartupLog = console,
): Promise<boolean> {
  try {
    const { ok, detail } = await provider.healthCheck();
    if (ok) return true;

    log.warn(
      `[memory] embedding health check FAILED${detail ? `: ${detail}` : ""} — ` +
        EMBEDDING_UNHEALTHY_CONSEQUENCE,
    );
    return false;
  } catch (err) {
    // 实现上 healthCheck 内部已 catch 并返回 ok:false，不该抛。但一个逃逸的异常
    // 若被当成「检查通过」就会退回「静默地什么都没验」——正是本函数要根除的形态。
    log.warn(
      `[memory] embedding health check threw: ${(err as Error).message} — ` +
        EMBEDDING_UNHEALTHY_CONSEQUENCE,
    );
    return false;
  }
}
