import { describe, it, expect } from "vitest";
import { createJiebaSegmenter } from "../segmenter.js";

/**
 * 这是本仓库唯一依赖 jieba 具体词典的测试文件。
 *
 * 其余测试一律用 FakeSegmenter（见 fakes.ts）—— 否则 jieba 升级会导致大量
 * 无关测试结果漂移（spec §8.2）。这里断言的是词典极稳定的常用词，且断言的
 * 是「中文词不会被切成单字」这个性质本身，不是精确的分词序列。
 */
describe("createJiebaSegmenter", () => {
  const seg = createJiebaSegmenter();

  it("is synchronous — no init() or await is required", () => {
    expect(typeof createJiebaSegmenter).toBe("function");
    // 若某个改动引入了异步初始化，这里会变成 Promise 并且 cut 不存在
    expect(typeof seg.cut).toBe("function");
  });

  it("keeps two-character Chinese words as single tokens", () => {
    // 这是空词典陷阱的直接防线：@node-rs/jieba 的 `new Jieba()`（不 loadDict）
    // 会把「缩进」切成「缩」「进」，且不抛错（spec §8.2 实测成词 0/5）。
    expect(seg.cut("缩进")).toEqual(["缩进"]);
    expect(seg.cut("接口")).toEqual(["接口"]);
    expect(seg.cut("性能")).toEqual(["性能"]);
  });

  it("segments a mixed Chinese/identifier sentence into real words", () => {
    const terms = seg.cut("用户偏好使用 tab 缩进");
    expect(terms).toContain("用户");
    expect(terms).toContain("偏好");
    expect(terms).toContain("缩进");
  });

  it("drops whitespace-only tokens", () => {
    const terms = seg.cut("用户偏好使用 tab 缩进");
    for (const t of terms) {
      expect(t.trim().length).toBeGreaterThan(0);
    }
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(seg.cut("")).toEqual([]);
    expect(seg.cut("   ")).toEqual([]);
  });

  it("is deterministic across calls", () => {
    const text = "连接池被打满，pool_size 从 10 调到 20 后压测通过";
    expect(seg.cut(text)).toEqual(seg.cut(text));
  });
});
