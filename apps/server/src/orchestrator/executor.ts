import type { Agent, AgentContext, Chunk } from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";
import { createAdapter } from "@agenthub/agent-core";
import { getConversation, listPinnedMessages } from "@agenthub/db";
import { searchMemories } from "@agenthub/memory";
import type { SubTask, SubTaskResult } from "./types.js";
import { processChunk } from "./artifact-detector.js";
import { resolve } from "node:path";
import { WORKSPACE_ROOT } from "../config/env.js";

// ─── Constants ───────────────────────────────────────────────────────────

const MAX_RETRIES = 1;

// ─── Executor ────────────────────────────────────────────────────────────

export class SubTaskExecutor {
  /**
   * Track whether memory has been injected for this executor instance.
   * Only inject on the first SubTask to maximize prefix caching.
   */
  private _memoryInjected = false;

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

    // Resolve workspace path from conversation or agent
    const cwd = await this.resolveWorkspace(subtask);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let adapter = null as ReturnType<typeof createAdapter> | null;

      try {
        adapter = this.createAdapterForAgent(agent, cwd);
        const context = await this.buildContext(subtask);

        let fullContent = "";
        let tokenUsage: { input: number; output: number } | undefined;

        for await (const chunk of adapter.execute(context)) {
          const processed = processChunk(chunk);

          onChunk(processed);

          if (processed.type === ChunkType.Done) {
            tokenUsage = processed.metadata?.tokenUsage as
              | { input: number; output: number }
              | undefined;
          }

          if (
            processed.type === ChunkType.Text ||
            processed.type === ChunkType.Code ||
            processed.type === ChunkType.ToolCall
          ) {
            fullContent += processed.content;
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
  private async buildContext(subtask: SubTask): Promise<AgentContext> {
    // Inject pinned messages as system context
    let pinnedContext: string | undefined;
    try {
      const pinnedMessages = await listPinnedMessages(subtask.conversationId);
      if (pinnedMessages.length > 0) {
        pinnedContext = pinnedMessages
          .map((m: { content: string }) => `[Pinned Context]: ${m.content}`)
          .join("\n");
      }
    } catch {
      // Ignore errors loading pinned messages
    }

    // Build system prompt parts
    const systemParts: string[] = [];
    if (pinnedContext) systemParts.push(pinnedContext);

    // Inject relevant memories only on the FIRST SubTask
    if (!this._memoryInjected) {
      try {
        const memories = await searchMemories({
          query: subtask.instruction,
          // 租户边界与作用域都是必填：少了它们，检索要么编译不过，要么
          // 在运行时把别人的记忆或别的会话的记忆拼进提示词（spec §1.1、§4.8）。
          userId: subtask.userId,
          scope: { conversationId: subtask.conversationId },
          limit: 5,
        });
        if (memories.length > 0) {
          systemParts.push(
            memories
              .map((m) => `[Memory - ${m.type}] ${m.content}`)
              .join("\n\n"),
          );
        }
      } catch (err) {
        // Non-blocking — memories are a hint, not a requirement. 但**不能静默**：
        // 一个裸 catch 会让作用域/租户传错这类 bug 退化成「没有相关记忆」，
        // 与真正的「没有匹配」在日志里长得一模一样。
        console.error("[orchestrator] memory retrieval failed; continuing without memories:", err);
      }
      this._memoryInjected = true;
    }

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
      ...(systemParts.length > 0 ? { systemPrompt: systemParts.join("\n\n") } : {}),
    };
  }

  /**
   * Resolve the workspace directory for a subtask's conversation.
   * Falls back to agent's workspace path if conversation doesn't have one.
   */
  private async resolveWorkspace(subtask: SubTask): Promise<string | undefined> {
    try {
      const conv = await getConversation(subtask.conversationId);
      if (conv?.workspacePath) {
        return resolve(WORKSPACE_ROOT, conv.workspacePath);
      }
    } catch {
      // Conversation may have been deleted — proceed without workspace
    }
    return undefined;
  }

  /**
   * Create an AgentAdapter for the given agent with workspace path.
   */
  private createAdapterForAgent(
    agent: Agent,
    cwd?: string,
  ): ReturnType<typeof createAdapter> {
    const provider = agent.provider.toLowerCase();
    const config: Record<string, unknown> = {
      model: agent.model,
    };

    if (cwd) {
      config["cwd"] = cwd;
    }

    if (agent.systemPrompt) {
      config["systemPrompt"] = agent.systemPrompt;
    }

    return createAdapter(provider, config);
  }
}
