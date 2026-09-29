import { describe, it, expect } from "vitest";
import { fuseRankedLists, RRF_K } from "../fusion.js";

describe("fuseRankedLists", () => {
  it("returns an empty array when every list is empty", () => {
    expect(fuseRankedLists([[], []])).toEqual([]);
  });

  it("returns an empty array when given no lists", () => {
    expect(fuseRankedLists([])).toEqual([]);
  });

  it("ranks a single list by its own order", () => {
    const out = fuseRankedLists([[{ memoryId: "a" }, { memoryId: "b" }]]);
    expect(out.map((r) => r.memoryId)).toEqual(["a", "b"]);
  });

  it("gives a higher score to rank 0 than rank 1", () => {
    const out = fuseRankedLists([[{ memoryId: "a" }, { memoryId: "b" }]]);
    expect(out[0]!.score).toBeGreaterThan(out[1]!.score);
  });

  it("uses 1/(k + rank + 1) as the per-list contribution", () => {
    const out = fuseRankedLists([[{ memoryId: "a" }]], 60);
    expect(out[0]!.score).toBeCloseTo(1 / (60 + 0 + 1), 10);
  });

  it("defaults k to RRF_K", () => {
    const withDefault = fuseRankedLists([[{ memoryId: "a" }]]);
    const withExplicit = fuseRankedLists([[{ memoryId: "a" }]], RRF_K);
    expect(withDefault[0]!.score).toBeCloseTo(withExplicit[0]!.score, 10);
  });

  it("accumulates the score of a document appearing in both lists", () => {
    const out = fuseRankedLists([
      [{ memoryId: "a" }, { memoryId: "b" }],
      [{ memoryId: "a" }, { memoryId: "c" }],
    ]);
    const a = out.find((r) => r.memoryId === "a")!;
    const b = out.find((r) => r.memoryId === "b")!;
    expect(a.score).toBeCloseTo(2 / (60 + 1), 10);
    expect(b.score).toBeCloseTo(1 / (60 + 2), 10);
    expect(a.score).toBeGreaterThan(b.score);
  });

  it("lifts a document that both legs agree on above a single-leg top hit", () => {
    const out = fuseRankedLists([
      [{ memoryId: "single-leg-top" }, { memoryId: "agreed" }],
      [{ memoryId: "agreed" }],
    ]);
    expect(out[0]!.memoryId).toBe("agreed");
  });

  it("degrades to the surviving list when one leg is empty", () => {
    const out = fuseRankedLists([[{ memoryId: "a" }, { memoryId: "b" }], []]);
    expect(out.map((r) => r.memoryId)).toEqual(["a", "b"]);
  });

  it("ignores duplicate ids within the same list, keeping the better rank", () => {
    const out = fuseRankedLists([[{ memoryId: "a" }, { memoryId: "a" }]]);
    expect(out.length).toBe(1);
    expect(out[0]!.score).toBeCloseTo(1 / (60 + 1), 10);
  });

  it("sorts by descending score", () => {
    const out = fuseRankedLists([
      [{ memoryId: "a" }, { memoryId: "b" }, { memoryId: "c" }],
      [{ memoryId: "c" }],
    ]);
    const scores = out.map((r) => r.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });
});
