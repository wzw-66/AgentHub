import type { AgentContext, Chunk } from "@agenthub/shared";
import type { AgentMiddleware } from "./types.js";

/**
 * In-memory blackboard (key-value store) middleware.
 *
 * Allows sharing state across middleware and agent turns.
 * Useful for tracking conversation state, counters, etc.
 */
export class BlackboardMiddleware implements AgentMiddleware {
  readonly name = "blackboard";
  private store: Map<string, unknown> = new Map();

  /**
   * Get a value from the blackboard.
   */
  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  /**
   * Set a value in the blackboard.
   */
  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  /**
   * Delete a key from the blackboard.
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Check if a key exists.
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Get all entries.
   */
  entries(): Map<string, unknown> {
    return new Map(this.store);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.store.clear();
  }

  beforeAgent(context: AgentContext): AgentContext {
    // Inject blackboard keys as a comment in the system prompt
    if (this.store.size > 0) {
      const entries = Array.from(this.store.entries())
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n");
      const blackboardNote = `\n[Blackboard State]\n${entries}\n`;
      return {
        ...context,
        systemPrompt: (context.systemPrompt ?? "") + blackboardNote,
      };
    }
    return context;
  }

  afterAgent(_context: AgentContext, _chunks: Chunk[]): void {
    // No-op: could extract state from chunks here
  }
}
