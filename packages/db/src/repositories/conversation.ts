import type { Conversation, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "../client";
import type { PrismaClient } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateConversationInput = {
  title: string;
  type: "Single" | "Group";
  ownerId: string;
  contactIds?: string[];
};

export type UpdateConversationInput = {
  title?: string;
  isArchived?: boolean;
  lastActiveAt?: Date;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
};

export type ListConversationsOptions = {
  offset?: number;
  limit?: number;
  includeArchived?: boolean;
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getConversation(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Conversation | null> {
  return prisma.conversation.findUnique({
    where: { id },
    include: {
      messages: {
        take: 50,
        orderBy: { createdAt: "desc" },
        include: { artifacts: true },
      },
    },
  });
}

export async function listConversations(
  userId: string,
  options: ListConversationsOptions = {},
  prisma: PrismaClient = defaultPrisma
): Promise<PaginatedResult<Conversation>> {
  const { offset = 0, limit = 20, includeArchived = false } = options;

  const where: Prisma.ConversationWhereInput = {
    ownerId: userId,
    ...(includeArchived ? {} : { isArchived: false }),
  };

  const [data, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { lastActiveAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.conversation.count({ where }),
  ]);

  return { data, total };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createConversation(
  data: CreateConversationInput,
  prisma: PrismaClient = defaultPrisma
): Promise<Conversation> {
  return prisma.conversation.create({
    data: {
      title: data.title,
      type: data.type,
      ownerId: data.ownerId,
      contactIds: data.contactIds ?? [],
    },
  });
}

export async function deleteConversation(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Conversation> {
  return prisma.conversation.delete({ where: { id } });
}

export async function updateConversation(
  id: string,
  data: UpdateConversationInput,
  prisma: PrismaClient = defaultPrisma
): Promise<Conversation> {
  return prisma.conversation.update({ where: { id }, data });
}
