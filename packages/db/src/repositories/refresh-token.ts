import type { RefreshToken } from "@prisma/client";
import { prisma as defaultPrisma } from "../client";
import type { PrismaClient } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateRefreshTokenInput = {
  token: string;
  userId: string;
  expiresAt: Date;
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function findRefreshTokenByToken(
  token: string,
  prisma: PrismaClient = defaultPrisma
): Promise<RefreshToken | null> {
  return prisma.refreshToken.findUnique({
    where: { token },
  });
}

export async function findValidRefreshTokenByToken(
  token: string,
  prisma: PrismaClient = defaultPrisma
): Promise<RefreshToken | null> {
  return prisma.refreshToken.findFirst({
    where: {
      token,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createRefreshToken(
  data: CreateRefreshTokenInput,
  prisma: PrismaClient = defaultPrisma
): Promise<RefreshToken> {
  return prisma.refreshToken.create({ data });
}

export async function revokeRefreshToken(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<RefreshToken> {
  return prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

export async function revokeRefreshTokenByToken(
  token: string,
  prisma: PrismaClient = defaultPrisma
): Promise<RefreshToken | null> {
  const found = await prisma.refreshToken.findUnique({ where: { token } });
  if (!found) return null;
  return prisma.refreshToken.update({
    where: { id: found.id },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserRefreshTokens(
  userId: string,
  prisma: PrismaClient = defaultPrisma
): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function cleanupExpiredRefreshTokens(
  prisma: PrismaClient = defaultPrisma
): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
