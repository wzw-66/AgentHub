import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import type { Segmenter } from "./segmenter.js";

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
