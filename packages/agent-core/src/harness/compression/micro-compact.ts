import type { AgentContext, Chunk } from "@agenthub/shared";
import type { AgentMiddleware } from "../middleware/types.js";

/**
 * MicroCompact middleware — replaces verbose tool results with short
 * placeholders after each agent turn.
 *
 * This is a "zero-cost" compression strategy applied every turn:
 * Instead of keeping the full tool output (which can be thousands of tokens),
 * it replaces it with a compact summary like:
 *   [Previous: used read_file → 2KB result]
 *
 * This preserves the essential signal ("a tool was used, here's what it did")
 * while dramatically reducing token consumption for free.
 */
export class MicroCompactMiddleware implements AgentMiddleware {
  readonly name = "micro-compact";
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  beforeAgent(context: AgentContext): AgentContext {
    if (!this.enabled) return context;

    // Compact tool result entries in the current message
    const compacted = this.compactMessage(context.message);
    if (compacted !== context.message) {
      return { ...context, message: compacted };
    }
    return context;
  }

  afterAgent(_context: AgentContext, _chunks: Chunk[]): void {
    // No-op: compression happens on the next beforeAgent call
  }

  /**
   * Replace verbose tool result blocks with compact placeholders.
   */
  private compactMessage(message: string): string {
    // Pattern: [Tool: name]\nInput: {...}\nOutput: <long output>
    return message.replace(
      /\[Tool: (\w+)\]\nInput: .*?\nOutput: ([\s\S]*?)$/gm,
      (_match, toolName: string, output: string) => {
        const sizeHint = output.length < 100
          ? output.trim()
          : `${output.slice(0, 50).trim()}... (${output.length} chars)`;
        return `[Previous: used ${toolName} → ${sizeHint}]`;
      },
    );
  }
}
