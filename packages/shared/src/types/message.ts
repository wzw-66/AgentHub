import type { SenderType } from "../enums/sender.js";
import type { MessageType } from "../enums/message.js";
import type { Artifact } from "./artifact.js";

export interface Message {
  id: string;
  conversationId: string;
  senderType: SenderType;
  senderId: string;
  type: MessageType;
  content: string;
  parentId?: string;
  isPinned?: boolean;
  artifacts?: Artifact[];
  createdAt: string;
  updatedAt: string;
}
