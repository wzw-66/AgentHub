import type { UserCredential } from "@prisma/client";
import { prisma as defaultPrisma } from "../client";
import type { PrismaClient } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateCredentialInput = {
  userId: string;
  provider: string;
  encryptedKey: string;
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listCredentials(
  userId: string,
  prisma: PrismaClient = defaultPrisma
): Promise<UserCredential[]> {
  return prisma.userCredential.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCredential(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<UserCredential | null> {
  return prisma.userCredential.findUnique({ where: { id } });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createCredential(
  data: CreateCredentialInput,
  prisma: PrismaClient = defaultPrisma
): Promise<UserCredential> {
  return prisma.userCredential.create({ data });
}

export async function deleteCredential(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<UserCredential> {
  return prisma.userCredential.delete({ where: { id } });
}
