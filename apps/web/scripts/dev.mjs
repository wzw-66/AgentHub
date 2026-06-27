/**
 * Start Next.js dev server with ports from root .env.
 * Reads WEB_PORT and PORT from the monorepo root .env to configure
 * the dev server port and API URL respectively.
 * Automatically finds an available port if the preferred one is in use.
 */
import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import net from "net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");
const rootEnvPath = resolve(webRoot, "../../.env");

function readRootEnv(key, fallback) {
  if (!existsSync(rootEnvPath)) return fallback;
  const env = readFileSync(rootEnvPath, "utf8");
  const match = env.match(new RegExp(`^${key}\\s*=\\s*(\\S+)`, "m"));
  return match ? match[1] : fallback;
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

const apiPort = readRootEnv("PORT", "8123");
const preferredPort = parseInt(readRootEnv("WEB_PORT", "3002"), 10);
const apiUrl = `http://localhost:${apiPort}`;

async function tryStart(port) {
  // Quick pre-check: skip ports already in use
  if (!(await isPortAvailable(port))) {
    return { ok: false, reason: "EADDRINUSE" };
  }

  console.log(`Starting Next.js dev server on port ${port}...`);
  console.log(`API URL: ${apiUrl}`);

  const dev = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: webRoot,
    stdio: ["inherit", "inherit", "pipe"],
    shell: true,
    env: { ...process.env, NEXT_PUBLIC_API_URL: apiUrl },
  });

  // Watch stderr for EADDRINUSE (race condition after port check)
  const stderrChunks = [];
  dev.stderr.on("data", (chunk) => {
    stderrChunks.push(chunk);
    process.stderr.write(chunk);
  });

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // Still running after 3s → assume healthy
      resolve({ ok: true, process: dev });
    }, 3000);

    dev.on("exit", (code) => {
      clearTimeout(timer);
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (stderr.includes("EADDRINUSE")) {
        resolve({ ok: false, process: dev, reason: "EADDRINUSE" });
      } else if (code !== 0) {
        resolve({ ok: false, process: dev, reason: `exit code ${code}` });
      } else {
        resolve({ ok: true, process: dev });
      }
    });
  });
}

// Try ports until one works
let port = preferredPort;
let attempt = 0;
const maxAttempts = 100;

while (attempt < maxAttempts) {
  const result = await tryStart(port);
  if (result.ok) {
    // Attach signal handlers to the running process
    const dev = result.process;
    process.on("SIGINT", () => { dev.kill("SIGINT"); process.exit(0); });
    process.on("SIGTERM", () => { dev.kill("SIGTERM"); process.exit(0); });
    if (port !== preferredPort) {
      console.log(`Note: Port ${preferredPort} was in use, using port ${port} instead.`);
    }
    break;
  }

  if (result.reason === "EADDRINUSE") {
    console.log(`Port ${port} is in use, trying ${port + 1}...`);
    port++;
    attempt++;
  } else {
    console.error(`Next.js failed on port ${port} (${result.reason}), giving up.`);
    process.exit(1);
  }
}

if (attempt >= maxAttempts) {
  console.error(`No available port found after ${maxAttempts} attempts.`);
  process.exit(1);
}
