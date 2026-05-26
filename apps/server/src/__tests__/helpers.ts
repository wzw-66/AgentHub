import { buildApp } from "../app";
import { signAccessToken, signRefreshToken, generateJti } from "../utils/jwt";
import {
  createUser,
  createAgent as dbCreateAgent,
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

export async function createTestAgent(
  prisma: PrismaClient,
  overrides: { name?: string; provider?: string } = {}
): Promise<{ id: string; name: string; provider: string }> {
  return dbCreateAgent(
    {
      name: overrides.name ?? "Test Agent",
      provider: (overrides.provider ?? "Claude") as any,
    },
    prisma
  );
}

export async function createTestContact(
  prisma: PrismaClient,
  userId: string,
  agentId: string,
  overrides: { displayName?: string } = {}
) {
  return dbCreateContact(
    {
      userId,
      agentId,
      displayName: overrides.displayName ?? "Test Contact",
    },
    prisma
  );
}

export async function createTestConversation(
  prisma: PrismaClient,
  userId: string,
  overrides: { title?: string; type?: "Single" | "Group" } = {}
) {
  return dbCreateConversation(
    {
      title: overrides.title ?? "Test Conversation",
      type: overrides.type ?? "Single",
      ownerId: userId,
    },
    prisma
  );
}
