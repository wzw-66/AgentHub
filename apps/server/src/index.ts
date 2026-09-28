import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as appConfig, assertLlmConfig } from "./config/env";
import { buildApp } from "./app";
import {
  setDbPath,
  initSchema,
  reindexMemories,
  createJiebaSegmenter,
  REINDEX_TIMEOUT_MS,
} from "@agenthub/memory";
import { ConnectionManager } from "./realtime/connection-manager";

// Load .env from project root before main() reads config (config uses lazy getters)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Store long-term memory database in project root
setDbPath(path.resolve(__dirname, "../../../.agenthub/memory.db"));

async function main() {
  // 配置缺失在启动时暴露，而不是在第一次请求时
  assertLlmConfig();

  // ─── Memory schema: DDL migration, then data backfill, before serving ──────
  // 顺序钉死为「迁移 → 回填 → 监听」。迁移会把 memory_fts DROP 再建，此后索引是空
  // 的而记忆表有数据；在这个窗口内 `MATCH` 静默返回 0 行，RRF 会把「索引故障」当成
  // 「没有匹配」——故障被吞掉（spec §7.7）。回填在 listen() 之前 await 完成，
  // 窗口在服务接受请求之前就关掉了，所以主路径下 bm25Ready 恒为 true（spec §9.4）。
  //
  // 超时兜底：库太大时不要让启动无限期挂住 —— 记 ERROR、留下 bm25Ready === false，
  // 检索层据此跳过 BM25 路并打 warning，而不是执行 MATCH 返回空榜单。
  // 注意 reindexMemories 是同步的（better-sqlite3 的事务不能跨 await），这个 race
  // 因此只保证「失败与超时走同一条降级路径」；真要抢跑得赢 30s，得等重建本身异步化。
  // 「重建慢」不阻止启动，但绝不静默降级：记忆是辅助能力，让整个 server 起不来
  // 的爆炸半径不成比例。
  initSchema();
  const segmenter = createJiebaSegmenter();
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => reindexMemories(segmenter)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("reindex timeout")), REINDEX_TIMEOUT_MS),
      ),
    ]);
    console.log(`[memory] reindexed ${result.backfilled} memories; BM25 ready`);
  } catch (err) {
    console.error(
      "[memory] ERROR: index rebuild did not finish. " +
        "BM25 recall is DISABLED until it completes. Details:",
      err,
    );
  }

  const cm = new ConnectionManager();
  const app = await buildApp(cm);

  // ─── Graceful shutdown ─────────────────────────────────────────────────────

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      process.exit(0);
    });
  }

  // ─── Start ─────────────────────────────────────────────────────────────────

  try {
    await app.listen({ port: appConfig.port, host: appConfig.host });
    app.log.info(`Server listening on ${appConfig.host}:${appConfig.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
