import type { AgentContext, Chunk } from "@agenthub/shared";
import type { AgentMiddleware } from "../middleware/types.js";

/**
 * Rough estimate of token count for a string.
 * Uses ~4 characters per token as a heuristic.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * AutoCompact middleware — when the estimated context exceeds a threshold,
 * it produces a summary of the conversation history using an LLM adapter.
 *
 * This is a heavier compression strategy triggered only when needed.
 *
 * Note: This requires an `AgentAdapter` instance to perform the summarization.
 * The adapter can be the same one used for main execution, or a cheaper/faster model.
 */
export class AutoCompactMiddleware implements AgentMiddleware {
  readonly name = "auto-compact";

  private adapter: AutoCompactAdapter | null;
  private tokenThreshold: number;
  private compacted: boolean = false;
  private warned: boolean = false;

  constructor(config: AutoCompactConfig = {}) {
    this.adapter = config.adapter ?? null;
    this.tokenThreshold = config.tokenThreshold ?? 50_000;
  }

  setAdapter(adapter: AutoCompactAdapter): void {
    this.adapter = adapter;
  }

  setTokenThreshold(threshold: number): void {
    this.tokenThreshold = threshold;
  }

  beforeAgent(context: AgentContext): AgentContext {
    // Skip if already compacted, or warning already issued (no adapter case)
    if (this.compacted) return context;

    // Estimate total tokens in history + current message
    const historyTokens = context.history.reduce(
      (sum, msg) => sum + estimateTokens(msg.content),
      0,
    );
    const messageTokens = estimateTokens(context.message);
    const systemTokens = estimateTokens(context.systemPrompt ?? "");

    const totalTokens = historyTokens + messageTokens + systemTokens;

    if (totalTokens <= this.tokenThreshold) return context;

    // If we have an adapter, perform actual compaction
    if (this.adapter) {
      // In a real system, we'd trigger async summary here
      // For now, we just add a note
    }

    // Only add the warning note once
    if (!this.warned) {
      this.warned = true;
      return {
        ...context,
        systemPrompt: (context.systemPrompt ?? "") +
          `\n[Note: Context is large (~${totalTokens} tokens). Consider summarizing.]`,
      };
    }

    return context;
  }

  afterAgent(_context: AgentContext, _chunks: Chunk[]): void {
    // Could trigger async summarization here
  }

  /**
   * Perform the actual summarization of history.
   * Returns a compact context with summarized history.
   */
  async compact(context: AgentContext): Promise<AgentContext> {
    if (!this.adapter) return context;

    // Collapse older history into a summary
    const historyText = context.history
      .map((m) => `${m.senderType}: ${m.content}`)
      .join("\n");

    const summary = await this.adapter.summarize(historyText);

    this.compacted = true;

    return {
      ...context,
      history: [],
      systemPrompt: (context.systemPrompt ?? "") +
        `\n[Previous conversation summary: ${summary}]`,
    };
  }
}

/**
 * Adapter interface for auto-compact summarization.
 */
export interface AutoCompactAdapter {
  summarize(text: string): Promise<string>;
}

export interface AutoCompactConfig {
  adapter?: AutoCompactAdapter;
  tokenThreshold?: number;
}
