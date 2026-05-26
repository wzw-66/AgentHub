import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as appConfig } from "./config/env";
import { buildApp } from "./app";
import { ConnectionManager } from "./realtime/connection-manager";

// Load .env from project root (two levels up from this file)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

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
