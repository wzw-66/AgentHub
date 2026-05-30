import { env } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Absolute path to apps/server/ — deterministic regardless of how the
 * process is launched (turbo dev sets cwd to the package dir, which
 * happens to be correct, but relying on cwd is fragile).
 */
export const SERVER_ROOT = path.resolve(__dirname, "..");

/**
 * Absolute path used as the base for workspace directories — runtime data
 * for AI agent workspaces (e.g., conversation working directories).
 *
 * Default: apps/server/ (consistent in both dev and prod since SERVER_ROOT/..
 * always resolves to apps/server/). Override via WORKSPACE_ROOT env var.
 */
export const WORKSPACE_ROOT = env["WORKSPACE_ROOT"]
  ? path.resolve(env["WORKSPACE_ROOT"])
  : path.resolve(SERVER_ROOT, "..");

export const config = {
  get port(): number {
    return parseInt(env["PORT"] || "3001", 10);
  },
  get host(): string {
    return env["HOST"] || "0.0.0.0";
  },

  jwt: {
    get secret(): string {
      return env["JWT_SECRET"] || "dev-secret-do-not-use-in-production";
    },
    get accessExpiresIn(): string {
      return env["JWT_ACCESS_EXPIRES_IN"] || "15m";
    },
    get refreshExpiresIn(): string {
      return env["JWT_REFRESH_EXPIRES_IN"] || "7d";
    },
  },
};
