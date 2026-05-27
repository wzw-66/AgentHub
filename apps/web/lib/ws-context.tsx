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
import { getStoredAccessToken } from "./api-client";
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

type WSEvent = OnlineStatusEvent | MessageStatusEvent;

interface OnlineStatusMap {
  [userId: string]: boolean;
}

interface MessageStatusMap {
  [messageId: string]: "sent" | "delivered" | "read";
}

interface WSContextValue {
  status: WSConnectionStatus;
  onlineStatuses: OnlineStatusMap;
  messageStatuses: MessageStatusMap;
}

// ─── Context ───────────────────────────────────────────────────────────

const WSContext = createContext<WSContextValue | null>(null);

const MAX_RETRIES = 5;
const BASE_DELAY = 1000;

// ─── Provider ──────────────────────────────────────────────────────────

export function WSProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<WSConnectionStatus>("disconnected");
  const [onlineStatuses, setOnlineStatuses] = useState<OnlineStatusMap>({});
  const [messageStatuses, setMessageStatuses] = useState<MessageStatusMap>({});
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // ─── Handle incoming messages ───────────────────────────────────
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as WSEvent;

      switch (data.type) {
        case "online_status":
          setOnlineStatuses((prev) => ({
            ...prev,
            [data.userId]: data.online,
          }));
          break;

        case "message_status":
          setMessageStatuses((prev) => ({
            ...prev,
            [data.messageId]: data.status,
          }));
          break;
      }
    } catch {
      // Ignore malformed messages
    }
  }, []);

  // ─── Ping/pong heartbeat ────────────────────────────────────────
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

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8123";
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
        handleMessage(event);
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus("disconnected");
        stopHeartbeat();

        // Auto-reconnect
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
  }, [handleMessage, startHeartbeat, stopHeartbeat]);

  // ─── Disconnect ─────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    stopHeartbeat();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
    retryCountRef.current = 0;
  }, [stopHeartbeat]);

  // ─── Lifecycle: connect when authenticated ──────────────────────
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
    <WSContext.Provider
      value={{
        status,
        onlineStatuses,
        messageStatuses,
      }}
    >
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
