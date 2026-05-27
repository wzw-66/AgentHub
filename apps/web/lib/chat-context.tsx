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

// ─── Types ────────────────────────────────────────────────────────────

interface AgentInfo {
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
  agents: AgentInfo[];
  typingAgents: Map<string, boolean>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isLoadingAgents: boolean;
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
  appendMessageChunk: (chunkText: string) => void;
  finalizeMessage: () => void;
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
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [typingAgents, setTypingAgents] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);

  // ─── Streaming message state ─────────────────────────────────────
  const [streamingMessage, setStreamingMessage] =
    useState<StreamingMessage | null>(null);
  const streamIdRef = useRef(0);

  const fetchConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const data = await api.get<{
        conversations: Conversation[];
        total: number;
      }>("/api/conversations/list");
      setConversations(data.conversations);
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
        const data = await api.get<{ messages: Message[] }>(path);
        return data.messages;
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (conversationId: string, content: string): Promise<Message> => {
      const data = await api.post<{ message: Message }>(
        `/api/conversations/${conversationId}/messages/create`,
        { content },
      );
      setMessages((prev) => [...prev, data.message]);
      return data.message;
    },
    [],
  );

  const createConversation = useCallback(
    async (
      title: string,
      type: "single" | "group",
      contactIds: string[],
    ): Promise<Conversation> => {
      const data = await api.post<{ conversation: Conversation }>(
        "/api/conversations/create",
        {
          title,
          type,
          contactIds,
        },
      );
      setConversations((prev) => [data.conversation, ...prev]);
      return data.conversation;
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
    (chunkText: string) => {
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
          senderId: "agent",
          type: MessageType.Text,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isStreaming: true,
        };
      });
    },
    [activeConversationId],
  );

  const finalizeMessage = useCallback(() => {
    setStreamingMessage((prev) => {
      if (prev) {
        // Convert streaming message to a permanent message
        const permanent: Message = {
          id: prev.id,
          conversationId: prev.conversationId,
          content: prev.content,
          senderType: SenderType.Contact,
          senderId: "agent",
          type: MessageType.Text,
          createdAt: prev.createdAt,
          updatedAt: new Date().toISOString(),
        };
        setMessages((msgs) => [...msgs, permanent]);
      }
      return null;
    });
    setTypingAgents(new Map());
  }, []);

  // ─── Load agents on mount (only if authenticated) ───────────────
  useEffect(() => {
    async function loadAgents() {
      setIsLoadingAgents(true);
      try {
        const data = await api.get<{ agents: AgentInfo[] }>("/api/agents/list");
        setAgents(data.agents);
      } catch {
        // API not available yet
      } finally {
        setIsLoadingAgents(false);
      }
    }
    if (getStoredAccessToken()) {
      loadAgents();
    } else {
      setIsLoadingAgents(false);
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
        agents,
        typingAgents,
        isLoadingConversations,
        isLoadingMessages,
        isLoadingAgents,
        setActiveConversation: setActiveConversationId,
        fetchConversations,
        fetchMessages,
        sendMessage,
        createConversation,
        setTypingAgent,
        appendMessageChunk,
        finalizeMessage,
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
