import type { Segmenter } from "../segmenter.js";

/** 一段既非空白、也非 CJK 的连续字符（CJK Ext-A / 基本区 / 兼容区）。 */
const NON_CJK_RUN = /^[^\s㐀-䶿一-鿿豈-﫿]+/;

/**
 * 确定性分词器：按空格切分并保留整段。
 *
 * 所有非分词测试都用它，使测试不依赖 jieba 的词典 —— 否则 jieba 升级
 * 会导致大量无关测试结果漂移（spec §8.2）。
 *
 * 它的切分策略是「按空格 + 按已知词表最长匹配 + 兜底」，足以驱动 BM25 的往返测试。
 *
 * **兜底必须与 jieba 对齐**：词表没命中时，CJK 落成单字，非 CJK 则整段保留。
 * jieba 实测把 `"User prefers tabs"` 切成 `["User","prefers","tabs"]`，**不会**
 * 拆成字母；若这里按单字符切，索引里就是 `t a b s`，而查询侧（同一个假分词器）
 * 产出的却是 `tabs` —— 两端不一致，断言会因为「假分词器与真 jieba 行为不同」
 * 而失败，与业务逻辑无关。标点无需在这里切：unicode61 会再切一次。
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
      const run = NON_CJK_RUN.exec(rest);
      if (run) {
        terms.push(run[0]);
        rest = rest.slice(run[0].length);
        continue;
      }
      terms.push(rest[0]!);
      rest = rest.slice(1);
    }

    return terms.filter((t) => t.trim().length > 0);
  }
}
