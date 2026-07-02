import type { MemoryType } from "@agenthub/shared";

export interface CreateMemoryInput {
  userId: string;
  agentId: string;
  type: MemoryType;
  content: string;
  tags?: string[];
  sourceMessageId?: string;
  conversationId?: string;
  importance?: number;
}

export interface ExtractedMemory {
  action: "add" | "update" | "delete" | "noop";
  id?: string;
  type?: MemoryType;
  content?: string;
  tags?: string[];
  importance?: number;
  reason?: string;
}

export interface MemoryConfig {
  dbPath?: string;
  llm?: {
    apiKey?: string;
    endpoint?: string;
    model?: string;
  };
}
