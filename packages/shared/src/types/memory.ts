import type { MemoryType } from "../enums/memory.js";

export interface MemoryRecord {
  id: string;
  userId: string;
  agentId: string;
  type: MemoryType;
  content: string;
  tags: string[];
  sourceMessageId?: string;
  conversationId?: string;
  importance: number;
  createdAt: string;
  updatedAt: string;
}
