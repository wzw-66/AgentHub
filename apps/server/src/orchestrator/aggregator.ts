import type { AggregatedResult, PushSSEFn } from "./types.js";
import type {
  SSEOrchestratorAggregatedData,
} from "../realtime/types.js";

// ─── Database function types (injectable for testability) ─────────────────

export type CreateMessageFn = (data: {
  conversationId: string;
  senderType: "User" | "Contact" | "System";
  senderId: string;
  type: "Text" | "Code" | "Diff" | "Preview" | "Artifact";
  content: string;
  parentId?: string | null;
}) => Promise<{ id: string }>;

export type CreateArtifactFn = (data: {
  messageId: string;
  type: "CodeDiff" | "WebPreview" | "Document";
  url?: string | null;
  content?: string | null;
  status?: "Building" | "Completed" | "Failed";
}) => Promise<{ id: string }>;

// ─── Aggregator ──────────────────────────────────────────────────────────

export class ResultAggregator {
  constructor(
    private createMessage: CreateMessageFn,
    private createArtifact: CreateArtifactFn,
  ) {}

  /**
   * Persist aggregated results:
   * 1. Create a summary message in the conversation
   * 2. Create an artifact with detailed per-agent results
   * 3. Push aggregated SSE event
   *
   * @param result        - Aggregated result from the dispatcher
   * @param conversationId - The conversation ID
   * @param parentMessageId - The original user message ID
   * @param pushSSE       - SSE push function
   * @returns The message ID of the created summary message
   */
  async persist(
    result: AggregatedResult,
    conversationId: string,
    parentMessageId: string,
    pushSSE: PushSSEFn,
  ): Promise<string> {
    // 1. Create summary message
    const message = await this.createMessage({
      conversationId,
      senderType: "System",
      senderId: "orchestrator",
      type: "Text",
      content: result.summary,
      parentId: parentMessageId,
    });

    result.messageId = message.id;

    // 2. Create artifact with detailed results
    await this.createArtifact({
      messageId: message.id,
      type: "Document",
      content: JSON.stringify({
        summary: result.summary,
        totalTasks: result.totalTasks,
        completedTasks: result.completedTasks,
        failedTasks: result.failedTasks,
        skippedTasks: result.skippedTasks,
        details: result.taskResults.map((tr) => ({
          agentId: tr.agentId,
          agentName: tr.agentName,
          success: tr.success,
          preview: tr.preview,
          error: tr.error,
        })),
      }),
      status: result.failedTasks > 0 ? "Failed" : "Completed",
    });

    // 3. Push aggregated SSE event
    const eventData: SSEOrchestratorAggregatedData = {
      summary: result.summary,
      totalTasks: result.totalTasks,
      completedTasks: result.completedTasks,
      failedTasks: result.failedTasks,
      skippedTasks: result.skippedTasks,
    };
    pushSSE("orchestrator:aggregated", eventData);

    return message.id;
  }
}
