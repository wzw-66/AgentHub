export { getDatabase, closeDatabase, setDbPath } from "./db.js";
export type { Database } from "./db.js";
export { initSchema } from "./schema.js";
export { createMemory, getMemory, listMemories, deleteMemory } from "./repository.js";
export { searchMemories } from "./search.js";
export { extractMemories } from "./extractor.js";
export { buildScopeClause } from "./scope.js";
export type { MemoryScope } from "./types.js";
