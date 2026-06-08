import type { AgentAdapter, AgentContext, Chunk, ToolMessage } from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";
import { createChunk } from "../utils/chunk-parser.js";
import type { ToolHandler, ToolExecutionContext, HarnessConfig, HarnessResult, HarnessEvent } from "./types.js";
import { MiddlewarePipeline } from "./middleware/pipeline.js";
import type { AgentMiddleware } from "./middleware/types.js";
import { ToolRegistry } from "./tools/registry.js";
import type { Sandbox } from "./sandbox/types.js";

/**
 * Normalize tool handler result to an AsyncIterable for uniform consumption.
 */
async function* normalizeToolResult(
  result: AsyncIterable<Chunk> | Iterable<Chunk> | Promise<string>,
): AsyncIterable<string | Chunk> {
  if (result instanceof Promise) {
    yield await result;
    return;
  }
  const iterable = result as Iterable<Chunk>;
  if (typeof (iterable as Iterable<Chunk>)[Symbol.iterator] === "function") {
    for (const chunk of iterable) {
      yield chunk;
    }
    return;
  }
  const asyncIterable = result as AsyncIterable<Chunk>;
  for await (const chunk of asyncIterable) {
    yield chunk;
  }
}

/**
 * AgentHarness wraps an AgentAdapter with an agentic tool-use loop,
 * middleware pipeline, and tool registry.
 *
 * The harness:
 * 1. Runs middleware `beforeAgent` hooks to prepare context
 * 2. Calls adapter.execute(context) and collects chunks
 * 3. Runs middleware `afterAgent` hooks with produced chunks
 * 4. When a ToolCall chunk is detected, invokes the registered handler
 * 5. Injects the tool result back into the context, then calls execute() again
 * 6. Repeats until no more tool calls or maxTurns is reached
 *
 * Implements the same AsyncIterable<Chunk> interface as AgentAdapter,
 * so it can be used as a drop-in replacement.
 */
export class AgentHarness {
  private adapter: AgentAdapter;
  private tools: Map<string, ToolHandler> = new Map();
  private maxTurns: number;
  private onEvent?: HarnessConfig["onEvent"];
  private pipeline: MiddlewarePipeline;
  private toolRegistry: ToolRegistry | null = null;
  private sandbox: Sandbox | null = null;

  /** Tracks the turn count from the last execute() call. */
  private _lastTurnCount = 0;

  constructor(adapter: AgentAdapter, config: HarnessConfig = {}) {
    this.adapter = adapter;
    this.maxTurns = config.maxTurns ?? 25;
    this.onEvent = config.onEvent;
    this.pipeline = new MiddlewarePipeline();

    if (config.tools) {
      this.tools = config.tools;
    }
  }

  /**
   * Register a middleware into the pipeline.
   */
  use(middleware: AgentMiddleware): void {
    this.pipeline.use(middleware);
  }

  /**
   * Set the tool registry (enables built-in tools like execute_command, read_file).
   */
  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  /**
   * Set the sandbox for tool execution.
   */
  setSandbox(sandbox: Sandbox): void {
    this.sandbox = sandbox;
  }

  /**
   * Register a tool handler.
   */
  registerTool(name: string, handler: ToolHandler): void {
    this.tools.set(name, handler);
  }

  /**
   * Execute the agent with the given context.
   * Yields chunks immediately as they are produced — enables real-time
   * streaming (typewriter effect) on the frontend.
   */
	// ─── Tool name aliases: normalize LLM-specific names to canonical names ─
  private static readonly TOOL_ALIASES: Record<string, string> = {
    // Claude CLI built-in tool names (capitalized)
    Write: "write_file",
    Read: "read_file",
    Bash: "execute_command",
    Edit: "write_file",
    Glob: "",     // File search — agent can fall back to list_dir
    Grep: "",     // Text search — agent can fall back to execute_command with find/grep
    // Claude CLI lowercase variants
    write: "write_file",
    read: "read_file",
    bash: "execute_command",
    edit: "write_file",
    glob: "",
    grep: "",
    think: "", // Think is Claude's internal reasoning, no handler needed — skip
    // OpenCode tool names
    executeCommand: "execute_command",
    readFile: "read_file",
    writeFile: "write_file",
    listDir: "list_dir",
    // Already canonical
    write_file: "write_file",
    read_file: "read_file",
    execute_command: "execute_command",
    list_dir: "list_dir",
  };

