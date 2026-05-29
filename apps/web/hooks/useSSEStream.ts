"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getStoredAccessToken, API_BASE_URL } from "@/lib/api-client";
import { useChat } from "@/lib/chat-context";

type ConnectionStatus = "disconnected" | "connecting" | "connected";

interface SSEChunkEvent {
  type: "chunk";
  conversationId: string;
  content: string;
  agentId?: string;
}

interface SSEDoneEvent {
  type: "done";
  conversationId: string;
  agentId?: string;
  tokenUsage?: {
    input: number;
    output: number;
  };
}

interface SSEErrorEvent {
  type: "error";
  conversationId: string;
  message: string;
}

type SSEEvent = SSEChunkEvent | SSEDoneEvent | SSEErrorEvent;

export function useSSEStream(conversationId: string | null) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 5;
  const { setTypingAgent, appendMessageChunk, finalizeMessage } = useChat();

  // ─── Parse SSE event ────────────────────────────────────────────
  const handleEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent;

        switch (data.type) {
          case "chunk":
            appendMessageChunk(data.content);
            if (data.agentId) {
              setTypingAgent(data.agentId, true);
            }
            break;

          case "done":
            if (data.agentId) {
              setTypingAgent(data.agentId, false);
            }
            finalizeMessage();
            break;

          case "error":
            console.error("SSE error:", data.message);
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    },
    [appendMessageChunk, setTypingAgent, finalizeMessage],
  );

  // ─── Connect ────────────────────────────────────────────────────
  const connect = useCallback(
    (convId: string) => {
      // Close existing connection
      eventSourceRef.current?.close();

      const token = getStoredAccessToken();
      if (!token) return;

      const baseUrl = API_BASE_URL;
      const url = `${baseUrl}/sse/conversations/${convId}/stream?token=${encodeURIComponent(token)}`;

      setStatus("connecting");
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setStatus("connected");
        retryCountRef.current = 0;
      };

      es.addEventListener("message", handleEvent as EventListener);

      es.onerror = () => {
        setStatus("disconnected");
        es.close();

        // Auto-reconnect with exponential backoff
        if (retryCountRef.current < maxRetries) {
          const delay = Math.min(
            1000 * Math.pow(2, retryCountRef.current),
            30000,
          );
          retryCountRef.current += 1;
          setTimeout(() => connect(convId), delay);
        }
      };
    },
    [handleEvent],
  );

  // ─── Disconnect ─────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setStatus("disconnected");
    retryCountRef.current = 0;
  }, []);

  // ─── Lifecycle: connect on conversation change ──────────────────
  useEffect(() => {
    if (conversationId) {
      connect(conversationId);
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [conversationId, connect, disconnect]);

  return { status };
}
