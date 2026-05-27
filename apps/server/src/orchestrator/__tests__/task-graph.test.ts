import { describe, it, expect } from "vitest";
import { buildDAG, detectCycle, topSort, CycleDetectedError, buildLayers } from "../task-graph.js";
import type { SubTask } from "../types.js";

function makeSubTask(id: string, dependsOn: string[] = []): SubTask {
  return {
    id,
    parentMessageId: "msg_1",
    conversationId: "conv_1",
    agentId: `agent_${id}`,
    agentName: `Agent${id}`,
    instruction: "do something",
    dependsOn,
    context: [],
    status: "pending",
    retryCount: 0,
  };
}

describe("buildDAG", () => {
  it("creates adjacency list from sub-tasks", () => {
    const tasks = [makeSubTask("a"), makeSubTask("b", ["a"])];
    const dag = buildDAG(tasks);
    expect(dag.get("a")).toEqual([]);
    expect(dag.get("b")).toEqual(["a"]);
  });

  it("returns empty map for empty input", () => {
    expect(buildDAG([]).size).toBe(0);
  });
});

describe("detectCycle", () => {
  it("returns null for acyclic graph", () => {
    const tasks = [
      makeSubTask("a"),
      makeSubTask("b", ["a"]),
      makeSubTask("c", ["b"]),
    ];
    expect(detectCycle(tasks)).toBeNull();
  });

  it("detects direct cycle (a → b → a)", () => {
    const tasks = [
      makeSubTask("a", ["b"]),
      makeSubTask("b", ["a"]),
    ];
    const cycle = detectCycle(tasks);
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThanOrEqual(2);
  });

  it("detects self-loop", () => {
    const tasks = [makeSubTask("a", ["a"])];
    const cycle = detectCycle(tasks);
    expect(cycle).not.toBeNull();
  });

  it("returns null for single node", () => {
    expect(detectCycle([makeSubTask("a")])).toBeNull();
  });

  it("returns null for disconnected DAG", () => {
    const tasks = [makeSubTask("a"), makeSubTask("b"), makeSubTask("c")];
    expect(detectCycle(tasks)).toBeNull();
  });

  it("detects complex diamond cycle", () => {
    // a → b ← e (e is extra, no cycle)
    // a → c → d → b creates a cycle through b's dep on d
    // But wait — let me make a proper cycle:
    // a → b → c → a (triangular cycle)
    const tasks = [
      makeSubTask("a", ["c"]),
      makeSubTask("b", ["a"]),
      makeSubTask("c", ["b"]),
    ];
    expect(detectCycle(tasks)).not.toBeNull();
  });
});

describe("topSort", () => {
  it("returns empty for empty input", () => {
    expect(topSort([])).toEqual([]);
  });

  it("sorts single node into one layer", () => {
    expect(topSort([makeSubTask("a")])).toEqual([["a"]]);
  });

  it("puts independent tasks in same layer", () => {
    const tasks = [makeSubTask("a"), makeSubTask("b"), makeSubTask("c")];
    const layers = topSort(tasks);
    expect(layers).toHaveLength(1);
    expect(layers[0]).toHaveLength(3);
    expect(layers[0]).toContain("a");
    expect(layers[0]).toContain("b");
    expect(layers[0]).toContain("c");
  });

  it("sorts linear chain into sequential layers", () => {
    const tasks = [
      makeSubTask("a"),
      makeSubTask("b", ["a"]),
      makeSubTask("c", ["b"]),
    ];
    const layers = topSort(tasks);
    expect(layers).toHaveLength(3);
    expect(layers[0]).toEqual(["a"]);
    expect(layers[1]).toEqual(["b"]);
    expect(layers[2]).toEqual(["c"]);
  });

  it("handles diamond dependency graph", () => {
    const tasks = [
      makeSubTask("a"),
      makeSubTask("b", ["a"]),
      makeSubTask("c", ["a"]),
      makeSubTask("d", ["b", "c"]),
    ];
    const layers = topSort(tasks);
    // a first, then b+c parallel, then d
    expect(layers[0]).toEqual(["a"]);
    expect(layers[1]).toHaveLength(2);
    expect(layers[1]).toContain("b");
    expect(layers[1]).toContain("c");
    expect(layers[2]).toEqual(["d"]);
  });

  it("throws CycleDetectedError for cyclic graph", () => {
    const tasks = [
      makeSubTask("a", ["b"]),
      makeSubTask("b", ["a"]),
    ];
    expect(() => topSort(tasks)).toThrow(CycleDetectedError);
  });
});

describe("buildLayers", () => {
  it("is an alias for topSort", () => {
    const tasks = [makeSubTask("a"), makeSubTask("b", ["a"])];
    expect(buildLayers(tasks)).toEqual([["a"], ["b"]]);
  });
});
