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
import { getStoredAccessToken, API_BASE_URL } from "./api-client";
import { useAuth } from "./auth-context";

// ─── Types ────────────────────────────────────────────────────────────

type WSConnectionStatus = "disconnected" | "connecting" | "connected";

interface OnlineStatusEvent {
  type: "online_status";
  userId: string;
  online: boolean;
}

interface MessageStatusEvent {
  type: "message_status";
  messageId: string;
  status: "sent" | "delivered" | "read";
}

interface ChunkEvent {
  type: "chunk";
  content: string;
  agentId: string;
  timestamp?: number;
}

interface DoneEvent {
  type: "done";
  messageId: string;
  agentId: string;
  tokenUsage?: { input: number; output: number };
}

interface ErrorEvent {
  type: "error";
  message: string;
  code: string;
  agentId?: string;
}

interface ReplaceEvent {
  type: "replace";
  messageId: string;
  content: string;
  agentId: string;
}

interface NotificationEvent {
  type: "notification";
  conversationId: string;
  senderId: string;
  preview: string;
}

type WSEvent = OnlineStatusEvent | MessageStatusEvent | ChunkEvent | DoneEvent | ErrorEvent | ReplaceEvent | NotificationEvent;

type WSEventHandler = (event: WSEvent) => void;

interface WSContextValue {
  status: WSConnectionStatus;
  onEvent: (handler: WSEventHandler) => () => void;
}

// ─── Context ───────────────────────────────────────────────────────────

const WSContext = createContext<WSContextValue | null>(null);

const MAX_RETRIES = 5;
const BASE_DELAY = 1000;

// ─── Provider ──────────────────────────────────────────────────────────

export function WSProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<WSConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const handlersRef = useRef<Set<WSEventHandler>>(new Set());

  // ─── Event system ─────────────────────────────────────────────────
  const onEvent = useCallback((handler: WSEventHandler): () => void => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const emitEvent = useCallback((event: WSEvent) => {
    handlersRef.current.forEach((handler) => {
      try { handler(event); } catch { /* ignore handler errors */ }
    });
  }, []);

  // ─── Heartbeat ────────────────────────────────────────────────────
  const startHeartbeat = useCallback((ws: WebSocket) => {
    pingIntervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  // ─── Connect ────────────────────────────────────────────────────
  const connect = useCallback(() => {
    const token = getStoredAccessToken();
    if (!token) return;

    const baseUrl = API_BASE_URL;
    const wsUrl = baseUrl.replace(/^http/, "ws");
    const url = `${wsUrl}/ws?token=${encodeURIComponent(token)}`;

    setStatus("connecting");

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus("connected");
        retryCountRef.current = 0;
        startHeartbeat(ws);
      };

      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data as string) as {
            type: string;
            payload?: unknown;
            timestamp?: string;
          };
          // Unwrap WS message format: { type, payload, timestamp } → flat event
          const flatEvent = raw.payload !== undefined
            ? { ...(raw.payload as Record<string, unknown>), type: raw.type }
            : raw;
          emitEvent(flatEvent as WSEvent);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus("disconnected");
        stopHeartbeat();

        if (retryCountRef.current < MAX_RETRIES) {
          const delay = Math.min(
            BASE_DELAY * Math.pow(2, retryCountRef.current),
            30000,
          );
          retryCountRef.current += 1;
          setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      setStatus("disconnected");
    }
  }, [emitEvent, startHeartbeat, stopHeartbeat]);

  const disconnect = useCallback(() => {
    stopHeartbeat();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
    retryCountRef.current = 0;
  }, [stopHeartbeat]);

  // ─── Lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  return (
    <WSContext.Provider value={{ status, onEvent }}>
      {children}
    </WSContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useWS(): WSContextValue {
  const context = useContext(WSContext);
  if (!context) {
    throw new Error("useWS must be used within a WSProvider");
  }
  return context;
}
