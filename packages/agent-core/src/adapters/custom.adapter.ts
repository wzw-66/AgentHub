import type { AgentAdapter, AgentContext, Chunk, HealthStatus } from "@agenthub/shared";
import { ChunkType, SenderType } from "@agenthub/shared";
import {
  createChunk,
  parseOpenAIStreamEvent,
  createOpenAIStreamState,
} from "../utils/chunk-parser.js";

export interface CustomAgentAdapterConfig {
  /** LLM API endpoint URL (e.g., "https://api.openai.com/v1/chat/completions"). */
  endpoint: string;
  /** API key for authentication. */
  apiKey?: string;
  /** Model identifier (e.g., "gpt-4o", "claude-sonnet-4-6"). */
  model: string;
  /** Timeout in milliseconds. Default: 120000 (2 min). */
  timeout?: number;
  /** Optional custom headers to include in requests. */
  headers?: Record<string, string>;
}

/**
 * Adapter that calls an external LLM API via HTTP (OpenAI-compatible format).
 *
 * Uses the standard Chat Completions API with SSE streaming. Compatible with
 * OpenAI, together.ai, Groq, vLLM, Ollama, and any endpoint that follows
 * the OpenAI streaming contract.
 *
 * @example
 * ```ts
 * const adapter = new CustomAgentAdapter({
 *   endpoint: "https://api.openai.com/v1/chat/completions",
 *   apiKey: "sk-...",
 *   model: "gpt-4o",
 * });
 * for await (const chunk of adapter.execute(context)) {
 *   console.log(chunk);
 * }
 * ```
 */
export class CustomAgentAdapter implements AgentAdapter {
  private abortController: AbortController | null = null;

  constructor(private config: CustomAgentAdapterConfig) {}

  async *execute(context: AgentContext): AsyncIterable<Chunk> {
    this.abortController = new AbortController();

    const messages = this.buildMessages(context);
    const tools = this.buildTools(context);

    const timeout = this.config.timeout ?? 120000;
    const timeoutSignal = AbortSignal.timeout(timeout);

    // Combine abort controller with timeout
    const combinedSignal = AbortSignal.any([
      this.abortController.signal,
      timeoutSignal,
    ]);

    // Stateful accumulator for streaming tool call deltas
    const streamState = createOpenAIStreamState();

    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        messages,
        stream: true,
      };
      if (tools.length > 0) {
        body.tools = tools;
      }

      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
          ...this.config.headers,
        },
        body: JSON.stringify(body),
        signal: combinedSignal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        yield createChunk(
          ChunkType.Error,
          `HTTP ${response.status}: ${errorText}`,
        );
        yield createChunk(ChunkType.Done, "");
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = parseOpenAIStreamEvent(line, streamState);
          if (chunk) {
            yield chunk;
            if (chunk.type === ChunkType.Done) break;
          }
        }
      }

      // Flush accumulated tool calls from streaming deltas
      for (const [index, tc] of streamState.pendingToolCalls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.arguments);
        } catch {
          parsedArgs = { _raw: tc.arguments };
        }
        yield createChunk(
          ChunkType.ToolCall,
          JSON.stringify({
            id: tc.id || `call_${index}`,
            name: tc.name,
            input: parsedArgs,
          }),
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        yield createChunk(ChunkType.Error, "Request was aborted");
      } else {
        yield createChunk(
          ChunkType.Error,
          error instanceof Error ? error.message : "Unknown fetch error",
        );
      }
    }
  }

  abort(): void {
    this.abortController?.abort();
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: "user", content: "ping" }],
          stream: false,
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });

      return response.ok
        ? { status: "healthy" as const, latency: Date.now() - start }
        : {
            status: "unhealthy" as const,
            latency: Date.now() - start,
            message: `HTTP ${response.status}`,
          };
    } catch (error) {
      return {
        status: "unhealthy" as const,
        latency: Date.now() - start,
        message: error instanceof Error ? error.message : "Health check failed",
      };
    }
  }

  private buildMessages(
    context: AgentContext,
  ): Record<string, unknown>[] {
    const messages: Record<string, unknown>[] = [];

    // Inject system prompt if provided
    if (context.systemPrompt) {
      messages.push({ role: "system", content: context.systemPrompt });
    }

    for (const msg of context.history) {
      const role =
        msg.senderType === SenderType.User
          ? "user"
          : "assistant";
      messages.push({ role, content: msg.content });
    }

    // Inject tool messages (assistant tool call + tool result pairs)
    if (context.toolMessages) {
      for (const tm of context.toolMessages) {
        if (tm.role === "assistant") {
          // Assistant message containing a tool call
          let toolCallArgs: Record<string, unknown>;
          try {
            toolCallArgs = JSON.parse(tm.content);
          } catch {
            toolCallArgs = { _raw: tm.content };
          }
          messages.push({
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: tm.toolCallId ?? "call_default",
                type: "function",
                function: {
                  name: tm.toolName ?? "unknown",
                  arguments: JSON.stringify(toolCallArgs),
                },
              },
            ],
          });
        } else if (tm.role === "tool") {
          messages.push({
            role: "tool",
            content: tm.content,
            tool_call_id: tm.toolCallId ?? "call_default",
          });
        }
      }
    }

    // Current user message
    messages.push({ role: "user", content: context.message });

    return messages;
  }

  /**
   * Convert AgentContext tools to OpenAI-compatible tools format.
   */
  private buildTools(
    context: AgentContext,
  ): Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
    if (!context.tools || context.tools.length === 0) return [];
    return context.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as Record<string, unknown>,
      },
    }));
  }
}
