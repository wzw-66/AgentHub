import type { Contact, AgentProvider, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "../client";
import type { PrismaClient } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateContactInput = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  provider: AgentProvider;
  systemPrompt?: string | null;
  model?: string | null;
  workspacePath?: string | null;
  config?: Prisma.InputJsonValue;
  displayName?: string;
  tags?: string[];
  isPinned?: boolean;
};

export type UpdateContactInput = {
  name?: string;
  avatarUrl?: string | null;
  provider?: AgentProvider;
  systemPrompt?: string | null;
  model?: string | null;
  workspacePath?: string | null;
  config?: Prisma.InputJsonValue;
  displayName?: string;
  tags?: string[];
  isPinned?: boolean;
};

export type ListContactsOptions = {
  provider?: AgentProvider;
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listContacts(
  userId: string,
  options: ListContactsOptions = {},
  prisma: PrismaClient = defaultPrisma
): Promise<Contact[]> {
  return prisma.contact.findMany({
    where: {
      userId,
      ...(options.provider ? { provider: options.provider } : {}),
    },
    orderBy: [{ isPinned: "desc" }, { name: "asc" }],
  });
}

export async function getContact(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Contact | null> {
  return prisma.contact.findUnique({ where: { id } });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createContact(
  data: CreateContactInput,
  prisma: PrismaClient = defaultPrisma
): Promise<Contact> {
  return prisma.contact.create({
    data: {
      userId: data.userId,
      name: data.name,
      avatarUrl: data.avatarUrl ?? null,
      provider: data.provider,
      systemPrompt: data.systemPrompt ?? null,
      model: data.model ?? null,
      workspacePath: data.workspacePath ?? null,
      config: data.config ?? undefined,
      displayName: data.displayName ?? null,
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
