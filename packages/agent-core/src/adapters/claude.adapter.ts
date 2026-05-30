import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  AgentAdapter,
  AgentContext,
  Chunk,
  HealthStatus,
} from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";
import { createChunk, parseClaudeStreamJson } from "../utils/chunk-parser.js";
import { resolveCommand } from "../utils/resolve-cli.js";

export interface ClaudeAdapterConfig {
  /** Path to the `claude` binary. Defaults to "claude". */
  cliPath?: string;
  /** Working directory for the subprocess. */
  cwd?: string;
  /** Additional CLI arguments. */
  args?: string[];
  /** Timeout in milliseconds. Default: 300000 (5 min). */
  timeout?: number;
  /** Max agentic turns in non-interactive mode. Default: 25. */
  maxTurns?: number;
}

/**
 * Adapter that executes prompts via the `claude` CLI subprocess.
 *
 * Uses `claude --bare -p --output-format stream-json` for non-interactive
 * streaming execution. The CLI must be installed on the host machine.
 *
 * @example
 * ```ts
 * const adapter = new ClaudeAdapter({ cliPath: "claude" });
 * for await (const chunk of adapter.execute(context)) {
 *   console.log(chunk);
 * }
 * ```
 */
export class ClaudeAdapter implements AgentAdapter {
  private process: ChildProcess | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(private config: ClaudeAdapterConfig = {}) {}

  async *execute(context: AgentContext): AsyncIterable<Chunk> {
    const cliPath = this.config.cliPath ?? "claude";
    const maxTurns = this.config.maxTurns ?? 25;
    const prompt = this.buildPrompt(context);

    const args: string[] = [
      "--bare",
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--dangerously-skip-permissions",
      "--max-turns",
      String(maxTurns),
      ...(this.config.args ?? []),
    ];

    const resolved = resolveCommand(cliPath);
    this.process = spawn(resolved.command, [...resolved.prefixArgs, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: this.config.cwd,
    });

    // Register close handler immediately — ensures exitCode promise
    // is available even if the process exits before the readline loop ends.
    const exitCodePromise = new Promise<number>((resolve) => {
      this.process!.on("close", resolve);
    });

    // Timeout safeguard
    if (this.config.timeout) {
      this.timeoutId = setTimeout(() => {
        this.process?.kill("SIGTERM");
      }, this.config.timeout);
    }

    const rl = createInterface({ input: this.process.stdout! });

    for await (const line of rl) {
      if (!line.trim()) continue;

      const chunk = parseClaudeStreamJson(line);
      if (chunk) {
        yield chunk;
        if (chunk.type === ChunkType.Done) break;
      }
    }

    // Wait for process exit
    const exitCode = await exitCodePromise;

    this.clearTimeout();

    if (exitCode !== 0) {
      yield createChunk(
        ChunkType.Error,
        `claude CLI exited with code ${exitCode}`,
      );
    }
  }

  abort(): void {
    if (!this.process) return;
    if (process.platform === "win32") {
      // On Windows, taskkill /T kills the entire process tree
      try {
        const { execSync } = require("node:child_process");
        execSync(`taskkill /PID ${this.process.pid} /T /F`, { timeout: 3000 });
      } catch {
        this.process.kill("SIGTERM");
      }
    } else {
      this.process?.kill("SIGTERM");
      setTimeout(() => {
        try {
          this.process?.kill("SIGKILL");
        } catch {
          // Process may already be dead
        }
      }, 5000);
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const { command: healthCmd, prefixArgs: healthPrefix } = resolveCommand(
        this.config.cliPath ?? "claude",
      );
      const proc = spawn(healthCmd, [...healthPrefix, "--version"], {
        stdio: "pipe",
      });
      const exitCode = await new Promise<number>((resolve) => {
        proc.on("close", resolve);
      });
      return exitCode === 0
        ? { status: "healthy" as const, latency: Date.now() - start }
        : {
            status: "unhealthy" as const,
            latency: Date.now() - start,
            message: `claude CLI exited with code ${exitCode}`,
          };
    } catch {
      return {
        status: "unhealthy" as const,
        latency: Date.now() - start,
        message: "claude CLI not found or not executable",
      };
    }
  }

  private buildPrompt(context: AgentContext): string {
    const parts: string[] = [];

    // Append conversation history
    for (const msg of context.history) {
      parts.push(`${msg.senderType}: ${msg.content}`);
    }

    // Append current message
    parts.push(`user: ${context.message}`);

    return parts.join("\n");
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
