import type { AgentContext, Chunk } from "@agenthub/shared";

/**
 * Middleware interface for AgentHarness.
 *
 * Each hook is optional and runs at the corresponding lifecycle phase:
 * - beforeAgent: runs before each agent turn, can modify the context
 * - afterAgent: runs after each agent turn, has access to produced chunks
 * - onError: runs when an error occurs during execution
 */
export interface AgentMiddleware {
  /** Unique name for the middleware (for debugging / dedup). */
  name?: string;

  /**
   * Called before each agent execution turn.
   * Can modify the context (e.g., inject memory, compress history).
   */
  beforeAgent?(context: AgentContext): AgentContext | Promise<AgentContext>;

  /**
   * Called after each agent execution turn.
   * Receives the chunks produced in that turn.
   */
  afterAgent?(context: AgentContext, chunks: Chunk[]): void | Promise<void>;

  /**
   * Called when an error occurs during execution.
   */
  onError?(error: Error): void | Promise<void>;
}

/**
 * A merged context that carries state across middleware pipeline runs.
 */
export interface MiddlewareContext {
  state: Map<string, unknown>;
}
