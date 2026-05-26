import type { FastifyReply } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { formatWSMessage } from "./types";

/**
 * Manages all active SSE and WebSocket connections.
 *
 * SSE connections are keyed by conversationId (multiple clients per conversation).
 * WebSocket connections are keyed by userId (multiple devices per user).
 */
export class ConnectionManager {
  // ─── SSE connections ─────────────────────────────────────────────────

  private sseConnections = new Map<string, Set<FastifyReply>>();

  addSSEConnection(conversationId: string, reply: FastifyReply): void {
    let connections = this.sseConnections.get(conversationId);
    if (!connections) {
      connections = new Set();
      this.sseConnections.set(conversationId, connections);
    }
    connections.add(reply);
  }

  removeSSEConnection(conversationId: string, reply: FastifyReply): void {
    const connections = this.sseConnections.get(conversationId);
    if (!connections) return;
    connections.delete(reply);
    if (connections.size === 0) {
      this.sseConnections.delete(conversationId);
    }
  }

  pushToConversation(conversationId: string, event: string, data: unknown): void {
    const connections = this.sseConnections.get(conversationId);
    if (!connections) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const reply of connections) {
      try {
        reply.raw.write(payload);
      } catch {
        // Client likely disconnected, clean up
        this.removeSSEConnection(conversationId, reply);
      }
    }
  }

  // ─── WebSocket connections ───────────────────────────────────────────

  private wsConnections = new Map<string, Set<WebSocket>>();

  addWSConnection(userId: string, socket: WebSocket): void {
    let connections = this.wsConnections.get(userId);
    if (!connections) {
      connections = new Set();
      this.wsConnections.set(userId, connections);
    }
    connections.add(socket);
  }

  removeWSConnection(userId: string, socket: WebSocket): void {
    const connections = this.wsConnections.get(userId);
    if (!connections) return;
    connections.delete(socket);
    if (connections.size === 0) {
      this.wsConnections.delete(userId);
    }
  }

  broadcastToConversation(
    userIds: string[],
    type: string,
    payload: unknown,
    excludeUserId?: string,
  ): void {
    const message = formatWSMessage(type, payload);
    for (const userId of userIds) {
      if (userId === excludeUserId) continue;
      this.broadcastToUser(userId, message);
    }
  }

  broadcastToUser(userId: string, message: string): void {
    const connections = this.wsConnections.get(userId);
    if (!connections) return;
    for (const socket of connections) {
      try {
        socket.send(message);
      } catch {
        this.removeWSConnection(userId, socket);
      }
    }
  }

  /** Get all conversation members' userIds for a given user's connections */
  getConnectedUserIds(): string[] {
    return Array.from(this.wsConnections.keys());
  }

  hasSSEConnections(conversationId: string): boolean {
    const connections = this.sseConnections.get(conversationId);
    return connections !== undefined && connections.size > 0;
  }
}
