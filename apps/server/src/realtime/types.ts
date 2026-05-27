// ─── WebSocket message protocol ───────────────────────────────────────

export type WSClientMessage =
  | { type: "typing:start"; payload: { conversationId: string } }
  | { type: "typing:end"; payload: { conversationId: string } }
  | { type: "message:read"; payload: { conversationId: string; messageId: string } }
  | { type: "ping" };

export type WSServerMessage =
  | { type: "typing:indicator"; payload: { conversationId: string; userId: string; isTyping: boolean } }
  | { type: "status:update"; payload: { userId: string; status: "online" | "offline" } }
  | { type: "notification"; payload: { conversationId: string; senderId: string; preview: string } }
  | { type: "pong" };

// ─── SSE event types ──────────────────────────────────────────────────

export type SSEChunkData = {
  type: "text" | "code" | "tool_call";
  content: string;
  timestamp: string;
};

export type SSEDoneData = {
  messageId: string;
  tokenUsage?: { input: number; output: number };
};

export type SSEErrorData = {
  message: string;
  code: string;
};

export type SSEArtifactStatusData = {
  id: string;
  status: "building" | "completed" | "failed";
  title?: string;
};

// ─── Orchestrator SSE event types ────────────────────────────────────────

export type SSEOrchestratorDecompositionData = {
  subtasks: Array<{
    id: string;
    agentId: string;
    agentName: string;
    instruction: string;
    dependsOn: string[];
  }>;
  layers: string[][];
};

export type SSEOrchestratorTaskStatusData = {
  subtaskId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  agentId: string;
  agentName: string;
  layer: number;
  error?: string;
};

export type SSEOrchestratorAggregatedData = {
  summary: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  skippedTasks: number;
};

// ─── Response helpers ─────────────────────────────────────────────────

export function formatSSEEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function formatWSMessage(type: string, payload: unknown): string {
  return JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
}
