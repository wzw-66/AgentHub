import Fastify from "fastify";
import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { authRoutes } from "./routes/auth";

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

  // ─── Routes ────────────────────────────────────────────────────────────────

  await app.register(authRoutes, { prefix: "/auth" });

  // ─── Health check ──────────────────────────────────────────────────────────

  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  return app;
}
