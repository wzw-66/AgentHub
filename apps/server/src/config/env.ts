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

/**
 * 读一个必填环境变量。
 *
 * 刻意不提供默认值：本仓库的 LLM 配置曾经因为变量名不匹配
 * （.env 写 `MODEL`，代码读 `LLM_MODEL`）而静默回落到 `deepseek-chat`，
 * 用户配置的模型从未生效且无人发现（spec §4.9）。
 * 配置缺失必须是显式失败，不能是猜测。
 */
function requireEnv(name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in the repository root .env (see .env.example).`,
    );
  }
  return value;
}

/**
 * 启动时调用，把配置缺失提前到进程启动阶段而非首次请求。
 *
 * 只断言 LLM_BASE_URL / LLM_MODEL：变量名不匹配正是 spec §4.9 的缺陷，
 * 缺失必须是显式失败。API_KEY 刻意不在此列 —— 它的名字从没错过，
 * 而且 LLMIntentAnalyzer 依赖「没有 key」走一条**显式降级**路径
 * （见 intent-analyzer.ts 的 fallbackResult：无法调用 LLM 时把全部 agent
 * 并行派发）。把它变成启动期错误会让那条降级路径在生产中不可达。
 */
export function assertLlmConfig(): void {
  requireEnv("LLM_BASE_URL");
  requireEnv("LLM_MODEL");
}

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

  llm: {
    /**
     * 可选：缺失时 LLMIntentAnalyzer 会走显式降级路径（派发全部 agent），
     * 并在降级时打 warning。刻意不用 requireEnv —— 见 assertLlmConfig 的说明。
     */
    get apiKey(): string | undefined {
      return env["API_KEY"];
    },
    get baseUrl(): string {
      return requireEnv("LLM_BASE_URL");
    },
    get model(): string {
      return requireEnv("LLM_MODEL");
    },
    get endpoint(): string {
      const base = this.baseUrl.replace(/\/+$/, "");
      return `${base}/v1/chat/completions`;
    },
  },
};
