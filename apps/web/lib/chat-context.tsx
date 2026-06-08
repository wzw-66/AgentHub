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
import { api } from "./api-client";
import { useAuth } from "./auth-context";
import { useWS } from "./ws-context";
import type { Conversation, Message } from "@agenthub/shared";
import { SenderType, MessageType } from "@agenthub/shared";
import type { Dispatch, SetStateAction } from "react";

// ─── Types ────────────────────────────────────────────────────────────

interface ContactInfo {
  id: string;
  name: string;
  provider: string;
  avatarUrl?: string;
  displayName?: string | null;
  tags?: string[];
  systemPrompt?: string | null;
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
  streamingMessages: Map<string, StreamingMessage>;
  streamError: string | null;
  contacts: ContactInfo[];
  typingAgents: Map<string, boolean>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isLoadingContacts: boolean;
  fetchContacts: () => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId: string, cursor?: string) => Promise<Message[]>;
  sendMessage: (conversationId: string, content: string, parentId?: string) => Promise<Message>;
  replaceMessage: (messageId: string, content: string) => void;
  togglePinConversation: (conversationId: string, isPinned: boolean) => Promise<void>;
  toggleArchiveConversation: (conversationId: string, isArchived: boolean) => Promise<void>;
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
  const { isAuthenticated } = useAuth();
  const { onEvent } = useWS();
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
  const [streamingMessages, setStreamingMessages] =
    useState<Map<string, StreamingMessage>>(new Map());
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

  const fetchContacts = useCallback(async () => {
    setIsLoadingContacts(true);
    try {
      const data = await api.get<ContactInfo[]>("/api/contacts/list");
      setContacts(data);
    } catch {
      // API not available yet
    } finally {
      setIsLoadingContacts(false);
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
    async (conversationId: string, content: string, parentId?: string): Promise<Message> => {
      const message = await api.post<Message>(
        `/api/conversations/${conversationId}/messages/create`,
        { content, parentId },
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
      const key = agentId ?? "default";
      setStreamingMessages((prev) => {
        const next = new Map(prev);
        const existing = next.get(key);
        if (existing) {
          next.set(key, { ...existing, content: existing.content + chunkText });
        } else {
          const id = `streaming-${++streamIdRef.current}`;
          next.set(key, {
            id,
            conversationId: activeConversationId || "",
            content: chunkText,
            senderType: SenderType.Contact,
            senderId: agentId ?? "agent",
            type: MessageType.Text,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isStreaming: true,
          });
        }
        return next;
      });
    },
    [activeConversationId],
  );

  const finalizeMessage = useCallback((messageId?: string, agentId?: string) => {
    const key = agentId ?? "default";
    setStreamingMessages((prev) => {
      const next = new Map(prev);
      const msg = next.get(key);
      if (msg) {
        // Convert streaming message to a permanent message
        // Use the real DB messageId if available, otherwise keep the streaming id
        const id = messageId || msg.id;
        const permanent: Message = {
          id,
          conversationId: msg.conversationId,
          content: msg.content,
          senderType: SenderType.Contact,
          senderId: agentId ?? msg.senderId,
          type: MessageType.Text,
          createdAt: msg.createdAt,
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
        next.delete(key);
      }
      return next;
    });
    setTypingAgents(new Map());
  }, []);

  const replaceMessage = useCallback(
    (messageId: string, content: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content } : m)),
      );
    },
    [],
  );

  const togglePinConversation = useCallback(
    async (conversationId: string, isPinned: boolean) => {
      await api.patch(`/api/conversations/${conversationId}/update`, {
        isPinned: !isPinned,
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, isPinned: !isPinned } : c,
        ),
      );
    },
    [],
  );

  const toggleArchiveConversation = useCallback(
    async (conversationId: string, isArchived: boolean) => {
      await api.patch(`/api/conversations/${conversationId}/update`, {
        isArchived: !isArchived,
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, isArchived: !isArchived } : c,
        ),
      );
    },
    [],
  );

  // ─── Load contacts when authenticated ─────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      setContacts([]);
      setIsLoadingContacts(false);
      return;
    }
    fetchContacts();
  }, [isAuthenticated, fetchContacts]);

  // ─── Load conversations when authenticated ────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      setConversations([]);
      return;
    }
    fetchConversations();
  }, [isAuthenticated, fetchConversations]);

  // ─── Load messages when active conversation changes ──────────────
  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId).then((msgs) => setMessages(msgs));
    } else {
      setMessages([]);
    }
  }, [activeConversationId, fetchMessages]);

  // ─── Subscribe to WebSocket agent events ────────────────────────
  useEffect(() => {
    const unsubscribe = onEvent((event) => {
      switch (event.type) {
        case "chunk": {
          if ("content" in event && event.content) {
            appendMessageChunk(event.content as string, (event as { agentId?: string }).agentId);
          }
          break;
        }
        case "done": {
          const doneEvent = event as { messageId?: string; agentId?: string };
          finalizeMessage(doneEvent.messageId, doneEvent.agentId);
          if (activeConversationId) {
            fetchMessages(activeConversationId).then((msgs) => setMessages(msgs));
          }
          break;
        }
        case "error": {
          setStreamError((event as { message?: string }).message || "Agent error");
          break;
        }
        case "notification": {
          fetchConversations();
          break;
        }
        case "replace": {
          const replaceEvent = event as { messageId?: string; content?: string };
          if (replaceEvent.messageId && replaceEvent.content) {
            replaceMessage(replaceEvent.messageId, replaceEvent.content);
          }
          break;
        }
      }
    });

    return unsubscribe;
  }, [
    activeConversationId,
    appendMessageChunk,
    finalizeMessage,
    setStreamError,
    fetchConversations,
    fetchMessages,
    replaceMessage,
    onEvent,
  ]);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversationId,
        messages,
        streamingMessages,
        streamError,
        contacts,
        typingAgents,
        isLoadingConversations,
        isLoadingMessages,
        isLoadingContacts,
        fetchContacts,
        setActiveConversation: setActiveConversationId,
        fetchConversations,
        fetchMessages,
        sendMessage,
        createConversation,
        setTypingAgent,
        appendMessageChunk,
        finalizeMessage,
        replaceMessage,        togglePinConversation,        toggleArchiveConversation,        setStreamError,
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
