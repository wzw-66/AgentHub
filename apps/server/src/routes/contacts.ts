import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  listContacts,
  createContact as dbCreateContact,
  getContact,
  updateContact as dbUpdateContact,
  deleteContact as dbDeleteContact,
  findUserById,
} from "@agenthub/db";
import type { AgentProvider, HealthStatus } from "@agenthub/shared";
import { createAdapter } from "@agenthub/agent-core";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { SERVER_ROOT } from "../config/env.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Providers that depend on a local CLI binary. */
const CLI_PROVIDERS = new Set(["Claude", "OpenCode"]);

/** Timeout for CLI health check (ms). */
const CLI_HEALTH_CHECK_TIMEOUT_MS = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────

type CreateContactBody = {
  name: string;
  provider: AgentProvider;
  avatarUrl?: string;
  systemPrompt?: string;
  model?: string;
  displayName?: string;
  tags?: string[];
  isPinned?: boolean;
  config?: {
    providerName?: string;
    apiUrl?: string;
    apiKey?: string;
  };
};

type UpdateContactBody = {
  name?: string;
  displayName?: string;
  tags?: string[];
  isPinned?: boolean;
  systemPrompt?: string;
  model?: string;
};

type ListContactsQuery = {
  provider?: AgentProvider;
};

type ContactParams = {
  id: string;
};

// ─── Validation helpers ─────────────────────────────────────────────────────

const VALID_PROVIDERS = ["Claude", "OpenCode", "Custom"] as const;

function validateCreateContact(body: unknown): body is CreateContactBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.name === "string" &&
    b.name.length > 0 &&
    typeof b.provider === "string" &&
    VALID_PROVIDERS.includes(b.provider as AgentProvider)
  );
}

function validateUpdateContact(body: unknown): body is UpdateContactBody {
  if (!body || typeof body !== "object") return false;
  return true; // partial updates handled by Prisma
}

// ─── CLI Health Check ─────────────────────────────────────────────────────────

/**
 * Check if the CLI for a given provider is available.
 * Returns null if the provider doesn't require a CLI (e.g. Custom).
 */
async function checkCLIHealth(provider: string): Promise<{
  available: boolean;
  status?: string;
  message?: string;
} | null> {
  if (!CLI_PROVIDERS.has(provider)) return null;

  try {
    const adapter = createAdapter(provider, {});
    const result = await Promise.race([
      adapter.healthCheck(),
      new Promise<HealthStatus>((_, reject) =>
        setTimeout(() => reject(new Error("Health check timed out")), CLI_HEALTH_CHECK_TIMEOUT_MS),
      ),
    ]);

    return {
      available: result.status === "healthy",
      status: result.status,
      message: result.message,
    };
  } catch (err) {
    return {
      available: false,
      status: "unhealthy",
      message: err instanceof Error ? err.message : "Health check failed",
    };
  }
}

// ─── Route handlers ─────────────────────────────────────────────────────────

async function handleList(
  request: FastifyRequest<{ Querystring: ListContactsQuery }>,
  reply: FastifyReply
): Promise<void> {
  const contacts = await listContacts(request.userId!, { provider: request.query.provider });
  return reply.status(200).send(contacts);
}

async function handleCreate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!validateCreateContact(request.body)) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  const body = request.body as CreateContactBody;
  const userId = request.userId!;

  // Fetch user to get email for workspace path
  const user = await findUserById(userId);
  if (!user) {
    return reply.status(404).send({ error: "User not found" });
  }

  // Build workspace path
  const safeEmail = user.email.replace(/[^a-zA-Z0-9@._-]/g, "_");
  const safeName = body.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_");
  const workspacePath = `agent-workspace/${safeEmail}/${safeName}`;

  // Check CLI availability for Claude/OpenCode providers
  const cliHealth = await checkCLIHealth(body.provider);
  if (cliHealth && !cliHealth.available) {
    request.server.log.warn(
      { provider: body.provider, name: body.name, message: cliHealth.message },
      "CLI not available for agent",
    );
  }

  // Create workspace directory
  try {
    await mkdir(resolve(SERVER_ROOT, workspacePath), { recursive: true });
  } catch (err) {
    request.server.log.error({ err }, "Failed to create workspace directory");
    return reply.status(500).send({ error: "Failed to create workspace directory" });
  }

  const contact = await dbCreateContact({
    userId,
    name: body.name,
    provider: body.provider,
    avatarUrl: body.avatarUrl ?? null,
    systemPrompt: body.systemPrompt ?? null,
    model: body.model ?? null,
    workspacePath,
    displayName: body.displayName ?? body.name,
    tags: body.tags ?? [],
    isPinned: body.isPinned ?? false,
    config: (body.config ?? undefined) as any,
  });

  return reply.status(201).send({
    ...contact,
    ...(cliHealth ? { cliCheck: cliHealth } : {}),
  });
}

async function handleDetail(
  request: FastifyRequest<{ Params: ContactParams }>,
  reply: FastifyReply
): Promise<void> {
  const contact = await getContact(request.params.id);

  if (!contact) {
    return reply.status(404).send({ error: "Contact not found" });
  }

  return reply.status(200).send(contact);
}

async function handleUpdate(
  request: FastifyRequest<{ Params: ContactParams }>,
  reply: FastifyReply
): Promise<void> {
  const existing = await getContact(request.params.id);

  if (!existing) {
    return reply.status(404).send({ error: "Contact not found" });
  }

  if (existing.userId !== request.userId) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  if (!validateUpdateContact(request.body)) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  const body = request.body as UpdateContactBody;
  const contact = await dbUpdateContact(request.params.id, body);
  return reply.status(200).send(contact);
}

async function handleDelete(
  request: FastifyRequest<{ Params: ContactParams }>,
  reply: FastifyReply
): Promise<void> {
  const existing = await getContact(request.params.id);

  if (!existing) {
    return reply.status(404).send({ error: "Contact not found" });
  }

  if (existing.userId !== request.userId) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  await dbDeleteContact(request.params.id);
  return reply.status(204).send();
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.get("/list", handleList);
  app.post("/create", handleCreate);
  app.get("/:id/detail", handleDetail);
  app.patch("/:id/update", handleUpdate);
  app.delete("/:id/delete", handleDelete);
}
