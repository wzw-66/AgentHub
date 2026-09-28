// 静态 ESM import —— **不要用 require()**。
// 本包是 "type": "module"，源码是 ESM，`require` 在运行时不存在。
//
// 条件导出的走向已实测确认：这个 import 解析到 pkg/nodejs/（同步构建），
// 因为 Node 的条件解析顺序里 "node" 优先于 "import"。若某个打包器不设
// "node" 条件，会解析到 pkg/web/（异步构建，需要 await init()）——
// 那时 `cut is not a function`，是响亮失败，不是静默错误。
import { cut } from "jieba-wasm";

/**
 * 中文分词器。
 *
 * 存在的理由：FTS5 的 unicode61 分词器不切分 CJK，整句会被当成一个 token，
 * 只有整句精确匹配才命中（spec §1 第 1 条）。写入与查询前在应用层切词、
 * 用空格连接，unicode61 就能得到真正的词级 token。
 *
 * 容错性质：写入与查询走同一个 Segmenter。即使分词分错了，只要两端错得一致，
 * 匹配依然成立 —— 因此分词精度不敏感（spec §8.2）。
 */
export interface Segmenter {
  readonly id: string;
  /** 返回词项，不含空白。 */
  cut(text: string): string[];
}

/**
 * 基于 jieba-wasm 的实现。
 *
 * **同步。** Node 下 jieba-wasm 在模块加载时同步实例化 WASM，`cut()` 同步返回，
 * 包里没有 `init` 导出。异步初始化只存在于浏览器构建（见文件头的说明）。
 *
 * 选它而不是更快的 @node-rs/jieba：后者需要 `Jieba.withDict(dict)`，
 * 而 `new Jieba()`（不传词典）会返回**全是单字**的合法数组且不抛错 ——
 * 实测成词 0/5。因为写入与查询两端一致就仍能召回，这个错误只会表现为
 * 「检索精度变差」，是最难排查的一类（spec §8.2）。
 */
export function createJiebaSegmenter(): Segmenter {
  return {
    id: "jieba-wasm",
    cut(text: string): string[] {
      if (!text || text.trim().length === 0) return [];
      return cut(text).filter((t) => t.trim().length > 0);
    },
  };
}
