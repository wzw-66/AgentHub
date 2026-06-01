import type { User } from "@prisma/client";
import { prisma as defaultPrisma } from "../client";
import type { PrismaClient } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string | null;
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function findUserByEmail(
  email: string,
  prisma: PrismaClient = defaultPrisma
): Promise<User | null> {
  return prisma.user.findUnique({
    where: { email },
  });
}

export async function findUserById(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id },
  });
}

/**
 * Find a user by either email (exact) or name (exact match).
 * Name is not unique in the schema, so this returns the first match
 * when searching by name. Email takes priority in the search.
 */
export async function findUserByIdentifier(
  identifier: string,
  prisma: PrismaClient = defaultPrisma
): Promise<User | null> {
  // Try email first (it's unique)
  const byEmail = await prisma.user.findUnique({
    where: { email: identifier },
  });
  if (byEmail) return byEmail;

  // Fall back to name (first match)
  return prisma.user.findFirst({
    where: { name: identifier },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createUser(
  data: CreateUserInput,
  prisma: PrismaClient = defaultPrisma
): Promise<User> {
  return prisma.user.create({ data });
}
