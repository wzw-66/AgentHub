import type { MemoryType } from "@agenthub/shared";

export interface CreateMemoryInput {
  userId: string;
  /** 必填 —— 检索作用域的唯一依据（spec §1.1）。原调用方从不传，故该列恒为 NULL。 */
  conversationId: string;
  agentId: string;
  type: MemoryType;
  content: string;
  tags?: string[];
  sourceMessageId?: string;
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

/**
 * 声明实现是否区分查询与文档的嵌入方式。
 *
 * `bge-m3` 是对称的；`bge-large-zh`、E5 系、`jina-v3`、Cohere v4 不是。
 * 即使实现是对称的，检索层也永远调 `embedQuery`、worker 永远调 `embedDocuments` ——
 * 这样换成非对称模型时调用方一行都不用改（spec §8.1）。
 */
export type EmbeddingMode = "symmetric" | "asymmetric";

export interface MemoryConfig {
  dbPath?: string;
  llm?: {
    apiKey?: string;
    endpoint?: string;
    model?: string;
  };
}
