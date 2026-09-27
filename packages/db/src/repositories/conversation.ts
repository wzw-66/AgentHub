import type { Conversation, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "../client";
import type { PrismaClient } from "@prisma/client";
import { ConversationType, asStringArray } from "@agenthub/shared";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateConversationInput = {
  title: string;
  type: ConversationType;
  ownerId: string;
  contactIds?: string[];
  workspacePath?: string | null;
};

export type UpdateConversationInput = {
  title?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  lastActiveAt?: Date;
  workspacePath?: string | null;
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
      orderBy: [{ isPinned: "desc" }, { lastActiveAt: "desc" }],
      skip: offset,
      take: limit,
    }),
    prisma.conversation.count({ where }),
  ]);

  return { data, total };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function findSingleConversationByAgentId(
  userId: string,
  agentId: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Conversation | null> {
  // contactIds 在 SQLite 上是 Json 列，无法用 `has` 过滤，改为应用层筛选。
  // 单聊会话每个 agent 至多一条，且列表有 ownerId + type 索引，可接受。
  const conversations = await prisma.conversation.findMany({
    where: {
      ownerId: userId,
      type: ConversationType.Single,
      isArchived: false,
    },
    orderBy: { lastActiveAt: "desc" },
  });
  return conversations.find((c) => asStringArray(c.contactIds).includes(agentId)) ?? null;
}

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
      workspacePath: data.workspacePath ?? null,
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

export async function addConversationMembers(
  id: string,
  memberIds: string[],
  prisma: PrismaClient = defaultPrisma
): Promise<Conversation> {
  const existing = await prisma.conversation.findUnique({
    where: { id },
    select: { contactIds: true },
  });
  if (!existing) throw new Error(`Conversation ${id} not found`);

  const merged = [...new Set([...asStringArray(existing.contactIds), ...memberIds])];
  return prisma.conversation.update({
    where: { id },
    data: { contactIds: merged },
  });
}

export async function removeConversationMembers(
  id: string,
  memberIds: string[],
  prisma: PrismaClient = defaultPrisma
): Promise<Conversation> {
  const existing = await prisma.conversation.findUnique({
    where: { id },
    select: { contactIds: true },
  });
  if (!existing) throw new Error(`Conversation ${id} not found`);

  const removeSet = new Set(memberIds);
  const filtered = asStringArray(existing.contactIds).filter((id) => !removeSet.has(id));
  return prisma.conversation.update({
    where: { id },
    data: { contactIds: filtered },
  });
}
