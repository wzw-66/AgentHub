import type { Chunk } from "@agenthub/shared";

/**
 * A tool handler receives tool call context and returns results.
 */
export type ToolHandler = (
  toolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext,
) => AsyncIterable<Chunk> | Iterable<Chunk> | Promise<string>;

export interface ToolExecutionContext {
  conversationId: string;
  /** Sandbox for file system operations (Phase 2). Null if not configured. */
  sandbox?: unknown;
}

/**
 * Events emitted by AgentHarness during execution.
 */
export interface HarnessEvent {
  type: "before_turn" | "after_turn" | "tool_start" | "tool_end" | "done" | "error";
  turn: number;
  data?: unknown;
}

/**
 * Callback for harness events.
 */
export type HarnessEventHandler = (event: HarnessEvent) => void;

/**
 * AgentHarness configuration.
 */
export interface HarnessConfig {
  /** Maximum agentic turns (default: 25). */
  maxTurns?: number;
  /** Tool handlers keyed by tool name. */
  tools?: Map<string, ToolHandler>;
  /** Event handler callback. */
  onEvent?: HarnessEventHandler;
}

/**
 * Result of a harness execution.
 */
export interface HarnessResult {
  /** All chunks produced during execution. */
  chunks: Chunk[];
  /** Number of turns taken. */
  turns: number;
  /** Full text response assembled from all text chunks. */
  text: string;
}
