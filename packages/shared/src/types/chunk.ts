import type { ChunkType } from "../enums/chunk.js";
import type { Message } from "./message.js";
import type { Agent } from "./agent.js";

/**
 * JSON Schema definition for a tool input parameter.
 */
export interface ToolInputSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * Definition of a tool that an agent can use during execution.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
}

export interface Chunk {
  type: ChunkType;
  content: string;
  /**
   * Metadata fields by chunk type:
   * - ToolCall: `{ toolUseId, toolName, input }`
   * - Interactive: `{ toolUseId, prompt, options?, multiSelect? }`
   * - Done: `{ messageId, tokenUsage }`
   */
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Chunk data for interactive prompts (AskUserQuestion).
 * Agent needs user input before continuing execution.
 */
export interface InteractiveChunkData {
  type: "interactive";
  content: string;
  metadata: {
    toolUseId: string;
    prompt: string;
    options?: { label: string; description: string }[];
    multiSelect?: boolean;
  };
}

/**
 * A tool call or tool result message for the assistant/tool role pair.
 * Used by AgentHarness to feed tool results back to the LLM in the
 * OpenAI-compatible format (role "assistant" for the tool call, role "tool"
 * for the result).
 */
export interface ToolMessage {
  role: "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface AgentContext {
  conversationId: string;
  message: string;
  history: Message[];
  agents: Agent[];
  /** Optional system prompt injected at the beginning of the prompt. */
  systemPrompt?: string;
  /** Tool definitions available to the agent. */
  tools?: ToolDefinition[];
  /**
   * Tool call/result pairs injected between history and the current message.
   * The adapter MUST render these with the correct OpenAI roles
   * ("assistant" for tool calls, "tool" for results with toolCallId).
   */
  toolMessages?: ToolMessage[];
}
