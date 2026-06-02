import type { MemoryFact, MemoryConfig } from "./types.js";

/**
 * Ebbinghaus-inspired memory store with decay-based scoring.
 *
 * Score formula:
 *   score = baseScore × 0.5^(age / halfLife) × (1 + log10(accessCount))
 *
 * Three memory tiers:
 * - permanent: never decays (score stays at 1.0)
 * - temporary: 14-day half-life (ephemeral session knowledge)
 * - episodic: 30-day half-life (past interactions)
 *
 * Retrieval: keyword matching + decay score weighting.
 */
export class MemoryStore {
  private facts: Map<string, MemoryFact> = new Map();
  private config: Required<MemoryConfig>;

  constructor(config: MemoryConfig = {}) {
    this.config = {
      temporaryHalfLifeDays: config.temporaryHalfLifeDays ?? 14,
      episodicHalfLifeDays: config.episodicHalfLifeDays ?? 30,
      maxRetrievalCount: config.maxRetrievalCount ?? 10,
      minRetrievalScore: config.minRetrievalScore ?? 0.05,
    };
  }

  /**
   * Add a new fact to the store.
   */
  add(fact: Omit<MemoryFact, "id" | "createdAt" | "lastAccessedAt" | "accessCount" | "score">): MemoryFact {
    const id = this.generateId();
    const now = new Date().toISOString();
    const newFact: MemoryFact = {
      ...fact,
      id,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      score: 1.0,
    };
    this.facts.set(id, newFact);
    return newFact;
  }

  /**
   * Retrieve facts matching the given keywords, sorted by relevance score.
   */
  retrieve(keywords: string[], maxCount?: number): MemoryFact[] {
    const limit = maxCount ?? this.config.maxRetrievalCount;
    const now = Date.now();

    const scored = Array.from(this.facts.values())
      .map((fact) => {
        // Update the fact's score based on decay
        const updatedFact = this.computeScore(fact, now);
        this.facts.set(fact.id, updatedFact);

        // Compute keyword match score
        const matchScore = this.computeKeywordMatch(updatedFact, keywords);

        // Combined score: decay score × keyword match
        const combinedScore = updatedFact.score * matchScore;

        return { fact: updatedFact, combinedScore };
      })
      .filter(({ combinedScore }) => combinedScore >= this.config.minRetrievalScore)
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, limit);

    // Update access count for retrieved facts
    for (const { fact } of scored) {
      this.access(fact.id);
    }

    return scored.map(({ fact }) => fact);
  }

  /**
   * Get a fact by ID.
   */
  get(id: string): MemoryFact | undefined {
    const fact = this.facts.get(id);
    if (fact) {
      // Record access first so the score computation includes the updated count
      this.access(id);
      const updated = this.facts.get(id)!;
      return this.computeScore(updated, Date.now());
    }
    return undefined;
  }

  /**
   * Remove a fact by ID.
   */
  remove(id: string): boolean {
    return this.facts.delete(id);
  }

  /**
   * Get all facts (useful for inspection/debugging).
   */
  getAll(): MemoryFact[] {
    return Array.from(this.facts.values());
  }

  /**
   * Clear all facts.
   */
  clear(): void {
    this.facts.clear();
  }

  /**
   * Get the number of stored facts.
   */
  get size(): number {
    return this.facts.size;
  }

  /**
   * Compute the decay score for a fact based on its classification and age.
   */
  private computeScore(fact: MemoryFact, now: number): MemoryFact {
    if (fact.classification === "permanent") {
      return { ...fact, score: 1.0 };
    }

    const ageMs = now - new Date(fact.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    const halfLifeDays = fact.classification === "temporary"
      ? this.config.temporaryHalfLifeDays
      : this.config.episodicHalfLifeDays;

    // Ebbinghaus decay: score = baseScore × 0.5^(age / halfLife)
    const baseScore = 1.0;
    const decayScore = baseScore * Math.pow(0.5, ageDays / halfLifeDays);

    // Boost by access frequency: (1 + log10(accessCount))
    const accessBoost = 1 + Math.log10(Math.max(1, fact.accessCount));

    const finalScore = Math.min(1.0, decayScore * accessBoost);

    return { ...fact, score: Math.round(finalScore * 100) / 100 };
  }

  /**
   * Compute keyword match score (0-1) for a fact against query keywords.
   */
  private computeKeywordMatch(fact: MemoryFact, keywords: string[]): number {
    if (keywords.length === 0) return 0.5; // No keywords = neutral match

    const contentLower = fact.content.toLowerCase();
    const factKeywordsLower = fact.keywords.map((k) => k.toLowerCase());

    let matches = 0;
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      if (factKeywordsLower.some((fk) => fk.includes(kwLower) || kwLower.includes(fk))) {
        matches++;
      } else if (contentLower.includes(kwLower)) {
        matches += 0.5;
      }
    }

    return matches / keywords.length;
  }

  /**
   * Record an access to a fact (increment count, update timestamp).
   */
  private access(id: string): void {
    const fact = this.facts.get(id);
    if (fact) {
      this.facts.set(id, {
        ...fact,
        accessCount: fact.accessCount + 1,
        lastAccessedAt: new Date().toISOString(),
      });
    }
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
