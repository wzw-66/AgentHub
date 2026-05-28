/**
 * Clean-start script for Next.js dev server.
 * Kills any stale process on port 3456, cleans .next cache, then starts fresh.
 */
import { execSync, spawn } from "child_process";
import { existsSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const PORT = 3456;
const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");
const nextDir = resolve(webRoot, ".next");

// 1. Kill any process listening on PORT
try {
  const netstat = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, {
    encoding: "utf8",
    timeout: 5000,
  });
  const lines = netstat.trim().split("\n");
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== "0") {
      console.log(`Killing process ${pid} on port ${PORT}...`);
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "inherit", timeout: 5000 });
      } catch {
        // process may already be dead
      }
    }
  }
} catch {
  // No process found — good
}

// 2. Clean .next cache
if (existsSync(nextDir)) {
  console.log("Removing .next cache...");
  rmSync(nextDir, { recursive: true, force: true });
}

// 3. Start dev server
console.log("Starting Next.js dev server...");
const dev = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  cwd: webRoot,
  stdio: "inherit",
  shell: true,
  env: { ...process.env },
});

process.on("SIGINT", () => {
  dev.kill("SIGINT");
  process.exit(0);
});
process.on("SIGTERM", () => {
  dev.kill("SIGTERM");
  process.exit(0);
});
