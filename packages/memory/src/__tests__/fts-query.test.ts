import { describe, it, expect } from "vitest";
import { buildFtsQuery } from "../fts-query.js";
import { FakeSegmenter } from "./fakes.js";

const seg = new FakeSegmenter(["缩进", "用户", "偏好", "连接池", "格式化", "脚本"]);

describe("buildFtsQuery", () => {
  it("joins terms with OR, not AND", () => {
    expect(buildFtsQuery("用户偏好缩进", seg)).toBe('"用户" OR "偏好" OR "缩进"');
  });

  it("quotes each term so FTS5 operators are not misparsed", () => {
    const q = buildFtsQuery("E_CONN_RESET -x *y (z)", seg);
    expect(q).not.toBeNull();
    for (const part of q!.split(" OR ")) {
      expect(part.startsWith('"')).toBe(true);
      expect(part.endsWith('"')).toBe(true);
    }
  });

  it("escapes embedded double quotes by doubling them", () => {
    const tricky = new FakeSegmenter(['a"b']);
    expect(buildFtsQuery('a"b', tricky)).toBe('"a""b"');
  });

  it("returns null for empty input", () => {
    expect(buildFtsQuery("", seg)).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(buildFtsQuery("   \t\n ", seg)).toBeNull();
  });

  it("returns null when segmentation yields no terms", () => {
    const empty = new FakeSegmenter([]);
    expect(buildFtsQuery("   ", empty)).toBeNull();
  });

  it("does not throw on FTS5 syntax characters", () => {
    expect(() => buildFtsQuery('NEAR("a" "b") AND ^c :d', seg)).not.toThrow();
  });
});
