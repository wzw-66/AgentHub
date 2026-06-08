import type { Chunk } from "@agenthub/shared";
import { ChunkType, AgentProvider } from "@agenthub/shared";

/**
 * Create a standard Chunk object with auto-generated ISO timestamp.
 * Pure function — works in any JS runtime (Node.js, browser, etc.).
 */
export function createChunk(
  type: ChunkType,
  content: string,
  metadata?: Record<string, unknown>,
): Chunk {
  const chunk: Chunk = {
    type,
    content,
    timestamp: new Date().toISOString(),
  };
  if (metadata !== undefined) {
    chunk.metadata = metadata;
  }
  return chunk;
}

/**
 * Returns true if the chunk is a Done-type chunk (signals stream end).
 */
export function isDoneChunk(chunk: Chunk): boolean {
  return chunk.type === ChunkType.Done;
}

// ─── Claude stream-json parser ────────────────────────────────────────

interface ClaudeStreamEvent {
  type: string;
  event?: {
    type: string;
    delta?: {
      type: string;
      text?: string;
      partial_json?: string;
    };
    index?: number;
    content_block?: {
      type: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    };
  };
  session_id?: string;
  usage?: Record<string, unknown>;
  // v2.1+ format: top-level assistant messages with content blocks
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
}

/**
 * State tracker for Claude stream parsing.
 * Required to handle multi-line tool call events (input_json_delta).
 */
export interface ClaudeStreamState {
  /** Accumulated tool call info while streaming input_json_delta */
  pendingToolCall: { id: string; name: string; input: string } | null;
  /** Whether any text_delta has been received — used to skip duplicate
   *  full-text from assistant events when --include-partial-messages is set */
  hasStreamedText: boolean;
}

export function createClaudeStreamState(): ClaudeStreamState {
  return { pendingToolCall: null, hasStreamedText: false };
}

/**
 * Parse a single line from `claude --output-format stream-json`.
 *
 * For basic text streaming, call without state (backward compatible).
 * For full parsing including tool calls, pass a `ClaudeStreamState` created
 * via `createClaudeStreamState()` and reuse it across all lines of the stream.
 *
 * Returns a Chunk or null if the line is not a content-bearing event.
 *
 * Supports two output formats:
 * - Old format: stream_event with content_block_delta / text_delta
 * - New format (v2.1+): top-level assistant messages with content blocks
 */
export function parseClaudeStreamJson(line: string, state?: ClaudeStreamState): Chunk | null {
  if (!line.trim()) return null;

  let parsed: ClaudeStreamEvent;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  // ── stream_event sub-types ────────────────────────────────────────
  if (parsed.type === "stream_event") {
    const event = parsed.event;
    if (!event) return null;

    // content_block_delta → text_delta (text) or input_json_delta (tool args)
    if (event.type === "content_block_delta") {
      const delta = event.delta;
      if (!delta) return null;

      // Text content
      if (delta.type === "text_delta" && delta.text) {
        if (state) state.hasStreamedText = true;
        return createChunk(ChunkType.Text, delta.text);
      }

      // Tool call input (accumulated across multiple lines)
      if (delta.type === "input_json_delta" && state?.pendingToolCall) {
        state.pendingToolCall.input += delta.partial_json ?? "";
        return null;
      }

      return null;
    }

    // content_block_start → detect tool_use blocks
    if (event.type === "content_block_start" && state) {
      const block = event.content_block;
      if (block?.type === "tool_use") {
        state.pendingToolCall = {
          id: block.id ?? "",
          name: block.name ?? "",
          input: block.input && Object.keys(block.input).length > 0 ? JSON.stringify(block.input) : "",
        };
        return null;
      }
      return null;
    }

    // content_block_stop → finalize accumulated tool call
    if (event.type === "content_block_stop" && state?.pendingToolCall) {
      const tool = state.pendingToolCall;
      state.pendingToolCall = null;
      return createChunk(ChunkType.ToolCall, JSON.stringify({
        id: tool.id,
        name: tool.name,
        input: tool.input,
      }));
    }

    return null;
  }

  // ── assistant message (v2.1+) — full-text event, skip if text was already
  //    streamed via content_block_delta/text_delta (avoid duplication when
  //    --include-partial-messages is set, which causes both to be emitted)
  if (parsed.type === "assistant" && parsed.message?.content) {
    if (!state?.hasStreamedText) {
      for (const block of parsed.message.content) {
        if (block.type === "text" && block.text) {
          return createChunk(ChunkType.Text, block.text);
        }
        // Tool calls will be yielded in subsequent assistant messages
      }
    }
    return null;
  }

  // ── message_delta (informational) ───────────────────────────────
  if (parsed.type === "message_delta") {
    return null;
  }

  // ── result event → done chunk with usage metadata ──────────────
  if (parsed.type === "result") {
    return createChunk(ChunkType.Done, "", {
      usage: parsed.usage,
      sessionId: parsed.session_id,
    });
  }

  // init, ping, etc. → silently ignored
  return null;
}

