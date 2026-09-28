import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as appConfig, assertLlmConfig } from "./config/env";
import { buildApp } from "./app";
import { setDbPath, createJiebaSegmenter } from "@agenthub/memory";
import { ConnectionManager } from "./realtime/connection-manager";
import { initializeMemory } from "./services/memory-startup";

// Load .env from project root before main() reads config (config uses lazy getters)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Store long-term memory database in project root
setDbPath(path.resolve(__dirname, "../../../.agenthub/memory.db"));

async function main() {
  // 配置缺失在启动时暴露，而不是在第一次请求时
  assertLlmConfig();

  // ─── Memory schema: DDL migration, then data backfill, before serving ──────
  // 顺序钉死为「迁移 → 回填 → 监听」：迁移会 DROP 并重建 memory_fts，此后索引是空
  // 的而记忆表有数据，在这个窗口内 `MATCH` 静默返回 0 行；回填必须在这之前完成，
  // 窗口才不会暴露给请求（spec §7.7、§9.4）。
  //
  // 重建失败不阻止启动（记忆是辅助能力，爆炸半径不成比例），但绝不静默降级：
  // initializeMemory 会在失败时打 ERROR 并留下 isBm25Ready() === false。
  // **BM25 路跳过该标志的开关还没有接线 —— 那是 Task 20 的事**（它会把
  // searchMemories 改成双路，并按 isBm25Ready() 决定跳过 BM25 路 + 打 warning）。
  // 在那之前，检索侧不会读这个标志，降级只体现在日志与标志本身。
  await initializeMemory(createJiebaSegmenter());

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
