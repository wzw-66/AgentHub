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
import {
  DEMO_TIMING,
  INTERACTION,
  AGENT_1_CHUNKS,
  AGENT_2_CHUNKS,
  AGENT_3_CHUNKS,
  AGGREGATOR_CHUNKS,
  DIFF_CHUNKS,
  FILE_TREE_AGENT_1,
  FILE_TREE_AGENT_2,
  FILE_TREE_COMPLETE,
  type DemoPhase,
  type DemoFileNode,
  type DemoDiffItem,
  DEMO_DIFFS_BY_PHASE,
} from "./demo-data";

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

interface PendingInteraction {
  prompt: string;
  options?: { label: string; description: string }[];
  multiSelect?: boolean;
}

interface ChatContextValue {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  streamingMessages: Map<string, StreamingMessage>;
  streamError: string | null;
  contacts: ContactInfo[];
  typingAgents: Map<string, boolean>;
  /** Per-agent tool call status — shows what tool the agent is currently using */
  toolStatusMap: Map<string, { toolName: string; timestamp: number }>;
  /** Pending interaction from agent (AskUserQuestion) */
  pendingInteraction: PendingInteraction | null;
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
  /** Toggle pin status for a message */
  togglePinMessage: (conversationId: string, messageId: string, isPinned: boolean) => Promise<void>;
  /** Send a response to a pending agent interaction */
  respondToInteraction: (response: string) => void;
  /** Cancel a pending agent interaction */
  cancelInteraction: () => void;
  // ─── Demo mode ───────────────────────────────────────────────────
  demoMode: boolean;
  demoPhase: DemoPhase;
  demoFileTree: DemoFileNode[];
  demoDiffs: DemoDiffItem[];
  /** Remove a diff item by its path (and optional timestamp for duplicates) */
  removeDemoDiff: (path: string) => void;
  /** Set file tree manually (used by RightPanel version rollback) */
  setDemoFileTree: (tree: DemoFileNode[]) => void;
  startDemoSequence: (convId: string, agents: { id: string; name: string }[]) => void;
}

// ─── Context ───────────────────────────────────────────────────────────

