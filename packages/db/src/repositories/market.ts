import type { PublishedAgent, AgentProvider, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "../client";
import type { PrismaClient } from "@prisma/client";
import { asStringArray } from "@agenthub/shared";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreatePublishedAgentInput = {
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  provider: AgentProvider;
  systemPrompt?: string | null;
  model?: string | null;
  config?: Prisma.InputJsonValue;
  tags?: string[];
  creatorId: string;
  sourceContactId?: string | null;
};

export type UpdatePublishedAgentInput = {
  description?: string | null;
  tags?: string[];
};

export type ListMarketOptions = {
  q?: string;
  provider?: AgentProvider;
  tag?: string;
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listPublishedAgents(
  options: ListMarketOptions = {},
  prisma: PrismaClient = defaultPrisma
): Promise<PublishedAgent[]> {
  const where: Prisma.PublishedAgentWhereInput = {};

  if (options.q) {
    // 不用 mode: "insensitive" —— 那是 PostgreSQL/MongoDB 专属参数，SQLite 上会
    // 抛 `Unknown argument 'mode'`。SQLite 的 LIKE 对 ASCII 默认不区分大小写。
    where.name = { contains: options.q };
  }
  if (options.provider) {
    where.provider = options.provider;
  }

  const rows = await prisma.publishedAgent.findMany({
    where,
    orderBy: [{ importCount: "desc" }, { createdAt: "desc" }],
    include: { creator: { select: { name: true } } },
  });

  // tags 在 SQLite 上是 Json 列，Prisma 无数组成员过滤能力（array_contains /
  // has / string_contains 实测均不可用），只能取回后在应用层过滤。
  // 本函数无分页，数据量小，可接受。
  if (options.tag) {
    const tag = options.tag;
    return rows.filter((row) => asStringArray(row.tags).includes(tag));
  }

  return rows;
}

export async function getPublishedAgent(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<PublishedAgent | null> {
  return prisma.publishedAgent.findUnique({
    where: { id },
    include: { creator: { select: { name: true } } },
  });
}

export async function findPublishedByContactId(
  contactId: string,
  prisma: PrismaClient = defaultPrisma
): Promise<PublishedAgent | null> {
  return prisma.publishedAgent.findFirst({
    where: { sourceContactId: contactId },
    include: { creator: { select: { name: true } } },
  });
}

export async function listMyPublishedAgents(
  creatorId: string,
  prisma: PrismaClient = defaultPrisma
): Promise<PublishedAgent[]> {
  return prisma.publishedAgent.findMany({
    where: { creatorId },
    orderBy: [{ createdAt: "desc" }],
    include: { creator: { select: { name: true } } },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createPublishedAgent(
  data: CreatePublishedAgentInput,
  prisma: PrismaClient = defaultPrisma
): Promise<PublishedAgent> {
  return prisma.publishedAgent.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      avatarUrl: data.avatarUrl ?? null,
      provider: data.provider,
      systemPrompt: data.systemPrompt ?? null,
      model: data.model ?? null,
      config: data.config ?? undefined,
      tags: data.tags ?? [],
      creatorId: data.creatorId,
      sourceContactId: data.sourceContactId ?? null,
    },
  });
}

export async function updatePublishedAgent(
  id: string,
  data: UpdatePublishedAgentInput,
  prisma: PrismaClient = defaultPrisma
): Promise<PublishedAgent> {
  return prisma.publishedAgent.update({ where: { id }, data });
}

export async function deletePublishedAgent(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<PublishedAgent> {
  return prisma.publishedAgent.delete({ where: { id } });
}

export async function incrementImportCount(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<PublishedAgent> {
  return prisma.publishedAgent.update({
    where: { id },
    data: { importCount: { increment: 1 } },
  });
}
