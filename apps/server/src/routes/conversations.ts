import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  listConversations,
  getConversation,
  createConversation as dbCreateConversation,
  updateConversation as dbUpdateConversation,
  deleteConversation as dbDeleteConversation,
} from "@agenthub/db";

// ─── Types ───────────────────────────────────────────────────────────────────

type CreateConversationBody = {
  title: string;
  type: "Single" | "Group";
  contactIds?: string[];
};

type UpdateConversationBody = {
  title?: string;
  isArchived?: boolean;
};

type ConversationParams = {
  id: string;
};

type ListConversationsQuery = {
  offset?: string;
  limit?: string;
  includeArchived?: string;
};

// ─── Validation helpers ─────────────────────────────────────────────────────

function validateCreateConversation(body: unknown): body is CreateConversationBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.title === "string" &&
    b.title.length > 0 &&
    (b.type === "Single" || b.type === "Group")
  );
}

// ─── Route handlers ─────────────────────────────────────────────────────────

async function handleList(
  request: FastifyRequest<{ Querystring: ListConversationsQuery }>,
  reply: FastifyReply
): Promise<void> {
  const offset = parseInt(request.query.offset ?? "0", 10);
  const limit = parseInt(request.query.limit ?? "20", 10);
  const includeArchived = request.query.includeArchived === "true";

  const result = await listConversations(request.userId!, {
    offset,
    limit,
    includeArchived,
  });

  return reply.status(200).send(result);
}

async function handleCreate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!validateCreateConversation(request.body)) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  const body = request.body as CreateConversationBody;
  const conversation = await dbCreateConversation({
    title: body.title,
    type: body.type,
    ownerId: request.userId!,
    contactIds: body.contactIds ?? [],
  });

  return reply.status(201).send(conversation);
}

async function handleDetail(
  request: FastifyRequest<{ Params: ConversationParams }>,
  reply: FastifyReply
): Promise<void> {
  const conversation = await getConversation(request.params.id);

  if (!conversation) {
    return reply.status(404).send({ error: "Conversation not found" });
  }

  return reply.status(200).send(conversation);
}

async function handleUpdate(
  request: FastifyRequest<{ Params: ConversationParams }>,
  reply: FastifyReply
): Promise<void> {
  const existing = await getConversation(request.params.id);

  if (!existing) {
    return reply.status(404).send({ error: "Conversation not found" });
  }

  const body = request.body as UpdateConversationBody;
  const conversation = await dbUpdateConversation(request.params.id, body);
  return reply.status(200).send(conversation);
}

async function handleDelete(
  request: FastifyRequest<{ Params: ConversationParams }>,
  reply: FastifyReply
): Promise<void> {
  const existing = await getConversation(request.params.id);

  if (!existing) {
    return reply.status(404).send({ error: "Conversation not found" });
  }

  await dbDeleteConversation(request.params.id);
  return reply.status(204).send();
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/list", handleList);
  app.post("/create", handleCreate);
  app.get("/:id/detail", handleDetail);
  app.patch("/:id/update", handleUpdate);
  app.delete("/:id/delete", handleDelete);
}