const ChatContext = createContext<ChatContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { onEvent, send: wsSend } = useWS();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const activeConvRef = useRef(activeConversationId);
  activeConvRef.current = activeConversationId;
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

  // ─── Tool status state ──────────────────────────────────────────
  const [toolStatusMap, setToolStatusMap] = useState<
    Map<string, { toolName: string; timestamp: number }>
  >(new Map());

  // ─── Pending interaction state ──────────────────────────────────
  const [pendingInteraction, setPendingInteraction] =
    useState<PendingInteraction | null>(null);

  // ─── Demo mode state ────────────────────────────────────────────
  const [demoMode, setDemoMode] = useState(false);
  const [demoPhase, setDemoPhase] = useState<DemoPhase>(null);
  const [demoFileTree, setDemoFileTree] = useState<DemoFileNode[]>([]);
  const [demoDiffs, setDemoDiffs] = useState<DemoDiffItem[]>([]);
  const removeDemoDiff = useCallback((path: string) => {
    setDemoDiffs((prev) => prev.filter((d) => d.path !== path));
  }, []);
  const demoAgentsRef = useRef<{ id: string; name: string }[]>([]);
  const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Track accumulated streaming content by agentId (ref, not state — enables
  // finalizeMessage to read content without nested setState)
  const streamingContentRef = useRef<Map<string, string>>(new Map());

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
      // Store content in ref immediately (not through React state batching)
      // so finalizeMessage can read it without relying on React state
      const prevRefContent = streamingContentRef.current.get(key) ?? "";
      streamingContentRef.current.set(key, prevRefContent + chunkText);

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
    // Read content from ref (immediate, not through React state batching).
    // This avoids reading from streamingMessages state inside an updater,
    // which would require nested setState (setState inside another's updater).
    // React 18 may assign nested setState to a different lane, causing
    // setMessages and setStreamingMessages.delete to commit in separate
    // renders — which means the UI briefly shows BOTH the permanent message
    // AND the streaming entry, resulting in the duplicate render.
    const content = streamingContentRef.current.get(key);
    if (content) {
      // Clean up ref so repeated calls are no-ops
      streamingContentRef.current.delete(key);

      const id = messageId || `streaming-${++streamIdRef.current}`;
      const permanent: Message = {
        id,
        conversationId: activeConvRef.current || "",
        content,
        senderType: SenderType.Contact,
        senderId: agentId ?? "agent",
        type: MessageType.Text,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // Both setMessages and setStreamingMessages are called at the SAME level
      // (not nested inside each other's updaters). React 18 reliably batches
      // same-level setState calls from the same synchronous context into a
      // single commit, preventing the duplicate rendering bug.
      setMessages((msgs) => {
        if (messageId && msgs.some((m) => m.id === messageId)) {
          return msgs;
        }
        return [...msgs, permanent];
      });
      setStreamingMessages((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }
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

  // ─── Interaction methods ────────────────────────────────────────
  const respondToInteraction = useCallback(
    (response: string) => {
      // ─── Demo mode: handle interaction locally ────────────────
      if (demoMode) {
        setPendingInteraction(null);
        const agents = demoAgentsRef.current;
        if (agents.length === 0) return;

        // Add user's response as a message
        const userResponseMsg: Message = {
          id: `demo-user-resp-${Date.now()}`,
          conversationId: activeConvRef.current || "",
          content: response,
          senderType: SenderType.User,
          senderId: "user",
          type: MessageType.Text,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userResponseMsg]);

        // Push theme diff to the right panel timeline
        setDemoDiffs((prev) => [...prev, ...(DEMO_DIFFS_BY_PHASE.theme ?? [])]);

        // Step 1: Agent outputs the theme diff update
        setDemoPhase("aggregate");
        DIFF_CHUNKS.forEach((chunk, i) => {
          const t = setTimeout(() => {
            appendMessageChunk(chunk, agents[0]!.id);
          }, i * 800);
          demoTimersRef.current.push(t);
        });

        // Step 2: Finalize diff → show orchestrator summary
        const diffDoneT = setTimeout(() => {
          finalizeMessage(undefined, agents[0]!.id);
          AGGREGATOR_CHUNKS.forEach((chunk, i) => {
            const t = setTimeout(() => {
              appendMessageChunk(chunk, "Orchestrator");
            }, i * 800);
            demoTimersRef.current.push(t);
          });
          // Finalize orchestrator summary → done
          const finalT = setTimeout(() => {
            finalizeMessage(undefined, "Orchestrator");
            setDemoPhase("done");
          }, AGGREGATOR_CHUNKS.length * 800 + 500);
          demoTimersRef.current.push(finalT);
        }, DIFF_CHUNKS.length * 800 + 500);
        demoTimersRef.current.push(diffDoneT);

        return;
      }

      // ─── Normal mode ──────────────────────────────────────────
      const convId = activeConvRef.current;
      if (!convId) return;
      wsSend({
        type: "user:interact",
        payload: { conversationId: convId, response },
      });
      setPendingInteraction(null);
    },
    [wsSend, demoMode, appendMessageChunk, finalizeMessage, setMessages],
  );

  const cancelInteraction = useCallback(() => {
    // Demo mode: skip interaction → show aggregator
    if (demoMode) {
      setPendingInteraction(null);
      const agents = demoAgentsRef.current;
      if (agents.length > 0) {
        setDemoPhase("aggregate");
        AGGREGATOR_CHUNKS.forEach((chunk, i) => {
          const t = setTimeout(() => appendMessageChunk(chunk, agents[0]!.id), i * 600);
          demoTimersRef.current.push(t);
        });
        const t = setTimeout(() => {
          finalizeMessage(undefined, agents[0]!.id);
          setDemoPhase("done");
        }, AGGREGATOR_CHUNKS.length * 600 + 400);
        demoTimersRef.current.push(t);
      }
      return;
    }
    // Normal mode
    setPendingInteraction(null);
    const convId = activeConvRef.current;
    if (convId) {
      wsSend({
        type: "user:interact",
        payload: { conversationId: convId, response: "__cancel__" },
      });
    }
  }, [wsSend, demoMode, appendMessageChunk, finalizeMessage]);

  // ─── Demo sequence ─────────────────────────────────────────────
  const startDemoSequence = useCallback(
    (convId: string, agents: { id: string; name: string }[]) => {
      if (!convId || agents.length < 3) return;

      // Clean up any previous demo timers
      demoTimersRef.current.forEach(clearTimeout);
      demoTimersRef.current = [];

      setDemoMode(true);
      setDemoPhase("analyzing");
      setDemoFileTree([]);
      setDemoDiffs([]);
      setMessages([]);
      setStreamError(null);
      setPendingInteraction(null);
      setToolStatusMap(new Map());
      demoAgentsRef.current = agents;

      const a = agents;
      const timers = demoTimersRef.current;

      // → Orchestrator 分析 (2s) → 意图分析
      timers.push(setTimeout(() => setDemoPhase("intro"), DEMO_TIMING.phaseAnalyzing));

      // → 任务分解
      timers.push(setTimeout(() => setDemoPhase("decompose"), DEMO_TIMING.phaseIntro));

      // ─── Agent 1 ─────────────────────────────────────────────────
      timers.push(
        setTimeout(() => {
          setDemoPhase("agent_1");
          setToolStatusMap((prev) => {
            const next = new Map(prev);
            next.set(a[0]!.id, { toolName: "Think", timestamp: Date.now() });
            return next;
          });
          AGENT_1_CHUNKS.forEach((chunk, i) => {
            timers.push(setTimeout(() => appendMessageChunk(chunk, a[0]!.id), i * 1500));
          });
        }, DEMO_TIMING.phaseDecompose),
      );
      // Tool indicators for Agent 1 (8 chunks × 1500ms = 10500ms)
      timers.push(setTimeout(() => {
        setToolStatusMap((prev) => {
          const next = new Map(prev);
          next.set(a[0]!.id, { toolName: "Write", timestamp: Date.now() });
          return next;
        });
      }, DEMO_TIMING.phaseDecompose + 1300));
      timers.push(setTimeout(() => {
        setToolStatusMap((prev) => {
          const next = new Map(prev);
          next.set(a[0]!.id, { toolName: "Write", timestamp: Date.now() });
          return next;
        });
      }, DEMO_TIMING.phaseDecompose + 4300));
      timers.push(setTimeout(() => {
        setToolStatusMap((prev) => {
          const next = new Map(prev);
          next.set(a[0]!.id, { toolName: "Write", timestamp: Date.now() });
          return next;
        });
      }, DEMO_TIMING.phaseDecompose + 7300));
      timers.push(setTimeout(() => {
        setToolStatusMap((prev) => {
          const next = new Map(prev);
          next.delete(a[0]!.id);
          return next;
        });
      }, DEMO_TIMING.phaseDecompose + 11000));

      // → Agent 1 done → Agent 2 starts
      timers.push(
        setTimeout(() => {
          finalizeMessage(undefined, a[0]!.id);
          setToolStatusMap((prev) => {
            const next = new Map(prev);
            next.delete(a[0]!.id);
            return next;
          });
          setDemoFileTree(FILE_TREE_AGENT_1);
          setDemoDiffs((prev) => [...prev, ...(DEMO_DIFFS_BY_PHASE.agent_1 ?? [])]);
          setDemoPhase("agent_2");
          setToolStatusMap((prev) => {
            const next = new Map(prev);
            next.set(a[1]!.id, { toolName: "Think", timestamp: Date.now() });
            return next;
          });
          AGENT_2_CHUNKS.forEach((chunk, i) => {
            timers.push(setTimeout(() => appendMessageChunk(chunk, a[1]!.id), i * 1500));
          });
        }, DEMO_TIMING.finishAgent1),
      );
      // Tool indicators for Agent 2 (4 chunks × 1500ms = 4500ms)
      timers.push(setTimeout(() => {
        setToolStatusMap((prev) => {
          const next = new Map(prev);
          next.set(a[1]!.id, { toolName: "Write", timestamp: Date.now() });
          return next;
        });
      }, DEMO_TIMING.finishAgent1 + 1300));
      timers.push(setTimeout(() => {
        setToolStatusMap((prev) => {
          const next = new Map(prev);
          next.set(a[1]!.id, { toolName: "Write", timestamp: Date.now() });
          return next;
        });
      }, DEMO_TIMING.finishAgent1 + 4300));
      timers.push(setTimeout(() => {
        setToolStatusMap((prev) => {
          const next = new Map(prev);
          next.delete(a[1]!.id);
          return next;
        });
      }, DEMO_TIMING.finishAgent1 + 5000));

      // → Agent 2 done → Agent 3 starts
      timers.push(
        setTimeout(() => {
          finalizeMessage(undefined, a[1]!.id);
          setToolStatusMap((prev) => {
            const next = new Map(prev);
            next.delete(a[1]!.id);
            return next;
          });
          setDemoFileTree(FILE_TREE_AGENT_2);
          setDemoDiffs((prev) => [...prev, ...(DEMO_DIFFS_BY_PHASE.agent_2 ?? [])]);
          setDemoPhase("agent_3");
          setToolStatusMap((prev) => {
            const next = new Map(prev);
            next.set(a[2]!.id, { toolName: "Think", timestamp: Date.now() });
            return next;
          });
          AGENT_3_CHUNKS.forEach((chunk, i) => {
            timers.push(setTimeout(() => appendMessageChunk(chunk, a[2]!.id), i * 1500));
          });
        }, DEMO_TIMING.finishAgent2),
      );
      // Tool indicators for Agent 3 (3 chunks × 1500ms = 3000ms)
      timers.push(setTimeout(() => {
        setToolStatusMap((prev) => {
          const next = new Map(prev);
          next.set(a[2]!.id, { toolName: "Write", timestamp: Date.now() });
          return next;
        });
      }, DEMO_TIMING.finishAgent2 + 1300));
      timers.push(setTimeout(() => {
        setToolStatusMap((prev) => {
          const next = new Map(prev);
          next.delete(a[2]!.id);
          return next;
        });
      }, DEMO_TIMING.finishAgent2 + 3500));

      // → Agent 3 done → show interaction card
      timers.push(
        setTimeout(() => {
          finalizeMessage(undefined, a[2]!.id);
          setToolStatusMap((prev) => {
            const next = new Map(prev);
            next.delete(a[2]!.id);
            return next;
          });
          setDemoFileTree(FILE_TREE_COMPLETE);
          setDemoDiffs((prev) => [...prev, ...(DEMO_DIFFS_BY_PHASE.agent_3 ?? [])]);
          setDemoPhase("interact");
          setPendingInteraction(INTERACTION);
        }, DEMO_TIMING.finishAgent3),
      );
    },
    [appendMessageChunk, finalizeMessage, setMessages, setStreamError],
  );

  // ─── Clean up demo timers on unmount ────────────────────────────
  useEffect(() => {
    return () => {
      demoTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  // ─── Reset demo state when conversation changes ─────────────────
  useEffect(() => {
    if (demoMode) {
      demoTimersRef.current.forEach(clearTimeout);
      demoTimersRef.current = [];
      setDemoMode(false);
      setDemoPhase(null);
      setDemoFileTree([]);
      setDemoDiffs([]);
      setPendingInteraction(null);
    }
  }, [activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const togglePinMessage = useCallback(
    async (conversationId: string, messageId: string, isPinned: boolean) => {
      await api.post(
        `/api/conversations/${conversationId}/messages/${messageId}/pin`,
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, isPinned: !isPinned } : m,
        ),
      );
      // Notify other components (e.g. RightPanel) to refresh pinned list
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("pinned-messages-changed", { detail: { conversationId } }));
      }
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

          // Clear tool status for this agent when done
          if (doneEvent.agentId) {
            setToolStatusMap((prev) => {
              const next = new Map(prev);
              next.delete(doneEvent.agentId!);
              return next;
            });
          }
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
        case "tool_status": {
          const toolEvent = event as { toolName?: string; agentId?: string };
          if (toolEvent.toolName && toolEvent.agentId) {
            setToolStatusMap((prev) => {
              const next = new Map(prev);
              next.set(toolEvent.agentId!, {
                toolName: toolEvent.toolName!,
                timestamp: Date.now(),
              });
              return next;
            });
          }
          break;
        }
        case "replace": {
          const replaceEvent = event as { messageId?: string; content?: string };
          if (replaceEvent.messageId && replaceEvent.content) {
            replaceMessage(replaceEvent.messageId, replaceEvent.content);
          }
          break;
        }
        case "interactive": {
          const intEvent = event as { prompt?: string; options?: { label: string; description: string }[]; multiSelect?: boolean };
          if (intEvent.prompt) {
            setPendingInteraction({
              prompt: intEvent.prompt,
              options: intEvent.options,
              multiSelect: intEvent.multiSelect,
            });
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
        toolStatusMap,
        pendingInteraction,
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
        replaceMessage,        togglePinConversation,        togglePinMessage,        toggleArchiveConversation,        setStreamError,
        setMessages,
        respondToInteraction,
        cancelInteraction,
        // ─── Demo mode ────────────────────────────────────────────
        demoMode,
        demoPhase,
        demoFileTree,
        demoDiffs,
        removeDemoDiff,
        setDemoFileTree,
        startDemoSequence,
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
