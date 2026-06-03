import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type { ConnectionManager } from "./realtime/connection-manager";
import { authRoutes } from "./routes/auth";
import { contactRoutes } from "./routes/contacts";
import { conversationRoutes } from "./routes/conversations";
import { messageRoutes } from "./routes/messages";
import { artifactRoutes } from "./routes/artifacts";
import { credentialRoutes } from "./routes/credentials";
import { marketRoutes } from "./routes/market";
import { sseRoutes } from "./routes/sse";
import { wsRoutes } from "./routes/ws";
import { authenticate } from "./middleware/jwt";

declare module "fastify" {
  interface FastifyInstance {
    connectionManager: ConnectionManager;
  }
}

export async function buildApp(connectionManager?: ConnectionManager): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: "info",
    },
  });

  // ─── Plugins ────────────────────────────────────────────────────────────────

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(websocket);

  // Make connectionManager available to route modules
  if (connectionManager) {
    app.decorate("connectionManager", connectionManager);
  }

  // ─── Global error handler ──────────────────────────────────────────────────

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const message = statusCode === 500 ? "Internal Server Error" : error.message;

    if (statusCode === 500) {
      app.log.error(error);
    }

    return reply.status(statusCode).send({
      error: message,
      statusCode,
    });
  });

  // ─── Public routes ─────────────────────────────────────────────────────────

  await app.register(authRoutes, { prefix: "/auth" });

  // ─── Protected routes ──────────────────────────────────────────────────────

  await app.register(async function (protectedApp) {
    protectedApp.addHook("preHandler", authenticate);

    await protectedApp.register(contactRoutes, { prefix: "/api/contacts" });
    await protectedApp.register(conversationRoutes, { prefix: "/api/conversations" });
    await protectedApp.register(messageRoutes, { prefix: "/api/conversations/:conversationId/messages" });
    await protectedApp.register(artifactRoutes, { prefix: "/api/artifacts" });
    await protectedApp.register(credentialRoutes, { prefix: "/api/credentials" });
    await protectedApp.register(marketRoutes, { prefix: "/api/market" });
  });

  // ─── Health check ──────────────────────────────────────────────────────────

  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // ─── Real-time routes (SSE + WebSocket) ─────────────────────────────────

  await app.register(sseRoutes);
  await app.register(wsRoutes);

  return app;
}
