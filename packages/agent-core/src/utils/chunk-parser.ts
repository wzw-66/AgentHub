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
    };
    index?: number;
  };
}

/**
 * Parse a single line from `claude --output-format stream-json`.
 * Returns a Chunk or null if the line is not a content-bearing event.
 */
export function parseClaudeStreamJson(line: string): Chunk | null {
  if (!line.trim()) return null;

  let parsed: ClaudeStreamEvent;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  // stream_event with content_block_delta / text_delta → text chunk
  if (
    parsed.type === "stream_event" &&
    parsed.event?.type === "content_block_delta" &&
    parsed.event.delta?.type === "text_delta" &&
    parsed.event.delta.text
  ) {
    return createChunk(ChunkType.Text, parsed.event.delta.text);
  }

  // result event → done chunk with usage metadata
  if (parsed.type === "result") {
    const result = parsed as unknown as Record<string, unknown>;
    return createChunk(ChunkType.Done, "", {
      usage: result.usage,
      sessionId: result.session_id,
    });
  }

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
        parsed.message ?? "Unknown opencode error",
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
