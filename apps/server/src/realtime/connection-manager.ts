import type { FastifyReply } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type { AgentAdapter } from "@agenthub/shared";
import { formatWSMessage } from "./types";

// ─── Types ─────────────────────────────────────────────────────────────

interface PendingInteraction {
  resolve: (value: string) => void;
  reject: (err: Error) => void;
  prompt: string;
  options?: { label: string; description: string }[];
  timer: NodeJS.Timeout;
}

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

  // ─── Active adapter tracking ─────────────────────────────────────────

  private activeAdapters = new Map<string, AgentAdapter>();

  /** Register an active adapter for abort-on-disconnect. */
  registerAdapter(conversationId: string, adapter: AgentAdapter): void {
    this.activeAdapters.set(conversationId, adapter);
  }

  /** Abort and clean up all adapters for a conversation. */
  abortAdapters(conversationId: string): void {
    const adapter = this.activeAdapters.get(conversationId);
    if (adapter) {
      try {
        adapter.abort();
      } catch {
        // Adapter may already be done
      }
      this.activeAdapters.delete(conversationId);
    }
  }

  /** Remove an adapter when it completes normally. */
  removeAdapter(conversationId: string): void {
    this.activeAdapters.delete(conversationId);
  }

  // ─── Pending interaction tracking ────────────────────────────────

  private pendingInteractions = new Map<string, PendingInteraction>();

  /** Default interaction timeout: 120 seconds */
  private static readonly INTERACTION_TIMEOUT_MS = 120_000;

  /**
   * Create a pending interaction request for a conversation.
   * Returns a Promise that resolves when the user responds, or rejects on timeout.
   * Pushes the interactive prompt to both SSE and WebSocket clients.
   */
  createInteraction(
    convId: string,
    data: { prompt: string; toolUseId: string; options?: { label: string; description: string }[]; multiSelect?: boolean },
  ): Promise<string> {
    // Push interactive event to frontend
    const eventData = {
      type: "interactive",
      toolUseId: data.toolUseId,
      prompt: data.prompt,
      options: data.options,
      multiSelect: data.multiSelect,
      agentId: "agent",
    };
    this.pushToConversation(convId, "interactive", eventData);
    this.broadcastToConversation(this.getConnectedUserIds(), "interactive", eventData);

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingInteractions.delete(convId);
        reject(new Error("Interaction timeout"));
      }, ConnectionManager.INTERACTION_TIMEOUT_MS);
      this.pendingInteractions.set(convId, { resolve, reject, prompt: data.prompt, options: data.options, timer });
    });
  }

  /** Resolve a pending interaction with the user's response text. */
  resolveInteraction(convId: string, response: string): boolean {
    const p = this.pendingInteractions.get(convId);
    if (!p) return false;
    clearTimeout(p.timer);
    p.resolve(response);
    this.pendingInteractions.delete(convId);
    return true;
  }

  /** Cancel a pending interaction, rejecting with an error. */
  cancelInteraction(convId: string): boolean {
    const p = this.pendingInteractions.get(convId);
    if (!p) return false;
    clearTimeout(p.timer);
    p.reject(new Error("Interaction cancelled"));
    this.pendingInteractions.delete(convId);
    return true;
  }
}
