import type { Segmenter } from "@agenthub/memory";
import { initSchema, reindexMemories, REINDEX_TIMEOUT_MS } from "@agenthub/memory";

/** 启动期只用到这两级。注入进来，测试才能断言「失败真的留下了 ERROR 日志」。 */
export interface MemoryStartupLog {
  info(message: string): void;
  error(message: string, detail: unknown): void;
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

  try {
    const result = await Promise.race([
      Promise.resolve().then(() => reindexMemories(segmenter)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("reindex timeout")), REINDEX_TIMEOUT_MS),
      ),
    ]);
    log.info(`[memory] reindexed ${result.backfilled} memories; BM25 ready`);
  } catch (err) {
    log.error(BM25_DEGRADED_MESSAGE, err);
  }
}
