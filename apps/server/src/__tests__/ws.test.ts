import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app";
import { ConnectionManager } from "../realtime/connection-manager";
import type { FastifyInstance } from "fastify";
import { signAccessToken } from "../utils/jwt";
import { WebSocket } from "ws";

describe("WebSocket Presence", () => {
  let app: FastifyInstance;
  let cm: ConnectionManager;
  let wsUrl: string;

  beforeAll(async () => {
    cm = new ConnectionManager();
    app = await buildApp(cm);
    const addr = await app.listen({ port: 0, host: "127.0.0.1" });
    wsUrl = addr.replace("http://", "ws://");
  });

  afterAll(async () => {
    await app.close();
  });

  /** Connect and wait until open */
  function wsConnect(token?: string): Promise<WebSocket> {
    const url = token ? `${wsUrl}/ws?token=${token}` : `${wsUrl}/ws`;
    return new Promise((resolve) => {
      const ws = new WebSocket(url);
      ws.on("open", () => resolve(ws));
    });
  }

  /** Wait for the next WS message matching a given type */
  function waitForMessage(
    ws: WebSocket,
    expectedType: string,
    timeoutMs = 3000,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${expectedType}`)), timeoutMs);
      const handler = (raw: Buffer): void => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === expectedType) {
            clearTimeout(timer);
            ws.off("message", handler);
            resolve(msg);
          }
        } catch {
          // ignore parse errors
        }
      };
      ws.on("message", handler);
    });
  }

  /** Wait for WS close event */
  function waitClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
    return new Promise((resolve) => {
      ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
    });
  }

  // ─── Auth tests ──────────────────────────────────────────────────────

  it("should reject connection without token", async () => {
    const ws = new WebSocket(`${wsUrl}/ws`);
    const { code, reason } = await waitClose(ws);
    expect(code).toBe(4001);
    expect(reason).toBe("invalid_token");
  });

  it("should reject connection with invalid token", async () => {
    const ws = new WebSocket(`${wsUrl}/ws?token=invalid`);
    const { code, reason } = await waitClose(ws);
    expect(code).toBe(4001);
    expect(reason).toBe("invalid_token");
  });

  it("should accept connection with valid token", async () => {
    const token = signAccessToken({ userId: "ws-test-user" });
    const ws = await wsConnect(token);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  // ─── Heartbeat tests ─────────────────────────────────────────────────

  it("should respond to ping with pong", async () => {
    const token = signAccessToken({ userId: "ping-user" });
    const ws = await wsConnect(token);

    const msgPromise = waitForMessage(ws, "pong");
    ws.send(JSON.stringify({ type: "ping" }));

    const msg = await msgPromise;
    expect(msg.type).toBe("pong");
    ws.close();
  });

  // ─── Typing indicator tests ──────────────────────────────────────────

  it("should broadcast typing indicator to other users", async () => {
    const token1 = signAccessToken({ userId: "typing-user-1" });
    const token2 = signAccessToken({ userId: "typing-user-2" });

    const ws1 = await wsConnect(token1);
    const ws2 = await wsConnect(token2);

    const received = waitForMessage(ws2, "typing:indicator");

    ws1.send(JSON.stringify({ type: "typing:start", payload: { conversationId: "conv-1" } }));

    const msg = await received;
    expect((msg.payload as Record<string, unknown>).userId).toBe("typing-user-1");
    expect((msg.payload as Record<string, unknown>).isTyping).toBe(true);

    ws1.close();
    ws2.close();
  });

  // ─── Online status tests ─────────────────────────────────────────────

  it("should broadcast online status when user connects", async () => {
    const token1 = signAccessToken({ userId: "status-online-1" });
    const token2 = signAccessToken({ userId: "status-online-2" });

    const ws1 = await wsConnect(token1);

    // Collect all messages ws1 receives
    const messages: Record<string, unknown>[] = [];
    ws1.on("message", (data) => messages.push(JSON.parse(data.toString())));

    const ws2 = await wsConnect(token2);
    // Wait a tick to let messages arrive
    await new Promise((r) => setTimeout(r, 100));

    // Should have received an online status for status-online-2
    const onlineMsg = messages.find(
      (m) =>
        m.type === "status:update" &&
        (m.payload as Record<string, unknown>).status === "online",
    );
    expect(onlineMsg).toBeDefined();
    expect((onlineMsg!.payload as Record<string, unknown>).userId).toBe("status-online-2");

    ws1.close();
    ws2.close();
  });
});
