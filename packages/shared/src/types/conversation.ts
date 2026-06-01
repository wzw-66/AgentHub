import type { ConversationType } from "../enums/conversation.js";

export interface Conversation {
  id: string;
  title: string;
  type: ConversationType;
  ownerId: string;
  contactIds: string[];
  isPinned: boolean;
  isArchived: boolean;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}
