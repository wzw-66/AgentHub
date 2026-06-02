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
   * Yields chunks as they are produced across all turns of the agentic loop.
   */
  async *execute(context: AgentContext): AsyncIterable<Chunk> {
    const result = await this.executeWithResult(context);
    for (const chunk of result.chunks) {
      yield chunk;
    }
  }

  /**
   * Execute and collect all chunks into a HarnessResult.
   */
  async executeWithResult(context: AgentContext): Promise<HarnessResult> {
    const allChunks: Chunk[] = [];
    let turn = 0;
    let workingContext: AgentContext = { ...context };

    while (turn < this.maxTurns) {
      turn++;
      this.emit("before_turn", turn, { turn });

      // Run beforeAgent middleware
      workingContext = await this.pipeline.runBeforeAgent(workingContext);

      const turnChunks: Chunk[] = [];

      // Collect all chunks from this turn.
      // Do NOT break on Done — the adapter may emit ToolCall chunks after
      // flushing accumulated streaming tool call deltas. Early termination
      // via iterator.return() would silently swallow those yields.
      for await (const chunk of this.adapter.execute(workingContext)) {
        turnChunks.push(chunk);
      }

      // Run afterAgent middleware
      await this.pipeline.runAfterAgent(workingContext, turnChunks);

      // Find tool calls in this turn
      const toolCalls = turnChunks.filter((c) => c.type === ChunkType.ToolCall);

      if (toolCalls.length === 0) {
        // No tool calls — execution is complete
        allChunks.push(...turnChunks);
        break;
      }

      // Process tool calls
      const toolMessages: ToolMessage[] = [];
      for (const toolCall of toolCalls) {
        allChunks.push(toolCall);
        const parsed = this.parseToolCall(toolCall.content);
        if (!parsed) {
          allChunks.push(createChunk(ChunkType.Error, `Failed to parse tool call: ${toolCall.content}`));
          continue;
        }

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

        const handler = this.tools.get(parsed.name);
        if (!handler) {
          // Try the tool registry as fallback
          if (this.toolRegistry?.has(parsed.name)) {
            const toolExecContext: ToolExecutionContext = {
              conversationId: workingContext.conversationId,
              sandbox: this.sandbox ?? undefined,
            };

            this.emit("tool_start", turn, { toolName: parsed.name, args: parsed.args });

            let toolResult = "";
            try {
              toolResult = await this.toolRegistry.execute(parsed.name, parsed.args, toolExecContext);
            } catch (err) {
              toolResult = err instanceof Error ? err.message : "Unknown tool error";
            }

            this.emit("tool_end", turn, { toolName: parsed.name, result: toolResult });
            toolMessages.push({
              role: "tool",
              content: toolResult,
              toolCallId,
              toolName: parsed.name,
            });
            continue;
          }

          allChunks.push(createChunk(ChunkType.Error, `Unknown tool: ${parsed.name}`));
          continue;
        }

        this.emit("tool_start", turn, { toolName: parsed.name, args: parsed.args });

        // Execute the tool handler
        const toolExecContext: ToolExecutionContext = {
          conversationId: workingContext.conversationId,
          sandbox: this.sandbox ?? undefined,
        };

        let toolResult = "";
        try {
          const rawResult = handler(parsed.name, parsed.args, toolExecContext);
          for await (const resultChunk of normalizeToolResult(rawResult)) {
            toolResult += typeof resultChunk === "string" ? resultChunk : resultChunk.content;
          }
        } catch (err) {
          toolResult = err instanceof Error ? err.message : "Unknown tool error";
        }

        this.emit("tool_end", turn, { toolName: parsed.name, result: toolResult });

        // Record the tool result message
        toolMessages.push({
          role: "tool",
          content: toolResult,
          toolCallId,
          toolName: parsed.name,
        });
      }

      // Inject tool messages for the next turn so the adapter sends
      // proper "assistant" (tool_call) and "tool" role messages to the LLM.
      const existing = workingContext.toolMessages ?? [];
      workingContext = {
        ...workingContext,
        toolMessages: [...existing, ...toolMessages],
        message: "Continue with the tool results above.",
      };

      this.emit("after_turn", turn, { turn, toolCallCount: toolCalls.length });
    }

    // If we hit maxTurns, emit a note
    if (turn >= this.maxTurns) {
      allChunks.push(createChunk(ChunkType.Text, `\n\n[Execution stopped after ${this.maxTurns} turns]`));
    }

    // Append final Done chunk if not present
    if (!allChunks.some((c) => c.type === ChunkType.Done)) {
      allChunks.push(createChunk(ChunkType.Done, ""));
    }

    this.emit("done", turn, {});

    return {
      chunks: allChunks,
      turns: turn,
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
