import type { Agent } from "@agenthub/shared";

// ─── Sub-task types ──────────────────────────────────────────────────────

export type SubTaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

/**
 * A single sub-task decomposed from a user message.
 */
export interface SubTask {
  id: string;
  parentMessageId: string;
  conversationId: string;
  /** Target agent ID */
  agentId: string;
  /** Agent display name */
  agentName: string;
  /** The instruction fragment extracted for this agent */
  instruction: string;
  /** Other sub-task IDs this task depends on */
  dependsOn: string[];
  /** Context messages (conversation history) */
  context: { role: string; content: string }[];
  status: SubTaskStatus;
  result?: string;
  error?: string;
  retryCount: number;
}

/**
 * Result of executing a single sub-task.
 */
export interface SubTaskResult {
  subtaskId: string;
  success: boolean;
  content: string;
  error?: string;
  tokenUsage?: { input: number; output: number };
}

/**
 * A decomposed message with all sub-tasks and DAG layer plan.
 */
export interface TaskDecomposition {
  originalMessageId: string;
  conversationId: string;
  subtasks: SubTask[];
  /** Topologically sorted layers: each inner array is a parallel-execution layer */
  layers: string[][];
}

/**
 * Aggregated result after all sub-tasks complete.
 */
export interface AggregatedResult {
  messageId: string;
  summary: string;
  taskResults: Array<{
    agentId: string;
    agentName: string;
    success: boolean;
    preview: string;
    error?: string;
  }>;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  skippedTasks: number;
}

// ─── SSE event types for orchestrator protocol ──────────────────────────

export type SSEOrchestratorDecompositionEvent = {
  type: "orchestrator:decomposition";
  payload: {
    subtasks: Array<{
      id: string;
      agentId: string;
      agentName: string;
      instruction: string;
      dependsOn: string[];
    }>;
    layers: string[][];
  };
};

export type SSEOrchestratorTaskStatusEvent = {
  type: "orchestrator:task-status";
  payload: {
    subtaskId: string;
    status: SubTaskStatus;
    agentId: string;
    agentName: string;
    layer: number;
    error?: string;
  };
};

export type SSEOrchestratorAggregatedEvent = {
  type: "orchestrator:aggregated";
  payload: {
    summary: string;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    skippedTasks: number;
  };
};

export type SSEOrchestratorEvent =
  | SSEOrchestratorDecompositionEvent
  | SSEOrchestratorTaskStatusEvent
  | SSEOrchestratorAggregatedEvent;

// ─── SSE push function type ──────────────────────────────────────────────

export type PushSSEFn = (event: string, data: unknown) => void;

// ─── Dispatcher options ──────────────────────────────────────────────────

export interface DispatchOptions {
  conversationId: string;
  decomposition: TaskDecomposition;
  agents: Map<string, Agent>;
  pushSSE: (event: string, data: unknown) => void;
}
