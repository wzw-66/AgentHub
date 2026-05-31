import type { Agent, Chunk } from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";
import { SubTaskExecutor } from "./executor.js";
import type {
  SubTask,
  SubTaskResult,
  TaskDecomposition,
  AggregatedResult,
  PushSSEFn,
} from "./types.js";
import type { SSEOrchestratorTaskStatusData } from "../realtime/types.js";

// ─── Dispatcher ──────────────────────────────────────────────────────────

export class TaskDispatcher {
  private executor: SubTaskExecutor;
  private results = new Map<string, SubTaskResult>();

  constructor(executor?: SubTaskExecutor) {
    this.executor = executor ?? new SubTaskExecutor();
  }

  /**
   * Execute a full task decomposition.
   *
   * Steps:
   * 1. Push decomposition event with task DAG structure
   * 2. Execute layers sequentially (parallel within each layer)
   * 3. Push task status events for each sub-task
   * 4. Aggregate results
   *
   * @param decomposition - The decomposed task plan
   * @param agents        - Map of agentId → Agent record
   * @param pushSSE       - Function to push SSE events to the conversation
   * @param onAgentChunk  - Optional callback for raw agent chunk output
   * @returns AggregatedResult
   */
  async dispatchAll(
    decomposition: TaskDecomposition,
    agents: Map<string, Agent>,
    pushSSE: PushSSEFn,
    onAgentChunk?: (subtaskId: string, chunk: Chunk) => void,
    onTaskCompleted?: (subtask: SubTask, result: SubTaskResult) => void,
  ): Promise<AggregatedResult> {
    const { subtasks, layers } = decomposition;

    if (subtasks.length === 0 || layers.length === 0) {
      return {
        messageId: "",
        summary: "No sub-tasks to execute.",
        taskResults: [],
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        skippedTasks: 0,
      };
    }

    // Step 1: Push decomposition event
    pushSSE("orchestrator:decomposition", {
      subtasks: subtasks.map((s) => ({
        id: s.id,
        agentId: s.agentId,
        agentName: s.agentName,
        instruction: s.instruction,
        dependsOn: s.dependsOn,
      })),
      layers,
    });

    // Step 2: Execute layers sequentially
    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layerTaskIds = layers[layerIdx];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!layerTaskIds) continue;

      const layerSubtasks = layerTaskIds
        .map((id) => subtasks.find((s) => s.id === id))
        .filter((s): s is SubTask => s !== undefined);

      // Mark all tasks in this layer as running
      for (const sub of layerSubtasks) {
        this.pushTaskStatus(sub, "running", layerIdx, pushSSE);
      }

      // Execute all tasks in this layer in parallel
      const layerResults = await Promise.allSettled(
        layerSubtasks.map((sub) =>
          this.executeSubTask(sub, agents, pushSSE, onAgentChunk),
        ),
      );

      // Collect results
      for (let i = 0; i < layerSubtasks.length; i++) {
        const sub = layerSubtasks[i];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!sub) continue;

        const settled = layerResults[i];
        if (!settled) continue;

