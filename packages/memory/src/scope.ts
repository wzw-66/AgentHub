import type { MemoryScope } from "./types.js";

/**
 * 把 MemoryScope 编译成 SQL 片段。
 *
 * 这是作用域的唯一实现点 —— BM25 路与向量路都调用它。若两路各写一份，
 * 分歧会只在跨项目场景下暴露（spec §8.4）。
 *
 * 用 `in` 而不是真值判断：空串 `""` 是合法的 conversationId，
 * `if (scope.conversationId)` 会把它误判成 allConversations 并返回全库记忆。
 */
export function buildScopeClause(scope: MemoryScope): { sql: string; params: string[] } {
  if ("conversationId" in scope) {
    return { sql: "r.conversation_id = ?", params: [scope.conversationId] };
  }
  return { sql: "1 = 1", params: [] };
}
