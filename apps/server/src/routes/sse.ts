import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { verifyQueryToken } from "../middleware/jwt";
import { formatSSEEvent } from "../realtime/types";

// ─── SSE route params ────────────────────────────────────────────────

type SSEStreamParams = {
  conversationId: string;
};

type SSEStreamQuery = {
  token?: string;
};

// ─── Route handler ───────────────────────────────────────────────────

async function handleSSEStream(
  request: FastifyRequest<{
    Params: SSEStreamParams;
    Querystring: SSEStreamQuery;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const cm = request.server.connectionManager;
  const { conversationId } = request.params;

  // ─── Auth via query token ───────────────────────────────────────────

  const user = verifyQueryToken(request.query);
  if (!user) {
    return reply.status(401).send({ error: "invalid_token" });
  }

  // ─── SSE headers ───────────────────────────────────────────────────

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Register connection
  cm.addSSEConnection(conversationId, reply);

  // Send initial connected event
  reply.raw.write(formatSSEEvent("connected", { userId: user.userId }));

  // ─── Cleanup on disconnect ─────────────────────────────────────────

  request.raw.on("close", () => {
    cm.removeSSEConnection(conversationId, reply);
  });
}

// ─── Plugin ──────────────────────────────────────────────────────────

export async function sseRoutes(app: FastifyInstance): Promise<void> {
  app.get("/sse/conversations/:conversationId/stream", handleSSEStream);
}
