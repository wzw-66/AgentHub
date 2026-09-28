import { describe, it, expect } from "vitest";
import { FakeSegmenter } from "./fakes.js";

/**
 * `FakeSegmenter` 是跨 ~9 个调用点的共享替身，本文件把它的**兜底行为**钉住。
 *
 * 兜底行为不是无关紧要的细节：假分词器与真 jieba 一旦不一致，v3 之后
 * 「写入侧 content_seg」与「查询侧词项」就会两端错开，测试会因为假货的行为而
 * 失败/通过，与业务逻辑无关（spec §8.2）。
 */
describe("FakeSegmenter", () => {
  it("keeps a whole ASCII run as one term, like jieba", () => {
    // 真 jieba 实测：cut("User prefers tabs over spaces for indentation")
    // 含 "User" / "prefers" / "tabs" 三个整词，不会拆成字母
    expect(new FakeSegmenter().cut("User prefers tabs")).toEqual(["User", "prefers", "tabs"]);
  });

  it("falls back to per-character terms for CJK, like jieba", () => {
    expect(new FakeSegmenter().cut("用户")).toEqual(["用", "户"]);
  });

  it("prefers the longest vocabulary match", () => {
    const seg = new FakeSegmenter(["代码", "代码风格"]);
    expect(seg.cut("代码风格")).toEqual(["代码风格"]);
  });

  it("mixes vocabulary matches with the ASCII-run fallback", () => {
    const seg = new FakeSegmenter(["缩进"]);
    expect(seg.cut("tab缩进")).toEqual(["tab", "缩进"]);
  });

  it("does not split on punctuation — unicode61 splits again downstream", () => {
    expect(new FakeSegmenter().cut("tabs, spaces")).toEqual(["tabs,", "spaces"]);
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(new FakeSegmenter().cut("")).toEqual([]);
    expect(new FakeSegmenter().cut("   ")).toEqual([]);
  });
});
