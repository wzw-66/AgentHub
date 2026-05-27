import type { Agent, AgentContext, Chunk } from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";
import { createAdapter } from "@agenthub/agent-core";
import type { SubTask, SubTaskResult } from "./types.js";

// ─── Constants ───────────────────────────────────────────────────────────

const MAX_RETRIES = 1;

// ─── Executor ────────────────────────────────────────────────────────────

export class SubTaskExecutor {
  /**
   * Execute a single sub-task with retry logic.
   *
   * @param subtask       - The sub-task to execute
   * @param agent         - The agent (provider) configuration
   * @param onChunk       - Callback invoked for each Chunk emitted by the adapter
   * @returns SubTaskResult with execution outcome
   */
  async execute(
    subtask: SubTask,
    agent: Agent,
    onChunk: (chunk: Chunk) => void,
  ): Promise<SubTaskResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let adapter = null as ReturnType<typeof createAdapter> | null;

      try {
        adapter = this.createAdapterForAgent(agent);
        const context = this.buildContext(subtask);

        let fullContent = "";
        let tokenUsage: { input: number; output: number } | undefined;

        for await (const chunk of adapter.execute(context)) {
          onChunk(chunk);

          if (chunk.type === ChunkType.Done) {
            tokenUsage = chunk.metadata?.tokenUsage as
              | { input: number; output: number }
              | undefined;
          }

          if (
            chunk.type === ChunkType.Text ||
            chunk.type === ChunkType.Code
          ) {
            fullContent += chunk.content;
          }
        }

        return {
          subtaskId: subtask.id,
          success: true,
          content: fullContent,
          tokenUsage,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Only retry on the first attempt
        if (attempt < MAX_RETRIES) {
          if (adapter) {
            try {
              adapter.abort();
            } catch {
              // ignore abort errors
            }
          }
          continue;
        }
      } finally {
        if (adapter) {
          try {
            adapter.abort();
          } catch {
            // ignore abort errors
          }
        }
      }
    }

    return {
      subtaskId: subtask.id,
      success: false,
      content: "",
      error: lastError?.message ?? "Unknown error",
    };
  }

  /**
   * Build an AgentContext from the sub-task for adapter execution.
   */
  private buildContext(subtask: SubTask): AgentContext {
    return {
      conversationId: subtask.conversationId,
      message: subtask.instruction,
      history: subtask.context.map((c) => ({
        id: "",
        conversationId: subtask.conversationId,
        senderType: c.role === "user" ? ("user" as const) : ("contact" as const),
        senderId: c.role === "user" ? "user" : subtask.agentId,
        type: "text" as const,
        content: c.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as AgentContext["history"],
      agents: [],
    };
  }

  /**
   * Create an AgentAdapter for the given agent.
   */
  private createAdapterForAgent(agent: Agent): ReturnType<typeof createAdapter> {
    const provider = agent.provider.toLowerCase();
    const config: Record<string, unknown> = {
      model: agent.model,
    };

    if (agent.systemPrompt) {
      config["systemPrompt"] = agent.systemPrompt;
    }

    return createAdapter(provider, config);
  }
}
