import type { Segmenter } from "../segmenter.js";

/**
 * 确定性分词器：按空格切分并保留整段。
 *
 * 所有非分词测试都用它，使测试不依赖 jieba 的词典 —— 否则 jieba 升级
 * 会导致大量无关测试结果漂移（spec §8.2）。
 *
 * 它的切分策略是「按空格 + 按已知词表最长匹配」，足以驱动 BM25 的往返测试。
 */
export class FakeSegmenter implements Segmenter {
  readonly id = "fake";

  constructor(private readonly vocabulary: string[] = []) {}

  cut(text: string): string[] {
    if (!text || text.trim().length === 0) return [];

    const terms: string[] = [];
    const sorted = [...this.vocabulary].sort((a, b) => b.length - a.length);
    let rest = text;

    outer: while (rest.length > 0) {
      if (/\s/.test(rest[0]!)) {
        rest = rest.slice(1);
        continue;
      }
      for (const word of sorted) {
        if (word.length > 0 && rest.startsWith(word)) {
          terms.push(word);
          rest = rest.slice(word.length);
          continue outer;
        }
      }
      terms.push(rest[0]!);
      rest = rest.slice(1);
    }

    return terms.filter((t) => t.trim().length > 0);
  }
}