// ─── OpenCode NDJSON parser ───────────────────────────────────────────

interface OpenCodeEvent {
  type: string;
  content?: string;
  name?: string;
  input?: Record<string, unknown>;
  state?: { output?: string; error?: string };
  message?: string;
  tokens?: Record<string, unknown>;
  cost?: number;
  reason?: string;
  timestamp?: number;
  sessionID?: string;
  part?: {
    type?: string;
    text?: string;
    id?: string;
  };
  error?: {
    name?: string;
    data?: {
      message?: string;
    };
  };
}

/**
 * Parse a single line from `opencode run --format json`.
 * Returns a Chunk or null if the line is not a content-bearing event.
 */
export function parseOpenCodeEvent(line: string): Chunk | null {
  if (!line.trim()) return null;

  let parsed: OpenCodeEvent;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  switch (parsed.type) {
    case "text":
      if (parsed.content !== undefined) {
        return createChunk(ChunkType.Text, parsed.content);
      }
      if (parsed.part?.text !== undefined) {
        return createChunk(ChunkType.Text, parsed.part.text);
      }
      return null;

    case "tool_use":
      return createChunk(ChunkType.ToolCall, JSON.stringify({
        name: parsed.name,
        input: parsed.input,
        output: parsed.state?.output,
      }));

    case "error":
      return createChunk(
        ChunkType.Error,
        parsed.message
          ?? parsed.error?.data?.message
          ?? "Unknown opencode error",
      );

    case "step_finish":
      return createChunk(ChunkType.Done, "", {
        tokens: parsed.tokens,
        cost: parsed.cost,
        reason: parsed.reason,
      });

    default:
      return null;
  }
}

// ─── OpenAI SSE parser ─────────────────────────────────────────────────

/**
 * State tracker for OpenAI stream parsing.
 * Required to handle multi-event tool call deltas.
 */
export interface OpenAIStreamState {
  /** Accumulated tool call info across streaming deltas */
  pendingToolCalls: Map<number, { id: string; name: string; arguments: string }>;
}

export function createOpenAIStreamState(): OpenAIStreamState {
  return { pendingToolCalls: new Map() };
}

/**
 * Parse a single SSE `data:` line from an OpenAI-compatible streaming endpoint.
 * Returns a Chunk or null if the line is not a content-bearing data event.
 *
 * Handles:
 *   data: {"choices":[{"delta":{"content":"..."}}]}
 *   data: {"choices":[{"delta":{"tool_calls":[{"id":"call_xxx","function":{"name":"xxx","arguments":"..."}}]}}]}
 *   data: [DONE]
 *
 * For proper tool call accumulation across multiple SSE events, pass a
 * `OpenAIStreamState` created via `createOpenAIStreamState()` and reuse it
 * across all lines of the stream.
 */
export function parseOpenAIStreamEvent(line: string, state?: OpenAIStreamState): Chunk | null {
  if (!line.startsWith("data: ")) return null;

  const payload = line.slice(6).trim();

  // Stream end signal
  if (payload === "[DONE]") {
    return createChunk(ChunkType.Done, "");
  }

  try {
    const parsed = JSON.parse(payload);
    const delta = parsed.choices?.[0]?.delta;
    if (!delta) return null;

    if (delta.content) {
      return createChunk(ChunkType.Text, delta.content);
    }

    if (delta.tool_calls) {
      // Process each tool call delta — accumulate across streaming events using state
      for (const tc of delta.tool_calls) {
        const index = tc.index ?? 0;
        const fn = tc.function ?? {};
        if (state) {
          if (!state.pendingToolCalls.has(index)) {
            // First delta for this tool call — has id and name
            state.pendingToolCalls.set(index, {
              id: tc.id ?? "",
              name: fn.name ?? "",
              arguments: fn.arguments ?? "",
            });
          } else {
            // Subsequent delta — accumulate arguments
            const existing = state.pendingToolCalls.get(index)!;
            existing.arguments += fn.arguments ?? "";
          }
        } else {
          // No state: emit raw tool call, best-effort for simple cases
          return createChunk(
            ChunkType.ToolCall,
            JSON.stringify({
              name: fn.name ?? "unknown",
              input: fn.arguments ?? "",
            }),
          );
        }
      }
      return null; // Don't emit until tool call is complete
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Unified dispatch ─────────────────────────────────────────────────

/**
 * Parse a single event line from any supported provider.
 * Dispatches to the provider-specific parser based on `provider`.
 */
export function parseEventLine(
  provider: AgentProvider,
  line: string,
): Chunk | null {
  switch (provider) {
    case AgentProvider.Claude:
      return parseClaudeStreamJson(line);
    case AgentProvider.OpenCode:
      return parseOpenCodeEvent(line);
    case AgentProvider.Custom:
      return parseOpenAIStreamEvent(line);
    default:
      return null;
  }
}
