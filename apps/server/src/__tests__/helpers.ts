import { buildApp } from "../app";
import { signAccessToken, signRefreshToken, generateJti } from "../utils/jwt";
import {
  createUser,
  createContact as dbCreateContact,
  createConversation as dbCreateConversation,
} from "@agenthub/db";
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

export function getAuthHeader(userId: string): { authorization: string } {
  return { authorization: `Bearer ${createTestAccessToken(userId)}` };
}

// ─── Resource factories ─────────────────────────────────────────────────────

export async function createTestContact(
  prisma: PrismaClient,
  overrides: { name?: string; provider?: string; userId?: string } = {}
): Promise<{ id: string; name: string; provider: string; userId: string }> {
  const contact = await dbCreateContact(
    {
      userId: overrides.userId!,
      name: overrides.name ?? "Test Contact",
      provider: (overrides.provider ?? "Claude") as any,
    },
    prisma
  );
  return { id: contact.id, name: contact.name, provider: contact.provider, userId: contact.userId };
}

export async function createTestConversation(
  prisma: PrismaClient,
  userId: string,
  overrides: { title?: string; type?: "single" | "group" } = {}
) {
  return dbCreateConversation(
    {
      title: overrides.title ?? "Test Conversation",
      type: overrides.type ?? "single",
      ownerId: userId,
    },
    prisma
  );
}
