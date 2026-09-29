import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as appConfig, assertLlmConfig } from "./config/env";
import { buildApp } from "./app";
import {
  setDbPath,
  configureSearch,
  createJiebaSegmenter,
  createOpenAICompatibleEmbeddingProvider,
  createMemoryVectorIndex,
  startEmbeddingWorker,
} from "@agenthub/memory";
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
  // initializeMemory 会在失败时打 ERROR 并留下 isBm25Ready() === false，
  // 检索侧据此跳过 BM25 路并打 warning（见 search.ts 的 runBm25Leg）。
  const segmenter = createJiebaSegmenter();
  await initializeMemory(segmenter);

  const cm = new ConnectionManager();
  const app = await buildApp(cm);

  // ─── Search wiring ─────────────────────────────────────────────────────────
  // 向量索引与 provider 在「检索」与「嵌入 worker」之间必须**是同一个实例**：
  // 换一个索引实例就等于换了一个向量空间，检索会去查一个 worker 从没写过的索引。
  //
  // `segmenter` 是另一回事：它这里只喂给检索侧，写入侧（`createMemory` /
  // `reindexMemories`）用的是 `repository.ts` 里懒加载的那一个 jieba 实例 ——
  // **不同的对象，同一份词典**。共享的是词典而非实例，行为等价（spec §8.2：
  // 分词精度不敏感，两端一致即可），这里传进去的只是让检索侧不必再懒加载一次。
  //
  // 不接线的话检索会退化成「懒加载默认分词器 + 向量路关闭」—— 单测全绿，
  // 功能没接上。
  const embeddingConfig = appConfig.embedding;
  const vectorIndex = embeddingConfig ? createMemoryVectorIndex() : undefined;
  const embeddingProvider = embeddingConfig
    ? createOpenAICompatibleEmbeddingProvider(embeddingConfig)
    : undefined;

  configureSearch({
    segmenter,
    ...(vectorIndex ? { vectorIndex } : {}),
    ...(embeddingProvider ? { embeddingProvider } : {}),
  });

  // ─── Embedding worker（可选能力）────────────────────────────────────────────
  // 未配置时**不启动** worker，只打一条 warning 说清缺什么、后果是什么（spec §10.3）。
  // 降级是显式、有日志、可预期的：`/api/memory/search` 照常可用，只是没有语义召回。
  // 刻意不给缺失的变量兜底值 —— 见 config/env.ts 的 embedding getter。
  let embeddingWorker: { stop(): void } | undefined;
  if (embeddingProvider && vectorIndex) {
    embeddingWorker = startEmbeddingWorker({ provider: embeddingProvider, index: vectorIndex });
    app.log.info(
      `[memory] embedding enabled: ${embeddingConfig!.model} ` +
        `(${embeddingConfig!.dim}d, ${embeddingConfig!.mode})`,
    );
  } else {
    // 「缺失」与「非法」共用这条 warning（两者都让 config.embedding 为 undefined），
    // 所以措辞必须覆盖后者，否则一个拼错的 EMBEDDING_MODE 会得到一句
    // 「变量没配全」的误导性提示 —— 明明都配了。
    app.log.warn(
      "[memory] EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL / EMBEDDING_DIM " +
        "not all set to valid values (EMBEDDING_MODE must be symmetric or asymmetric when " +
        "set; EMBEDDING_DIM / EMBEDDING_DIMENSIONS must be positive integers) — " +
        "semantic recall is DISABLED, falling back to BM25 only.",
    );
  }

  // ─── Graceful shutdown ─────────────────────────────────────────────────────

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      // 在飞的那一轮会跑完（写入幂等），只是不再开新轮 —— `stop()` 的语义如此。
      embeddingWorker?.stop();
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
