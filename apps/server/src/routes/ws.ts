import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { verifyQueryToken } from "../middleware/jwt";
import type { WSClientMessage } from "../realtime/types";
import { formatWSMessage } from "../realtime/types";

// ─── WebSocket message handler map ───────────────────────────────────

type WSHandler = (
  cm: FastifyInstance["connectionManager"],
  socket: WebSocket,
  userId: string,
  payload: unknown,
) => void;

const wsHandlers: Record<string, WSHandler> = {
  "typing:start": (cm, _socket, userId, payload) => {
    const data = payload as { conversationId: string };
    cm.broadcastToConversation(
      cm.getConnectedUserIds(),
      "typing:indicator",
      { conversationId: data.conversationId, userId, isTyping: true },
      userId,
    );
  },

  "typing:end": (cm, _socket, userId, payload) => {
    const data = payload as { conversationId: string };
    cm.broadcastToConversation(
      cm.getConnectedUserIds(),
      "typing:indicator",
      { conversationId: data.conversationId, userId, isTyping: false },
      userId,
    );
  },

  "message:read": (_cm, _socket, _userId, _payload) => {
    // acknowledged — no server-side action needed currently
  },

  ping: (_cm, socket, _userId, _payload) => {
    socket.send(formatWSMessage("pong", {}));
  },
};

// ─── Helper: broadcast online status ─────────────────────────────────

function broadcastStatus(
  cm: FastifyInstance["connectionManager"],
  userId: string,
  status: "online" | "offline",
): void {
  cm.broadcastToConversation(
    cm.getConnectedUserIds(),
    "status:update",
    { userId, status },
    userId,
  );
}

// ─── WS connection handler ───────────────────────────────────────────

function handleWSConnection(socket: WebSocket, request: FastifyRequest): void {
  const cm = request.server.connectionManager;

  // ─── Auth ──────────────────────────────────────────────────────────

  const url = new URL(request.url, `http://${request.headers.host}`);
  const token = url.searchParams.get("token");
  const user = verifyQueryToken({ token: token ?? undefined });

  if (!user) {
    socket.close(4001, "invalid_token");
    return;
  }

  const userId = user.userId;

  // ─── Register connection ───────────────────────────────────────────

  cm.addWSConnection(userId, socket);

  // Broadcast online
  broadcastStatus(cm, userId, "online");

  // ─── Heartbeat timeout ─────────────────────────────────────────────

  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  function resetHeartbeat(): void {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      socket.close(4002, "heartbeat_timeout");
    }, 60_000);
  }

  resetHeartbeat();

  // ─── Message handler ───────────────────────────────────────────────

  socket.on("message", (raw: Buffer) => {
    resetHeartbeat();

    try {
      const msg: WSClientMessage = JSON.parse(raw.toString());
      const handler = wsHandlers[msg.type];
      if (handler) {
        handler(cm, socket, userId, "payload" in msg ? msg.payload : undefined);
      }
    } catch {
      socket.send(formatWSMessage("error", { message: "invalid_message" }));
    }
  });

  // ─── Close handler ─────────────────────────────────────────────────

  socket.on("close", () => {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    cm.removeWSConnection(userId, socket);
    broadcastStatus(cm, userId, "offline");
  });
}

// ─── Plugin ──────────────────────────────────────────────────────────

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ws", { websocket: true }, handleWSConnection);
}
