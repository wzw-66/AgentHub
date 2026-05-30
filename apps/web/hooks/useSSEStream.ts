"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getStoredAccessToken, API_BASE_URL } from "@/lib/api-client";
import { useChat } from "@/lib/chat-context";

type ConnectionStatus = "disconnected" | "connecting" | "connected";

export function useSSEStream(conversationId: string | null) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 5;
  const { setTypingAgent, appendMessageChunk, finalizeMessage } = useChat();

  // ─── Chunk event handler ──────────────────────────────────────────
  const handleChunk = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          content: string;
          timestamp?: string;
          agentId?: string;
        };
        appendMessageChunk(data.content, data.agentId);
        if (data.agentId) {
          setTypingAgent(data.agentId, true);
        }
      } catch {
        // Ignore malformed messages
      }
    },
    [appendMessageChunk, setTypingAgent],
  );

  // ─── Done event handler ───────────────────────────────────────────
  const handleDone = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          messageId?: string;
          agentId?: string;
          tokenUsage?: { input: number; output: number };
        };
        if (data.agentId) {
          setTypingAgent(data.agentId, false);
        }
        finalizeMessage(data.messageId, data.agentId);
      } catch {
        // Ignore malformed messages
      }
    },
    [setTypingAgent, finalizeMessage],
  );

  // ─── Error event handler ──────────────────────────────────────────
  const handleErrorEvent = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as {
        message?: string;
        code?: string;
      };
      console.error("SSE error:", data.message ?? "Unknown error");
    } catch {
      // Ignore malformed messages
    }
  }, []);

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

      // Register named event listeners matching server-side events
      es.addEventListener("chunk", handleChunk as EventListener);
      es.addEventListener("done", handleDone as EventListener);
      es.addEventListener("error", handleErrorEvent as EventListener);

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
    [handleChunk, handleDone, handleErrorEvent],
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
