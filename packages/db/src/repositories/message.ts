import type { Message, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "../client";
import type { PrismaClient } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateMessageInput = {
  conversationId: string;
  senderType: "User" | "Contact" | "System";
  senderId: string;
  type: "Text" | "Code" | "Diff" | "Preview" | "Artifact";
  content: string;
  parentId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type CursorPaginatedResult<T> = {
  data: T[];
  nextCursor: string | null;
};

export type ListMessagesOptions = {
  cursor?: string;
  limit?: number;
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getMessage(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Message | null> {
  return prisma.message.findUnique({
    where: { id },
    include: { artifacts: true },
  });
}

export async function listMessages(
  conversationId: string,
  options: ListMessagesOptions = {},
  prisma: PrismaClient = defaultPrisma
): Promise<CursorPaginatedResult<Message>> {
  const { cursor, limit = 50 } = options;

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = messages.length > limit;
  const data = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

  return { data, nextCursor };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createMessage(
  data: CreateMessageInput,
  prisma: PrismaClient = defaultPrisma
): Promise<Message> {
  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({ data });
    await tx.conversation.update({
      where: { id: data.conversationId },
      data: { lastActiveAt: new Date() },
    });
    return message;
  }) as Promise<Message>;
}

export async function pinMessage(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Message> {
  const message = await prisma.message.findUniqueOrThrow({ where: { id } });
  return prisma.message.update({
    where: { id },
    data: { isPinned: !message.isPinned },
  });
}

export type UpdateMessageInput = {
  content?: string;
};

export async function updateMessage(
  id: string,
  data: UpdateMessageInput,
  prisma: PrismaClient = defaultPrisma
): Promise<Message> {
  return prisma.message.update({ where: { id }, data });
}

export async function deleteMessage(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Message> {
  return prisma.message.delete({ where: { id } });
}

/**
 * Delete all messages in a conversation created after a given timestamp.
 * Also deletes associated artifacts. Returns the IDs of deleted messages.
 */
export async function deleteMessagesAfter(
  conversationId: string,
  afterCreatedAt: Date | string,
  prisma: PrismaClient = defaultPrisma
): Promise<string[]> {
  const targetDate =
    typeof afterCreatedAt === "string" ? new Date(afterCreatedAt) : afterCreatedAt;

  const messagesToDelete = await prisma.message.findMany({
    where: {
      conversationId,
      createdAt: { gt: targetDate },
    },
    select: { id: true },
  });

  const ids = messagesToDelete.map((m) => m.id);
  if (ids.length === 0) return [];

  // Delete artifacts first (deleteMany doesn't cascade in Prisma mode)
  await prisma.artifact.deleteMany({
    where: { messageId: { in: ids } },
  });

  // Delete messages
  await prisma.message.deleteMany({
    where: { id: { in: ids } },
  });

  return ids;
}

export async function listPinnedMessages(
  conversationId: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Message[]> {
  return prisma.message.findMany({
    where: { conversationId, isPinned: true },
    orderBy: { createdAt: "desc" },
  });
}
