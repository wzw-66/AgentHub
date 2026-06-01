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
}

export function createClaudeStreamState(): ClaudeStreamState {
  return { pendingToolCall: null };
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

  // ── assistant message (v2.1+) ──────────────────────────────────
  if (parsed.type === "assistant" && parsed.message?.content) {
    for (const block of parsed.message.content) {
      if (block.type === "text" && block.text) {
        return createChunk(ChunkType.Text, block.text);
      }
      // Tool calls will be yielded in subsequent assistant messages
    }
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
 * Parse a single SSE `data:` line from an OpenAI-compatible streaming endpoint.
 * Returns a Chunk or null if the line is not a content-bearing data event.
 *
 * Handles:
 *   data: {"choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 */
export function parseOpenAIStreamEvent(line: string): Chunk | null {
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
      return createChunk(
        ChunkType.ToolCall,
        JSON.stringify(delta.tool_calls),
      );
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
