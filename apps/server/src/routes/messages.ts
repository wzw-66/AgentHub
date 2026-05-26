import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  listMessages,
  createMessage as dbCreateMessage,
  getMessage,
  pinMessage as dbPinMessage,
} from "@agenthub/db";

// ─── Types ───────────────────────────────────────────────────────────────────

type CreateMessageBody = {
  content: string;
  type?: "Text" | "Code" | "Diff" | "Preview" | "Artifact";
  parentId?: string;
};

type ListMessagesQuery = {
  cursor?: string;
  limit?: string;
};

type MessageRouteParams = {
  conversationId: string;
};

type PinRouteParams = {
  conversationId: string;
  messageId: string;
};

// ─── Validation helpers ─────────────────────────────────────────────────────

const VALID_MESSAGE_TYPES = ["Text", "Code", "Diff", "Preview", "Artifact"];

function validateCreateMessage(body: unknown): body is CreateMessageBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.content === "string" &&
    b.content.length > 0 &&
    (b.type === undefined || VALID_MESSAGE_TYPES.includes(b.type as string))
  );
}

// ─── Route handlers ─────────────────────────────────────────────────────────

async function handleList(
  request: FastifyRequest<{
    Params: MessageRouteParams;
    Querystring: ListMessagesQuery;
  }>,
  reply: FastifyReply
): Promise<void> {
  const cursor = parseInt(request.query.cursor ?? "0", 10) > 0
    ? request.query.cursor
    : request.query.cursor;

  const limit = parseInt(request.query.limit ?? "50", 10);

  const result = await listMessages(request.params.conversationId, {
    cursor: cursor || undefined,
    limit,
  });

  return reply.status(200).send(result);
}

async function handleCreate(
  request: FastifyRequest<{ Params: MessageRouteParams }>,
  reply: FastifyReply
): Promise<void> {
  if (!validateCreateMessage(request.body)) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  const body = request.body as CreateMessageBody;
  const message = await dbCreateMessage({
    conversationId: request.params.conversationId,
    senderType: "User",
    senderId: request.userId!,
    type: body.type ?? "Text",
    content: body.content,
    parentId: body.parentId ?? null,
  });

  return reply.status(201).send(message);
}

async function handlePin(
  request: FastifyRequest<{ Params: PinRouteParams }>,
  reply: FastifyReply
): Promise<void> {
  const message = await getMessage(request.params.messageId);

  if (!message) {
    return reply.status(404).send({ error: "Message not found" });
  }

  if (message.conversationId !== request.params.conversationId) {
    return reply.status(404).send({ error: "Message not found" });
  }

  const updated = await dbPinMessage(request.params.messageId);
  return reply.status(200).send(updated);
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/list", handleList);
  app.post("/create", handleCreate);
  app.post("/:messageId/pin", handlePin);
}