  /**
   * Resolve a tool name to a registered handler name.
   * Tries: alias map → case-insensitive match → original name.
   */
  private resolveToolName(rawName: string, registry?: ToolRegistry | null): string {
    // 1. Direct alias lookup
    const aliased = AgentHarness.TOOL_ALIASES[rawName];
    if (aliased !== undefined) return aliased;

    // 2. Case-insensitive match against tool registry
    if (registry) {
      const lower = rawName.toLowerCase();
      for (const t of registry.getAll()) {
        if (t.name.toLowerCase() === lower) return t.name;
      }
    }

    // 3. Return as-is (will produce "Unknown tool" error)
    return rawName;
  }

  /**
   * Start execution from line 104
   */
  async *execute(context: AgentContext): AsyncIterable<Chunk> {
    let turn = 0;
    let workingContext: AgentContext = { ...context };
    let doneYielded = false;

    while (turn < this.maxTurns) {
      turn++;
      this.emit("before_turn", turn, { turn });

      // Run beforeAgent middleware
      workingContext = await this.pipeline.runBeforeAgent(workingContext);

      const turnChunks: Chunk[] = [];
      const toolCallsInTurn: Chunk[] = [];
      let turnDoneChunk: Chunk | null = null;

      // Stream chunks from the adapter immediately, but collect
      // ToolCall and Done chunks for post-turn processing.
      for await (const chunk of this.adapter.execute(workingContext)) {
        // Stream text/code/error chunks immediately for real-time display
        if (
          chunk.type === ChunkType.Text ||
          chunk.type === ChunkType.Code ||
          chunk.type === ChunkType.Error
        ) {
          yield chunk;
        }

        if (chunk.type === ChunkType.ToolCall) {
          toolCallsInTurn.push(chunk);
        }

        if (chunk.type === ChunkType.Done) {
          turnDoneChunk = chunk;
        }

        turnChunks.push(chunk);
      }

      // Run afterAgent middleware
      await this.pipeline.runAfterAgent(workingContext, turnChunks);

      if (toolCallsInTurn.length === 0) {
        // No tool calls — execution is complete
        if (turnDoneChunk) {
          doneYielded = true;
          yield turnDoneChunk;
        }
        break;
      }

      // Yield tool call chunks for UI visibility (after text is streamed)
      for (const tc of toolCallsInTurn) {
        yield tc;
      }

      // Process tool calls
      const toolMessages: ToolMessage[] = [];
      for (const toolCall of toolCallsInTurn) {
        const parsed = this.parseToolCall(toolCall.content);
        if (!parsed) {
          yield createChunk(ChunkType.Error, `Failed to parse tool call: ${toolCall.content}`);
          continue;
        }

        // Normalize tool name via alias map → case-insensitive → original
        const canonicalName = this.resolveToolName(parsed.name, this.toolRegistry);
        // Skip tools with empty canonical name (e.g., Claude's "think")
        if (!canonicalName) continue;

        // Extract toolCallId from the parsed tool call content
        let toolCallId = `call_${turn}_${Date.now()}`;
        try {
          const raw = JSON.parse(toolCall.content);
          if (raw.id) toolCallId = raw.id;
        } catch { /* use default */ }

        // Record the assistant's tool call message
        toolMessages.push({
          role: "assistant",
          content: JSON.stringify(parsed.args),
          toolCallId,
          toolName: parsed.name,
        });

        const handler = this.tools.get(canonicalName);
        if (!handler) {
          // Try the tool registry as fallback
          if (this.toolRegistry?.has(canonicalName)) {
            const toolExecContext: ToolExecutionContext = {
              conversationId: workingContext.conversationId,
              sandbox: this.sandbox ?? undefined,
            };

            this.emit("tool_start", turn, { toolName: canonicalName, args: parsed.args });

            let toolResult = "";
            try {
              toolResult = await this.toolRegistry.execute(canonicalName, parsed.args, toolExecContext);
            } catch (err) {
              toolResult = err instanceof Error ? err.message : "Unknown tool error";
            }

            this.emit("tool_end", turn, { toolName: canonicalName, result: toolResult });
            toolMessages.push({
              role: "tool",
              content: toolResult,
              toolCallId,
              toolName: canonicalName,
            });
            continue;
          }

          yield createChunk(ChunkType.Error, `Unknown tool: ${canonicalName}`);
          continue;
        }

        this.emit("tool_start", turn, { toolName: canonicalName, args: parsed.args });

        // Execute the tool handler
        const toolExecContext: ToolExecutionContext = {
          conversationId: workingContext.conversationId,
          sandbox: this.sandbox ?? undefined,
        };

        let toolResult = "";
        try {
          const rawResult = handler(canonicalName, parsed.args, toolExecContext);
          for await (const resultChunk of normalizeToolResult(rawResult)) {
            toolResult += typeof resultChunk === "string" ? resultChunk : resultChunk.content;
          }
        } catch (err) {
          toolResult = err instanceof Error ? err.message : "Unknown tool error";
        }

        this.emit("tool_end", turn, { toolName: canonicalName, result: toolResult });

        // Record the tool result message
        toolMessages.push({
          role: "tool",
          content: toolResult,
          toolCallId,
          toolName: canonicalName,
        });
      }

      // Inject tool messages for the next turn so the adapter sends
      // proper "assistant" (tool_call) and "tool" role messages to the LLM.
      const existing = workingContext.toolMessages ?? [];
      workingContext = {
        ...workingContext,
        toolMessages: [...existing, ...toolMessages],
        message: "Based on the tool results above, provide your final response concisely without restating what you already said.",
      };

      this.emit("after_turn", turn, { turn, toolCallCount: toolCallsInTurn.length });
    }

    // If we hit maxTurns, emit a note
    if (turn >= this.maxTurns) {
      yield createChunk(ChunkType.Text, `\n\n[Execution stopped after ${this.maxTurns} turns]`);
    }

    // Append final Done chunk if not present
    if (!doneYielded) {
      yield createChunk(ChunkType.Done, "");
    }

    this.emit("done", turn, {});
    this._lastTurnCount = turn;
  }

