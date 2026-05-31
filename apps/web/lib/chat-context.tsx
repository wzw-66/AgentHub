"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { api, getStoredAccessToken } from "./api-client";
import type { Conversation, Message } from "@agenthub/shared";
import { SenderType, MessageType } from "@agenthub/shared";
import type { Dispatch, SetStateAction } from "react";

// ─── Types ────────────────────────────────────────────────────────────

interface ContactInfo {
  id: string;
  name: string;
  provider: string;
  avatarUrl?: string;
}

interface StreamingMessage {
  id: string;
  conversationId: string;
  content: string;
  senderType: SenderType;
  senderId: string;
  type: MessageType;
  createdAt: string;
  updatedAt: string;
  isStreaming: true;
}

interface ChatContextValue {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  streamingMessage: StreamingMessage | null;
  streamError: string | null;
  contacts: ContactInfo[];
  typingAgents: Map<string, boolean>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isLoadingContacts: boolean;
  setActiveConversation: (id: string | null) => void;
  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId: string, cursor?: string) => Promise<Message[]>;
  sendMessage: (conversationId: string, content: string) => Promise<Message>;
  createConversation: (
    title: string,
    type: "single" | "group",
    contactIds: string[],
  ) => Promise<Conversation>;
  setTypingAgent: (agentId: string, isTyping: boolean) => void;
  appendMessageChunk: (chunkText: string, agentId?: string) => void;
  finalizeMessage: (messageId?: string, agentId?: string) => void;
  setStreamError: (error: string | null) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
}

// ─── Context ───────────────────────────────────────────────────────────

const ChatContext = createContext<ChatContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [typingAgents, setTypingAgents] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);

  // ─── Streaming message state ─────────────────────────────────────
  const [streamingMessage, setStreamingMessage] =
    useState<StreamingMessage | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const streamIdRef = useRef(0);

  const fetchConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const data = await api.get<{
        data: Conversation[];
        total: number;
      }>("/api/conversations/list");
      setConversations(data.data);
    } catch {
      // Silently fail - user can retry
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  const fetchMessages = useCallback(
    async (conversationId: string, cursor?: string): Promise<Message[]> => {
      setIsLoadingMessages(true);
      try {
        const path = cursor
          ? `/api/conversations/${conversationId}/messages/list?cursor=${cursor}`
          : `/api/conversations/${conversationId}/messages/list`;
        const data = await api.get<{ data: Message[] }>(path);
        return data.data;
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (conversationId: string, content: string): Promise<Message> => {
      const message = await api.post<Message>(
        `/api/conversations/${conversationId}/messages/create`,
        { content },
      );
      setMessages((prev) => [...prev, message]);
      return message;
    },
    [],
  );

  const createConversation = useCallback(
    async (
      title: string,
      type: "single" | "group",
      contactIds: string[],
    ): Promise<Conversation> => {
      const conversation = await api.post<Conversation>(
        "/api/conversations/create",
        {
          title,
          type,
          contactIds,
        },
      );
      setConversations((prev) => [conversation, ...(prev ?? [])]);
      return conversation;
    },
    [],
  );

  const setTypingAgent = useCallback(
    (agentId: string, isTyping: boolean) => {
      setTypingAgents((prev) => {
        const next = new Map(prev);
        if (isTyping) {
          next.set(agentId, true);
        } else {
          next.delete(agentId);
        }
        return next;
      });
    },
    [],
  );

  const appendMessageChunk = useCallback(
    (chunkText: string, agentId?: string) => {
      setStreamingMessage((prev) => {
        if (prev) {
          return { ...prev, content: prev.content + chunkText };
        }
        // Create new streaming message
        const id = `streaming-${++streamIdRef.current}`;
        return {
          id,
          conversationId: activeConversationId || "",
          content: chunkText,
          senderType: SenderType.Contact,
          senderId: agentId ?? "agent",
          type: MessageType.Text,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isStreaming: true,
        };
      });
    },
    [activeConversationId],
  );

  const finalizeMessage = useCallback((messageId?: string, agentId?: string) => {
    setStreamingMessage((prev) => {
      if (prev) {
        // Convert streaming message to a permanent message
        // Use the real DB messageId if available, otherwise keep the streaming id
        const id = messageId || prev.id;
        const permanent: Message = {
          id,
          conversationId: prev.conversationId,
          content: prev.content,
          senderType: SenderType.Contact,
          senderId: agentId ?? prev.senderId,
          type: MessageType.Text,
          createdAt: prev.createdAt,
          updatedAt: new Date().toISOString(),
        };
        setMessages((msgs) => {
          // Avoid duplicates: if a message with the same DB id already exists
          // (e.g., loaded from API after a re-fetch), don't add it again
          if (messageId && msgs.some((m) => m.id === messageId)) {
            return msgs;
          }
          return [...msgs, permanent];
        });
      }
      return null;
    });
    setTypingAgents(new Map());
  }, []);

  // ─── Load contacts (agents) on mount (only if authenticated) ────
  useEffect(() => {
    async function loadContacts() {
      setIsLoadingContacts(true);
      try {
        const data = await api.get<ContactInfo[]>("/api/contacts/list");
        setContacts(data);
      } catch {
        // API not available yet
      } finally {
        setIsLoadingContacts(false);
      }
    }
    if (getStoredAccessToken()) {
      loadContacts();
    } else {
      setIsLoadingContacts(false);
    }
  }, []);

  // ─── Load conversations on mount (only if authenticated) ────────
  useEffect(() => {
    if (getStoredAccessToken()) {
      fetchConversations();
    }
  }, [fetchConversations]);

  // ─── Load messages when active conversation changes ──────────────
  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId).then((msgs) => setMessages(msgs));
    } else {
      setMessages([]);
    }
  }, [activeConversationId, fetchMessages]);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversationId,
        messages,
        streamingMessage,
        streamError,
        contacts,
        typingAgents,
        isLoadingConversations,
        isLoadingMessages,
        isLoadingContacts,
        setActiveConversation: setActiveConversationId,
        fetchConversations,
        fetchMessages,
        sendMessage,
        createConversation,
        setTypingAgent,
        appendMessageChunk,
        finalizeMessage,
        setStreamError,
        setMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
