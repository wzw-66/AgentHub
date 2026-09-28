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

/**
 * 检索作用域。必填，没有默认值 —— 漏写必须是编译错误。
 *
 * 用判别联合而非 `conversationId?: string`，是因为可选参数有一个已知的失效方式：
 * `userId` 曾经是可选的，而唯一的两个自动化调用点都漏了它（spec §4.8），
 * 且单用户测试全绿。跳过会话过滤必须是显式写出的决定。
 */
export type MemoryScope =
  | { conversationId: string }
  | { allConversations: true };

export interface MemoryConfig {
  dbPath?: string;
  llm?: {
    apiKey?: string;
    endpoint?: string;
    model?: string;
  };
}
