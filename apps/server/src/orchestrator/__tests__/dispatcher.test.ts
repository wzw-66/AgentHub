import { describe, it, expect, vi } from "vitest";
import { TaskDispatcher } from "../dispatcher.js";
import type { SubTask, TaskDecomposition, AggregatedResult } from "../types.js";

// ─── Mock executor ───────────────────────────────────────────────────────

function createMockExecutor(subtaskResults: Record<string, { success: boolean; content: string; error?: string }>) {
  return {
    execute: vi.fn().mockImplementation(
      (subtask: SubTask) => {
        const result = subtaskResults[subtask.id] ?? { success: false, content: "", error: "No mock result" };
        return Promise.resolve({
          subtaskId: subtask.id,
          success: result.success,
          content: result.content,
          error: result.error,
        });
      },
    ),
  } as any;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeSubTask(id: string, agentName: string, dependsOn: string[] = []): SubTask {
  return {
    id,
    parentMessageId: "msg_1",
    conversationId: "conv_1",
    agentId: `agent_${id}`,
    agentName,
    instruction: `do ${agentName}`,
    dependsOn,
    context: [],
    status: "pending",
    retryCount: 0,
  };
}

function makeDecomposition(subtasks: SubTask[]): TaskDecomposition {
  // Build layers manually (simple: single layer for independent, sequential for deps)
  const layers: string[][] = [];
  const assigned = new Set<string>();

  while (assigned.size < subtasks.length) {
    const layer = subtasks
      .filter((s) => !assigned.has(s.id))
      .filter((s) => s.dependsOn.every((d) => assigned.has(d)))
      .map((s) => s.id);
    if (layer.length === 0) break;
    layer.forEach((id) => assigned.add(id));
    layers.push(layer);
  }

  return {
    originalMessageId: "msg_1",
    conversationId: "conv_1",
    subtasks,
    layers,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe("TaskDispatcher", () => {
  it("returns empty result for empty decomposition", async () => {
    const d = new TaskDispatcher();
    const result = await d.dispatchAll(
      makeDecomposition([]),
      new Map(),
      vi.fn(),
    );
    expect(result.totalTasks).toBe(0);
    expect(result.completedTasks).toBe(0);
  });

  it("pushes decomposition event at start", async () => {
    const mockExec = createMockExecutor({});
    const d = new TaskDispatcher(mockExec);
    const pushSSE = vi.fn();
    const agents = new Map();
    agents.set("agent_A", { id: "agent_A", name: "AgentA", provider: "claude", model: "", config: {} } as any);

    const subtasks = [makeSubTask("A", "AgentA")];
    await d.dispatchAll(makeDecomposition(subtasks), agents, pushSSE);

    // decomposition event should be pushed
    const decompCalls = pushSSE.mock.calls.filter(
      ([event]: string[]) => event === "orchestrator:decomposition",
    );
    expect(decompCalls.length).toBeGreaterThanOrEqual(1);
    // Should have subtasks data
    expect(decompCalls[0]![1]).toHaveProperty("subtasks");
    expect(decompCalls[0]![1]).toHaveProperty("layers");
  });

  it("pushes task-status events for each task", async () => {
    const mockExec = createMockExecutor({
      A: { success: true, content: "done" },
      B: { success: true, content: "done" },
    });
    const d = new TaskDispatcher(mockExec);
    const pushSSE = vi.fn();
    const agents = new Map();
    agents.set("agent_A", { id: "agent_A", name: "AgentA", provider: "claude", model: "", config: {} } as any);
    agents.set("agent_B", { id: "agent_B", name: "AgentB", provider: "claude", model: "", config: {} } as any);

    const subtasks = [makeSubTask("A", "AgentA"), makeSubTask("B", "AgentB")];
    await d.dispatchAll(makeDecomposition(subtasks), agents, pushSSE);

    const statusCalls = pushSSE.mock.calls.filter(
      ([event]: string[]) => event === "orchestrator:task-status",
    );
    // At least 2 task-status events (one per task, possibly more for running + completed)
    expect(statusCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("inject context when dependency completes successfully", async () => {
    const d = new TaskDispatcher();

    // Create tasks with serial dependency: A → B
    const depA = makeSubTask("A", "AgentA");
    const depB = makeSubTask("B", "AgentB", ["A"]);
    const decomposition = makeDecomposition([depA, depB]);

    // Manually seed results as if A succeeded with content
    (d as any).results.set("A", {
      subtaskId: "A",
      success: true,
      content: "Result from AgentA",
    });

    // Inject from layer 0 to layer 1
    (d as any).injectResultsToNextLayer(0, decomposition);

    // B's context should now include A's result
    expect(depB.context.length).toBeGreaterThan(0);
    expect(depB.context[0]!.role).toBe("assistant");
    expect(depB.context[0]!.content).toContain("Result from AgentA");
  });

  it("marks downstream tasks as skipped when dependency fails", async () => {
    const d = new TaskDispatcher();
    const pushSSE = vi.fn();

    // A → B (B depends on A)
    const depA = makeSubTask("A", "AgentA");
    const depB = makeSubTask("B", "AgentB", ["A"]);
    const decomposition = makeDecomposition([depA, depB]);

    // Manually seed result: A failed
    (d as any).results.set("A", {
      subtaskId: "A",
      success: false,
      content: "",
      error: "Execution failed",
    });

    // Mark skipped
    (d as any).markSkippedTasks(decomposition, pushSSE);

    expect(depB.status).toBe("skipped");
    const bResult = (d as any).results.get("B");
    expect(bResult!.success).toBe(false);
    expect(bResult.error).toBe("Skipped due to upstream failure");
  });

  it("does not mark downstream tasks when dependency succeeds", async () => {
    const d = new TaskDispatcher();
    const pushSSE = vi.fn();

    const depA = makeSubTask("A", "AgentA");
    const depB = makeSubTask("B", "AgentB", ["A"]);
    const decomposition = makeDecomposition([depA, depB]);

    // A succeeded
    (d as any).results.set("A", {
      subtaskId: "A",
      success: true,
      content: "OK",
    });

    (d as any).markSkippedTasks(decomposition, pushSSE);

    // B should not be skipped since A succeeded
    expect(depB.status).toBe("pending");
  });

  it("aggregates results correctly with mixed outcomes", async () => {
    const d = new TaskDispatcher();

    const subA = makeSubTask("A", "AgentA");
    const subB = makeSubTask("B", "AgentB");
    const decomposition = makeDecomposition([subA, subB]);

    (d as any).results.set("A", {
      subtaskId: "A",
      success: true,
      content: "Done",
    });
    (d as any).results.set("B", {
      subtaskId: "B",
      success: false,
      content: "",
      error: "Something went wrong",
    });

    const aggregated = (d as any).aggregate(decomposition) as AggregatedResult;

    expect(aggregated.totalTasks).toBe(2);
    expect(aggregated.completedTasks).toBe(1);
    expect(aggregated.failedTasks).toBe(1);
    expect(aggregated.taskResults[0]!.success).toBe(true);
    expect(aggregated.taskResults[1]!.success).toBe(false);
    expect(aggregated.summary).toContain("AgentA completed successfully");
    expect(aggregated.summary).toContain("AgentB failed");
  });

  it("generates summary with skipped tasks", async () => {
    const d = new TaskDispatcher();

    const subA = makeSubTask("A", "AgentA");
    const subB = makeSubTask("B", "AgentB", ["A"]);
    const decomposition = makeDecomposition([subA, subB]);

    (d as any).results.set("A", {
      subtaskId: "A",
      success: false,
      content: "",
      error: "Failed",
    });
    (d as any).results.set("B", {
      subtaskId: "B",
      success: false,
      content: "",
      error: "Skipped due to upstream failure",
    });

    const aggregated = (d as any).aggregate(decomposition) as AggregatedResult;

    expect(aggregated.failedTasks).toBe(1);
    expect(aggregated.skippedTasks).toBe(1);
    expect(aggregated.summary).toContain("AgentA failed");
    expect(aggregated.summary).toContain("AgentB was skipped");
  });
});
