export { getDatabase, closeDatabase, setDbPath } from "./db.js";
export type { Database } from "./db.js";
export { initSchema } from "./schema.js";
export { migrate, currentVersion } from "./migrations.js";
export { createMemory, getMemory, listMemories, deleteMemory } from "./repository.js";
export { searchMemories } from "./search.js";
export { extractMemories } from "./extractor.js";
export { buildScopeClause } from "./scope.js";
export { createJiebaSegmenter } from "./segmenter.js";
export type { Segmenter } from "./segmenter.js";
export { buildFtsQuery } from "./fts-query.js";
export { reindexMemories, isBm25Ready, REINDEX_TIMEOUT_MS } from "./worker.js";
export {
  normalize,
  assertFiniteVector,
  buildFingerprint,
  createOpenAICompatibleEmbeddingProvider,
} from "./embedding.js";
export type {
  EmbeddingProvider,
  EmbeddingFingerprint,
  OpenAICompatibleEmbeddingOptions,
} from "./embedding.js";
export type { MemoryScope, EmbeddingMode } from "./types.js";
