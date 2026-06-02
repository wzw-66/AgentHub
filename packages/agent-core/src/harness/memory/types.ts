/**
 * Memory-related types for the AgentHub memory system.
 */

/**
 * Classification of memory facts based on durability.
 */
export type MemoryClassification = "permanent" | "temporary" | "episodic";

/**
 * A single memory fact stored in the memory system.
 */
export interface MemoryFact {
  id: string;
  content: string;
  classification: MemoryClassification;
  /** ISO timestamp of when the fact was created. */
  createdAt: string;
  /** ISO timestamp of the last access. */
  lastAccessedAt: string;
  /** Number of times this fact has been accessed. */
  accessCount: number;
  /** Keywords for retrieval. */
  keywords: string[];
  /** Current relevance score (0-1). */
  score: number;
  /** Optional source reference (messageId, turn number, etc). */
  source?: string;
}

/**
 * Memory system configuration.
 */
export interface MemoryConfig {
  /** Half-life for temporary facts in days (default: 14). */
  temporaryHalfLifeDays?: number;
  /** Half-life for episodic facts in days (default: 30). */
  episodicHalfLifeDays?: number;
  /** Maximum number of facts to retrieve per query (default: 10). */
  maxRetrievalCount?: number;
  /** Minimum score for a fact to be retrieved (default: 0.05). */
  minRetrievalScore?: number;
}
