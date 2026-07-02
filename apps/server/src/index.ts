import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as appConfig } from "./config/env";
import { buildApp } from "./app";
import { setDbPath } from "@agenthub/memory";
import { ConnectionManager } from "./realtime/connection-manager";

// Load .env from project root before main() reads config (config uses lazy getters)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Store long-term memory database in project root
setDbPath(path.resolve(__dirname, "../../../.agenthub/memory.db"));

async function main() {
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
