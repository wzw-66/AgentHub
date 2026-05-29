/**
 * Start Next.js dev server with ports from root .env.
 * Reads WEB_PORT and PORT from the monorepo root .env to configure
 * the dev server port and API URL respectively.
 */
import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");
const rootEnvPath = resolve(webRoot, "../../.env");

// Parse root .env key=value lines
function readRootEnv(key, fallback) {
  if (!existsSync(rootEnvPath)) return fallback;
  const env = readFileSync(rootEnvPath, "utf8");
  const match = env.match(new RegExp(`^${key}\\s*=\\s*(\\S+)`, "m"));
  return match ? match[1] : fallback;
}

const apiPort = readRootEnv("PORT", "8123");
const webPort = readRootEnv("WEB_PORT", "3002");
const apiUrl = `http://localhost:${apiPort}`;

// Start dev server
console.log(`Starting Next.js dev server on port ${webPort}...`);
console.log(`API URL: ${apiUrl}`);
const dev = spawn("npx", ["next", "dev", "-p", webPort], {
  cwd: webRoot,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_API_URL: apiUrl },
});

process.on("SIGINT", () => {
  dev.kill("SIGINT");
  process.exit(0);
});
process.on("SIGTERM", () => {
  dev.kill("SIGTERM");
  process.exit(0);
});
