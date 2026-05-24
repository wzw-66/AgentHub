import type { Contact } from "@prisma/client";
import { prisma as defaultPrisma } from "../client";
import type { PrismaClient } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateContactInput = {
  userId: string;
  agentId: string;
  displayName: string;
  tags?: string[];
  isPinned?: boolean;
};

export type UpdateContactInput = {
  displayName?: string;
  tags?: string[];
  isPinned?: boolean;
};

export type ContactWithAgent = Contact & {
  agent: { id: string; name: string; avatarUrl: string | null; provider: string };
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listContacts(
  userId: string,
  prisma: PrismaClient = defaultPrisma
): Promise<ContactWithAgent[]> {
  return prisma.contact.findMany({
    where: { userId },
    include: {
      agent: {
        select: { id: true, name: true, avatarUrl: true, provider: true },
      },
    },
    orderBy: [{ isPinned: "desc" }, { displayName: "asc" }],
  }) as Promise<ContactWithAgent[]>;
}

export async function getContact(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<ContactWithAgent | null> {
  return prisma.contact.findUnique({
    where: { id },
    include: {
      agent: {
        select: { id: true, name: true, avatarUrl: true, provider: true },
      },
    },
  }) as Promise<ContactWithAgent | null>;
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createContact(
  data: CreateContactInput,
  prisma: PrismaClient = defaultPrisma
): Promise<Contact> {
  return prisma.contact.create({
    data: {
      userId: data.userId,
      agentId: data.agentId,
      displayName: data.displayName,
      tags: data.tags ?? [],
      isPinned: data.isPinned ?? false,
    },
  });
}

export async function updateContact(
  id: string,
  data: UpdateContactInput,
  prisma: PrismaClient = defaultPrisma
): Promise<Contact> {
  return prisma.contact.update({ where: { id }, data });
}

export async function deleteContact(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Contact> {
  return prisma.contact.delete({ where: { id } });
}
