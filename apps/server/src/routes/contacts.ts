import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  listContacts,
  createContact as dbCreateContact,
  getContact,
  getAgent,
  updateContact as dbUpdateContact,
  deleteContact as dbDeleteContact,
} from "@agenthub/db";

// ─── Types ───────────────────────────────────────────────────────────────────

type CreateContactBody = {
  agentId: string;
  displayName?: string;
  tags?: string[];
};

type UpdateContactBody = {
  displayName?: string;
  tags?: string[];
  isPinned?: boolean;
};

type ContactParams = {
  id: string;
};

// ─── Validation helpers ─────────────────────────────────────────────────────

function validateCreateContact(body: unknown): body is CreateContactBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return typeof b.agentId === "string" && b.agentId.length > 0;
}

function validateUpdateContact(body: unknown): body is UpdateContactBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    b.displayName === undefined ||
    b.tags === undefined ||
    b.isPinned === undefined ||
    typeof b.displayName === "string" ||
    Array.isArray(b.tags) ||
    typeof b.isPinned === "boolean"
  );
}

// ─── Route handlers ─────────────────────────────────────────────────────────

async function handleList(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const contacts = await listContacts(request.userId!);
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
  // Fetch agent to use its name as default displayName
  const agent = await getAgent(body.agentId);

  const contact = await dbCreateContact({
    userId: request.userId!,
    agentId: body.agentId,
    displayName: body.displayName ?? agent?.name ?? "Unknown Agent",
    tags: body.tags ?? [],
  });

  return reply.status(201).send(contact);
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
  app.patch("/:id/update", handleUpdate);
  app.delete("/:id/delete", handleDelete);
}
