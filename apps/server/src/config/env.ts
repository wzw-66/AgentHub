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
 * 严格解析一个正整数环境变量。
 *
 * `Number.parseInt` 对这四个无兜底变量太宽容：`"1024abc"` → `1024`、`"1e3"` → `1`。
 * 两者都会被**接受**，于是 dim 静默地不是用户写的那个值 —— 与 `?? "deepseek-chat"`
 * 同一类缺陷，只是藏在一个数字里。容忍首尾空白（`.env` 里手打的空格），其余一律
 * 作废整条配置。
 */
function parsePositiveInt(raw: string): number | undefined {
  const value = Number(raw.trim());
  return Number.isInteger(value) && value > 0 ? value : undefined;
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

  /**
   * Embedding 配置。**四个必填项缺任意一个就整体为 undefined** —— 不做部分兜底，
   * 不给 model/dim 设默认值（spec §10.2）。理由见 §4.9：曾经的 `?? "deepseek-chat"`
   * 让用户配置的模型从未生效且无人发现；给 embedding 兜底会让同一个剧本重演 ——
   * 一个拼错的 `EMBEDDING_MODEL` 会静默换一个模型，把**另一个向量空间**写进索引。
   *
   * 未配置时向量路整体关闭，退化为纯 BM25 并打 warning（spec §10.3）：
   * 降级是显式、有日志、可预期的，兜底是隐式、无日志、不可预期的。
   *
   * **「配置错了」与「没有配置」走同一条路**（整条配置 undefined + 那条 warning）：
   * 一个认不出的 `EMBEDDING_MODE`、一个非整数的 dim、一个非法的 MRL 维度，都
   * 不是「用默认值继续」，而是「这个配置不可用」。可选带默认值的契约是
   * 「省略 ⇒ 默认」，不是「认不出 ⇒ 默认」。
   *
   * 刻意不用 `requireEnv`（那会抛错、让进程起不来）：向量路是**可选能力**，
   * 缺失是合法状态而非错误。LLM 的必填项与它不同 —— 那是启动期硬依赖。
   */
  get embedding():
    | {
        baseUrl: string;
        apiKey: string;
        model: string;
        dim: number;
        mode: "symmetric" | "asymmetric";
        dimensions?: number;
        queryPrefix?: string;
        documentPrefix?: string;
      }
    | undefined {
    const baseUrl = env["EMBEDDING_BASE_URL"];
    const apiKey = env["EMBEDDING_API_KEY"];
    const model = env["EMBEDDING_MODEL"];
    const dimRaw = env["EMBEDDING_DIM"];

    if (!baseUrl || !apiKey || !model || !dimRaw) return undefined;

    const dim = parsePositiveInt(dimRaw);
    if (dim === undefined) return undefined;

    // 省略（或留空）⇒ 文档化的默认 symmetric；**其余任何值都作废整条配置**。
    // 旧写法 `=== "asymmetric" ? "asymmetric" : "symmetric"` 分不清「省略」与
    // 「拼错」：`symetric` / `Asymmetric` / `"asymmetric "` 全都安静地变成
    // symmetric，前缀永不施加、召回率降一档且无日志（spec §8.1 的原话是
    // 「不会报错，它只会安静地把召回率拉低一档」）。
    const modeRaw = env["EMBEDDING_MODE"];
    let mode: "symmetric" | "asymmetric";
    if (!modeRaw) {
      mode = "symmetric";
    } else if (modeRaw === "symmetric" || modeRaw === "asymmetric") {
      mode = modeRaw;
    } else {
      return undefined;
    }

    // 显式要求了 MRL 降维却给一个解析不出的值时，旧实现把它**丢掉**：用户以为
    // 在用 256 维，实际写进索引的是模型原生维度，且没有任何日志。要求了就是要求了。
    const dimensionsRaw = env["EMBEDDING_DIMENSIONS"];
    let dimensions: number | undefined;
    if (dimensionsRaw) {
      dimensions = parsePositiveInt(dimensionsRaw);
      if (dimensions === undefined) return undefined;
    }

    return {
      baseUrl,
      apiKey,
      model,
      dim,
      mode,
      ...(dimensions !== undefined ? { dimensions } : {}),
      // bge-*-zh 系与 E5 系需要前缀；bge-m3 不需要。留出配置口而非硬编码模型判断。
      ...(env["EMBEDDING_QUERY_PREFIX"] ? { queryPrefix: env["EMBEDDING_QUERY_PREFIX"] } : {}),
      ...(env["EMBEDDING_DOCUMENT_PREFIX"]
        ? { documentPrefix: env["EMBEDDING_DOCUMENT_PREFIX"] }
        : {}),
    };
  },
};
