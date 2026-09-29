/** RRF 的通行取值，不做调参 —— RRF 的卖点正是不需要调参（spec §8.5）。 */
export const RRF_K = 60;

/**
 * Reciprocal Rank Fusion：把多个榜单合成一个排序。
 *
 * **只使用名次，不使用分数。** BM25 分数无上界（FTS5 的 `rank` 越小越相关），
 * 余弦在 [-1,1]，量纲不可比 —— 用名次彻底绕开归一化问题。
 *
 * 关键性质：**缺失的榜单就是空集，融合逻辑里不需要任何降级分支。**
 * - 某条记忆尚未嵌入 → 它只出现在 BM25 榜单，向量榜单没有它 → 照样得分
 * - 查询向量化失败 → 向量榜单为空 → 退化为纯 BM25
 */
export function fuseRankedLists(
  lists: Array<Array<{ memoryId: string }>>,
  k: number = RRF_K,
): Array<{ memoryId: string; score: number }> {
  const scores = new Map<string, number>();

  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((item, rank) => {
      // 同一榜单内的重复 id 只计一次，且保留更好的名次
      if (seen.has(item.memoryId)) return;
      seen.add(item.memoryId);
      scores.set(item.memoryId, (scores.get(item.memoryId) ?? 0) + 1 / (k + rank + 1));
    });
  }

  // 分数相同时靠 Map 的插入顺序（即榜首次序）决定，V8 的 sort 稳定，排序可复现。
  return [...scores.entries()]
    .map(([memoryId, score]) => ({ memoryId, score }))
    .sort((a, b) => b.score - a.score);
}
