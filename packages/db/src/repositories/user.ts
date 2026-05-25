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

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createUser(
  data: CreateUserInput,
  prisma: PrismaClient = defaultPrisma
): Promise<User> {
  return prisma.user.create({ data });
}
