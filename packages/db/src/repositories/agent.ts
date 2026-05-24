import type { Agent, AgentProvider, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "../client";
import type { PrismaClient } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateAgentInput = {
  name: string;
  avatarUrl?: string | null;
  provider: AgentProvider;
  systemPrompt?: string | null;
  model?: string | null;
  config?: Prisma.InputJsonValue;
};

export type UpdateAgentInput = Partial<CreateAgentInput>;

export type ListAgentsOptions = {
  provider?: AgentProvider;
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listAgents(
  options: ListAgentsOptions = {},
  prisma: PrismaClient = defaultPrisma
): Promise<Agent[]> {
  return prisma.agent.findMany({
    where: options.provider ? { provider: options.provider } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function getAgent(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Agent | null> {
  return prisma.agent.findUnique({
    where: { id },
    include: { _count: { select: { contacts: true } } },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createAgent(
  data: CreateAgentInput,
  prisma: PrismaClient = defaultPrisma
): Promise<Agent> {
  return prisma.agent.create({ data });
}

export async function updateAgent(
  id: string,
  data: UpdateAgentInput,
  prisma: PrismaClient = defaultPrisma
): Promise<Agent> {
  return prisma.agent.update({ where: { id }, data });
}

export async function deleteAgent(
  id: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Agent> {
  return prisma.agent.delete({ where: { id } });
}