  /**
   * Execute and collect all chunks into a HarnessResult.
   * Uses the streaming execute() internally — suitable for cases where
   * you need the complete result rather than real-time streaming.
   */
  async executeWithResult(context: AgentContext): Promise<HarnessResult> {
    const allChunks: Chunk[] = [];

    for await (const chunk of this.execute(context)) {
      allChunks.push(chunk);
    }

    return {
      chunks: allChunks,
      turns: this._lastTurnCount,
      text: allChunks
        .filter((c) => c.type === ChunkType.Text || c.type === ChunkType.Code)
        .map((c) => c.content)
        .join(""),
    };
  }

  /**
   * Abort the underlying adapter execution.
   */
  abort(): void {
    this.adapter.abort();
  }

  /**
   * Get the middleware pipeline (for advanced use).
   */
  getPipeline(): MiddlewarePipeline {
    return this.pipeline;
  }

  private parseToolCall(
    content: string,
  ): { name: string; args: Record<string, unknown> } | null {
    try {
      const parsed = JSON.parse(content);
      return {
        name: parsed.name ?? parsed.toolName ?? "unknown",
        args: parsed.input ?? parsed.args ?? parsed.arguments ?? {},
      };
    } catch {
      return null;
    }
  }

  private emit(type: HarnessEvent["type"], turn: number, data?: unknown): void {
    this.onEvent?.({ type, turn, data });
  }
}

// Re-export types
export type { HarnessConfig, HarnessResult, HarnessEvent, ToolHandler, ToolExecutionContext } from "./types.js";
export type { AgentMiddleware } from "./middleware/types.js";
export { MiddlewarePipeline } from "./middleware/pipeline.js";
export { ToolRegistry } from "./tools/registry.js";
export type { Tool, ToolHandlerFn } from "./tools/types.js";
export { BlackboardMiddleware } from "./middleware/blackboard.js";
export { LocalSandbox } from "./sandbox/local-sandbox.js";
export { SandboxManager } from "./sandbox/sandbox-provider.js";
export type { Sandbox, SandboxProvider, SandboxResult } from "./sandbox/types.js";
