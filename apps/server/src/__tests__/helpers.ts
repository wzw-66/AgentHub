import { buildApp } from "../app";
import { signAccessToken, signRefreshToken, generateJti } from "../utils/jwt";
import { createUser } from "@agenthub/db";
import { hashPassword } from "../utils/password";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/jwt";
import type { PrismaClient } from "@prisma/client";

// ─── Test app factory ───────────────────────────────────────────────────────

export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();

  // Add a protected test stub route for middleware testing
  app.get(
    "/api/protected-test",
    { preHandler: authenticate },
    async (request) => {
      return {
        message: "ok",
        userId: request.userId,
      };
    }
  );

  return app;
}

// ─── Test user factory ──────────────────────────────────────────────────────

export async function createTestUser(
  prisma: PrismaClient,
  email = "test.helper.auth@example.com",
  password = "testPassword123"
): Promise<{ id: string; name: string; email: string }> {
  const passwordHash = await hashPassword(password);
  const user = await createUser(
    {
      name: "Test Auth User",
      email,
      passwordHash,
    },
    prisma
  );
  return { id: user.id, name: user.name, email: user.email };
}

// ─── Token helpers ──────────────────────────────────────────────────────────

export function createTestAccessToken(userId: string): string {
  return signAccessToken({ userId });
}

export function createTestRefreshToken(userId: string): string {
  return signRefreshToken({ userId, jti: generateJti() });
}
