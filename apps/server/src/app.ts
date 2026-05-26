import Fastify from "fastify";
import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { authRoutes } from "./routes/auth";
import { agentRoutes } from "./routes/agents";
import { contactRoutes } from "./routes/contacts";
import { conversationRoutes } from "./routes/conversations";
import { messageRoutes } from "./routes/messages";
import { artifactRoutes } from "./routes/artifacts";
import { credentialRoutes } from "./routes/credentials";
import { authenticate } from "./middleware/jwt";

export async function buildApp(): Promise<FastifyInstance> {
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

    await protectedApp.register(agentRoutes, { prefix: "/api/agents" });
    await protectedApp.register(contactRoutes, { prefix: "/api/contacts" });
    await protectedApp.register(conversationRoutes, { prefix: "/api/conversations" });
    await protectedApp.register(messageRoutes, { prefix: "/api/conversations/:conversationId/messages" });
    await protectedApp.register(artifactRoutes, { prefix: "/api/artifacts" });
    await protectedApp.register(credentialRoutes, { prefix: "/api/credentials" });
  });

  // ─── Health check ──────────────────────────────────────────────────────────

  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  return app;
}
