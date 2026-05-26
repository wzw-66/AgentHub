import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { listAgents, createAgent as dbCreateAgent, getAgent } from "@agenthub/db";
import type { AgentProvider } from "@agenthub/shared";

// ─── Types ───────────────────────────────────────────────────────────────────

type CreateAgentBody = {
  name: string;
  provider: AgentProvider;
  avatarUrl?: string;
  systemPrompt?: string;
  model?: string;
};

type ListAgentsQuery = {
  provider?: AgentProvider;
};

// ─── Validation helpers ─────────────────────────────────────────────────────

const VALID_PROVIDERS: AgentProvider[] = ["Claude", "OpenCode", "Custom"];

function validateCreateAgent(body: unknown): body is CreateAgentBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.name === "string" &&
    b.name.length > 0 &&
    typeof b.provider === "string" &&
    VALID_PROVIDERS.includes(b.provider as AgentProvider)
  );
}

// ─── Route handlers ─────────────────────────────────────────────────────────

async function handleList(
  request: FastifyRequest<{ Querystring: ListAgentsQuery }>,
  reply: FastifyReply
): Promise<void> {
  const agents = await listAgents({ provider: request.query.provider });
  return reply.status(200).send(agents);
}

async function handleCreate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!validateCreateAgent(request.body)) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  const body = request.body as CreateAgentBody;
  const agent = await dbCreateAgent({
    name: body.name,
    provider: body.provider,
    avatarUrl: body.avatarUrl ?? null,
    systemPrompt: body.systemPrompt ?? null,
    model: body.model ?? null,
  });

  return reply.status(201).send(agent);
}

async function handleDetail(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const agent = await getAgent(request.params.id);

  if (!agent) {
    return reply.status(404).send({ error: "Agent not found" });
  }

  return reply.status(200).send(agent);
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/list", handleList);
  app.post("/create", handleCreate);
  app.get("/:id/detail", handleDetail);
}
