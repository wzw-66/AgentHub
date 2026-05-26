import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app";
import { ConnectionManager } from "../realtime/connection-manager";
import type { FastifyInstance } from "fastify";
import { signAccessToken } from "../utils/jwt";
import { formatSSEEvent } from "../realtime/types";

describe("SSE Stream", () => {
  let app: FastifyInstance;
  let cm: ConnectionManager;

  beforeAll(async () => {
    cm = new ConnectionManager();
    app = await buildApp(cm);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Auth tests (inject-based) ──────────────────────────────────────

  it("should return 401 without token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/sse/conversations/test-conv/stream",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("invalid_token");
  });

  it("should return 401 with invalid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/sse/conversations/test-conv/stream?token=invalid",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("invalid_token");
  });

  // ─── SSE format unit tests ─────────────────────────────────────────

  it("should format SSE events correctly", () => {
    const result = formatSSEEvent("chunk", { type: "text", content: "hello", timestamp: "t1" });
    expect(result).toContain("event: chunk");
    expect(result).toContain("data: ");
    expect(result).toContain('"content":"hello"');
    expect(result).toContain("\n\n");
  });

  // ─── ConnectionManager SSE unit tests ──────────────────────────────

  it("should register and unregister SSE connections", () => {
    const convId = "test-conv-unit";
    expect(cm.hasSSEConnections(convId)).toBe(false);

    const mockReply = { raw: { write: () => {} } } as any;
    cm.addSSEConnection(convId, mockReply);
    expect(cm.hasSSEConnections(convId)).toBe(true);

    cm.removeSSEConnection(convId, mockReply);
    expect(cm.hasSSEConnections(convId)).toBe(false);
  });

  it("should push data to registered SSE connections", () => {
    const convId = "push-conv";
    const written: string[] = [];
    const mockReply = { raw: { write: (s: string) => written.push(s) } } as any;

    cm.addSSEConnection(convId, mockReply);
    cm.pushToConversation(convId, "test", { hello: "world" });

    expect(written.length).toBe(1);
    expect(written[0]).toContain("event: test");
    expect(written[0]).toContain('"hello":"world"');
  });
});
