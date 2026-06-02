import type { AgentContext, Chunk } from "@agenthub/shared";
import type { AgentMiddleware } from "../middleware/types.js";
import { MemoryStore } from "./store.js";
import type { MemoryConfig } from "./types.js";

/**
 * Memory middleware that bridges the MemoryStore with the AgentHarness lifecycle.
 *
 * - beforeAgent: retrieves relevant facts from the store and injects them into the
 *   system prompt as context.
 * - afterAgent: extracts potential new facts from agent output (with debounce).
 *
 * Production note: Fact extraction typically requires an LLM call. This implementation
 * provides a keyword-based heuristic as a starting point. Replace `extractFacts()`
 * with an LLM-based extractor for production use.
 */
export class MemoryMiddleware implements AgentMiddleware {
  readonly name = "memory";

  private store: MemoryStore;
  private debounceMs: number;
  private lastExtractTime: number = 0;

  constructor(config: MemoryConfig & { debounceMs?: number } = {}) {
    this.store = new MemoryStore(config);
    this.debounceMs = config.debounceMs ?? 30_000;
  }

  /**
   * Access the underlying memory store.
   */
  getStore(): MemoryStore {
    return this.store;
  }

  beforeAgent(context: AgentContext): AgentContext {
    // Extract keywords from the current message
    const keywords = this.extractKeywords(context.message);

    if (keywords.length === 0) return context;

    // Retrieve relevant facts
    const relevantFacts = this.store.retrieve(keywords);

    if (relevantFacts.length === 0) return context;

    // Inject facts into the system prompt
    const factsText = relevantFacts
      .map((f) => `- ${f.content} (relevance: ${f.score})`)
      .join("\n");

    const memoryBlock = `\n\n[Relevant Memories]\n${factsText}\n`;

    return {
      ...context,
      systemPrompt: (context.systemPrompt ?? "") + memoryBlock,
    };
  }

  afterAgent(_context: AgentContext, chunks: Chunk[]): void {
    // Debounce: avoid extracting on every turn
    const now = Date.now();
    if (now - this.lastExtractTime < this.debounceMs) return;
    this.lastExtractTime = now;

    // Extract facts from agent output
    const outputText = chunks
      .filter((c) => c.type === "text")
      .map((c) => c.content)
      .join(" ");

    const facts = this.extractFacts(outputText);
    for (const fact of facts) {
      this.store.add(fact);
    }
  }

  /**
   * Simple keyword extraction from text.
   * Split on spaces, filter short words, deduplicate, take top N.
   */
  private extractKeywords(text: string, maxKeywords: number = 10): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const unique = [...new Set(words)];
    return unique.slice(0, maxKeywords);
  }

  /**
   * Heuristic fact extraction from agent output.
   *
   * In production, replace this with an LLM call to extract meaningful facts.
   * This heuristic extracts sentences containing key phrases.
   */
  private extractFacts(text: string): Array<{
    content: string;
    classification: "temporary";
    keywords: string[];
  }> {
    if (!text.trim()) return [];

    const facts: Array<{
      content: string;
      classification: "temporary";
      keywords: string[];
    }> = [];

    // Split into sentences and look for potentially factual ones
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20);

    const factualIndicators = [
      "is", "are", "was", "were", "has", "have", "contains",
      "located", "called", "known", "defined", "refers",
    ];

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase().trim();
      // Check if sentence contains factual indicators
      if (factualIndicators.some((ind) => lower.includes(ind))) {
        const keywords = this.extractKeywords(sentence, 5);
        facts.push({
          content: sentence.trim(),
          classification: "temporary",
          keywords,
        });
      }

      // Limit to 3 facts per turn
      if (facts.length >= 3) break;
    }

    return facts;
  }
}
