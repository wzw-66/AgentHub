import type { Artifact } from "@prisma/client";
import { prisma as defaultPrisma } from "../client";
import type { PrismaClient } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateArtifactInput = {
  messageId: string;
  type: "CodeDiff" | "WebPreview" | "Document";
  url?: string | null;
  content?: string | null;
  previewUrl?: string | null;
  status?: "Building" | "Completed" | "Failed";
};

export type UpdateArtifactInput = {
  url?: string | null;
  content?: string | null;
  previewUrl?: string | null;
  status?: "Building" | "Completed" | "Failed";
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listArtifacts(
  messageId: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Artifact[]> {
  return prisma.artifact.findMany({
    where: { messageId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getArtifact(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Artifact | null> {
  return prisma.artifact.findUnique({ where: { id } });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createArtifact(
  data: CreateArtifactInput,
  prisma: PrismaClient = defaultPrisma
): Promise<Artifact> {
  return prisma.artifact.create({ data });
}

export async function updateArtifact(
  id: string,
  data: UpdateArtifactInput,
  prisma: PrismaClient = defaultPrisma
): Promise<Artifact> {
  return prisma.artifact.update({ where: { id }, data });
}
