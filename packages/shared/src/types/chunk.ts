import type { ChunkType } from "../enums/chunk.js";
import type { Message } from "./message.js";
import type { Agent } from "./agent.js";

export interface Chunk {
  type: ChunkType;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface AgentContext {
  conversationId: string;
  message: string;
  history: Message[];
  agents: Agent[];
}
