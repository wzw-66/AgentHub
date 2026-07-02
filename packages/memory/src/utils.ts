import type { MemoryRecord, MemoryType } from "@agenthub/shared";

export function rowToMemoryRecord(row: { [key: string]: unknown }): MemoryRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    agentId: row.agent_id as string,
    type: row.type as MemoryType,
    content: row.content as string,
    tags: JSON.parse(row.tags as string) as string[],
    sourceMessageId: (row.source_message_id as string) ?? undefined,
    conversationId: (row.conversation_id as string) ?? undefined,
    importance: row.importance as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