        if (settled.status === "fulfilled") {
          this.results.set(sub.id, settled.value);
          if (settled.value.success) {
            this.pushTaskStatus(sub, "completed", layerIdx, pushSSE);
            onTaskCompleted?.(sub, settled.value);
            // Push done event after task completion + message persistence
            pushSSE("done", {
              messageId: "",
              tokenUsage: settled.value.tokenUsage,
              agentId: sub.agentId,
            });
          } else {
            this.pushTaskStatus(sub, "failed", layerIdx, pushSSE, settled.value.error);
          }
        } else {
          const error = settled.reason instanceof Error ? settled.reason.message : "Unknown error";
          this.results.set(sub.id, {
            subtaskId: sub.id,
            success: false,
            content: "",
            error,
          });
          this.pushTaskStatus(sub, "failed", layerIdx, pushSSE, error);
        }
      }

      // Feed results to next-layer tasks via context injection
      this.injectResultsToNextLayer(layerIdx, decomposition);
    }

    // Step 3: Mark skipped tasks (those depending on failed tasks)
    this.markSkippedTasks(decomposition, pushSSE);

    // Step 4: Aggregate results
    return this.aggregate(decomposition);
  }

  /**
   * Execute a single sub-task with SSE push for agent chunks.
   */
  private async executeSubTask(
    sub: SubTask,
    agents: Map<string, Agent>,
    pushSSE: PushSSEFn,
    onAgentChunk?: (subtaskId: string, chunk: Chunk) => void,
  ): Promise<SubTaskResult> {
    const agent = agents.get(sub.agentId);
    if (!agent) {
      return {
        subtaskId: sub.id,
        success: false,
        content: "",
        error: `Agent not found: ${sub.agentName}`,
      };
    }

    return this.executor.execute(sub, agent, (chunk) => {
      // Push agent chunk to conversation SSE with agent-specific event tag
      this.pushAgentChunk(sub, chunk, pushSSE);
      if (onAgentChunk) {
        onAgentChunk(sub.id, chunk);
      }
    });
  }

  /**
   * Push an agent chunk as an SSE event.
   * Uses the same event naming as single-chat for frontend compatibility.
   * Done chunks are handled separately after task completion + message persistence.
   */
  private pushAgentChunk(
    sub: SubTask,
    chunk: Chunk,
    pushSSE: PushSSEFn,
  ): void {
    switch (chunk.type) {
      case ChunkType.Text:
      case ChunkType.Code:
      case ChunkType.ToolCall:
        pushSSE("chunk", {
          type: chunk.type,
          content: chunk.content,
          timestamp: chunk.timestamp,
          agentId: sub.agentId,
        });
        break;

      case ChunkType.Artifact:
        pushSSE("artifact_status", {
          id: chunk.metadata?.id ?? "",
          status: chunk.metadata?.status ?? "building",
          title: chunk.metadata?.title,
          agentId: sub.agentId,
        });
        break;

      case ChunkType.Done:
        // Handled separately in dispatchAll after task completion + persistence
        break;

      case ChunkType.Error:
        pushSSE("error", {
          message: chunk.content,
          code: "ADAPTER_ERROR",
          agentId: sub.agentId,
        });
        break;
    }
  }

  /**
   * Push an orchestrator task status event.
   */
  private pushTaskStatus(
    sub: SubTask,
    status: SSEOrchestratorTaskStatusData["status"],
    layer: number,
    pushSSE: PushSSEFn,
    error?: string,
  ): void {
    pushSSE("orchestrator:task-status", {
      subtaskId: sub.id,
      status,
      agentId: sub.agentId,
      agentName: sub.agentName,
      layer,
      error,
    });
  }

  /**
   * Inject results from the current layer into the next layer's context.
   *
   * For each task in the next layer, if it depends on a task in the
   * current layer, append that task's result to its context.
   */
  private injectResultsToNextLayer(
    currentLayerIdx: number,
    decomposition: TaskDecomposition,
  ): void {
    const currentLayerIds = decomposition.layers[currentLayerIdx]!;
    const nextLayerIdx = currentLayerIdx + 1;

    if (nextLayerIdx >= decomposition.layers.length) return;

    const nextLayerIds = decomposition.layers[nextLayerIdx]!;

    for (const sub of decomposition.subtasks) {
      if (!nextLayerIds.includes(sub.id)) continue;

      // Find which upstream dependencies are in the current layer
      for (const depId of sub.dependsOn) {
        if (!currentLayerIds.includes(depId)) continue;

        const depResult = this.results.get(depId);
        if (depResult?.success && depResult.content) {
          // Inject the upstream result as context for the next task
          sub.context = [
            ...sub.context,
            {
              role: "assistant",
              content: depResult.content,
            },
          ];
        }
      }
    }
  }

  /**
   * Mark tasks as skipped if their dependencies failed.
   */
  private markSkippedTasks(
    decomposition: TaskDecomposition,
    _pushSSE: PushSSEFn,
  ): void {
    for (const sub of decomposition.subtasks) {
      if (sub.status !== "pending") continue;

      const hasFailedDep = sub.dependsOn.some((depId) => {
        const result = this.results.get(depId);
        return result && !result.success;
      });

      if (hasFailedDep) {
        sub.status = "skipped";
        this.results.set(sub.id, {
          subtaskId: sub.id,
          success: false,
          content: "",
          error: "Skipped due to upstream failure",
        });
      }
    }
  }

  /**
   * Aggregate all sub-task results into a summary.
   */
  private aggregate(decomposition: TaskDecomposition): AggregatedResult {
    const results = Array.from(this.results.values());
    const totalTasks = decomposition.subtasks.length;
    const completedTasks = results.filter((r) => r.success).length;
    const failedTasks = results.filter((r) => !r.success && r.error !== "Skipped due to upstream failure").length;
    const skippedTasks = results.filter((r) => !r.success && r.error === "Skipped due to upstream failure").length;

    const taskResults = decomposition.subtasks.map((sub) => {
      const result = this.results.get(sub.id);
      return {
        agentId: sub.agentId,
        agentName: sub.agentName,
        success: result?.success ?? false,
        preview: (result?.content ?? "").slice(0, 200),
        error: result?.error,
      };
    });

    // Build a human-readable summary
    const summary = this.buildSummary(taskResults);

    return {
      messageId: "",
      summary,
      taskResults,
      totalTasks,
      completedTasks,
      failedTasks,
      skippedTasks,
    };
  }

  /**
   * Build a human-readable summary from task results.
   */
  private buildSummary(
    taskResults: AggregatedResult["taskResults"],
  ): string {
    const parts: string[] = [];

    for (const tr of taskResults) {
      if (tr.success) {
        parts.push(`${tr.agentName} completed successfully`);
      } else if (tr.error === "Skipped due to upstream failure") {
        parts.push(`${tr.agentName} was skipped`);
      } else {
        parts.push(`${tr.agentName} failed: ${tr.error}`);
      }
    }

    return parts.join("; ") + ".";
  }
}
