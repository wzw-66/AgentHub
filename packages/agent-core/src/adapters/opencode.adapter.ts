import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type { AgentAdapter, AgentContext, Chunk, HealthStatus } from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";
import { createChunk, parseOpenCodeEvent } from "../utils/chunk-parser.js";

export interface OpenCodeAdapterConfig {
  /** Path to the `opencode` binary. Defaults to "opencode". */
  cliPath?: string;
  /** Additional CLI arguments. */
  args?: string[];
  /** Model identifier (e.g., "anthropic/claude-sonnet-4-6"). */
  model?: string;
  /** Timeout in milliseconds. Default: 300000 (5 min). */
  timeout?: number;
}

/**
 * Adapter that executes prompts via the `opencode` CLI subprocess.
 *
 * Uses `opencode run --format json` for non-interactive streaming execution.
 * The CLI must be installed on the host machine.
 *
 * @example
 * ```ts
 * const adapter = new OpenCodeAdapter({ model: "anthropic/claude-sonnet-4-6" });
 * for await (const chunk of adapter.execute(context)) {
 *   console.log(chunk);
 * }
 * ```
 */
export class OpenCodeAdapter implements AgentAdapter {
  private process: ChildProcess | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(private config: OpenCodeAdapterConfig = {}) {}

  async *execute(context: AgentContext): AsyncIterable<Chunk> {
    const cliPath = this.config.cliPath ?? "opencode";
    const model = this.config.model;
    const prompt = this.buildPrompt(context);

    const args: string[] = ["run", "--format", "json"];

    if (model) {
      args.push("-m", model);
    }

    args.push(prompt);

    if (this.config.args) {
      args.push(...this.config.args);
    }

    this.process = spawn(cliPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Register close handler immediately
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

      const chunk = parseOpenCodeEvent(line);
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
        `OpenCode CLI exited with code ${exitCode}`,
      );
    }
  }

  abort(): void {
    this.process?.kill("SIGTERM");
    // Force kill after 5s grace period
    setTimeout(() => {
      try {
        this.process?.kill("SIGKILL");
      } catch {
        // Process may already be dead
      }
    }, 5000);
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const proc = spawn(this.config.cliPath ?? "opencode", ["--version"], {
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
            message: `OpenCode CLI exited with code ${exitCode}`,
          };
    } catch {
      return {
        status: "unhealthy" as const,
        latency: Date.now() - start,
        message: "OpenCode CLI not found or not executable",
      };
    }
  }

  private buildPrompt(context: AgentContext): string {
    const parts: string[] = [];

    for (const msg of context.history) {
      parts.push(`${msg.senderType}: ${msg.content}`);
    }

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
