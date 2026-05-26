import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  listMessages,
  createMessage as dbCreateMessage,
  getMessage,
  pinMessage as dbPinMessage,
  getConversation,
  listContacts,
} from "@agenthub/db";
import { createAdapter } from "@agenthub/agent-core";
import type { Chunk } from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";

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

type ExecuteRouteParams = {
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

  // Broadcast notification via WebSocket
  const cm = request.server.connectionManager;
  if (cm) {
    cm.broadcastToConversation(
      cm.getConnectedUserIds(),
      "notification",
      {
        conversationId: request.params.conversationId,
        senderId: request.userId!,
        preview: body.content.slice(0, 100),
      },
      request.userId!,
    );
  }

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

// ─── Execute handler ─────────────────────────────────────────────────────────

async function handleExecute(
  request: FastifyRequest<{ Params: ExecuteRouteParams }>,
  reply: FastifyReply
): Promise<void> {
  const { conversationId, messageId } = request.params;
  const cm = request.server.connectionManager;

  // Verify message exists
  const message = await getMessage(messageId);
  if (!message) {
    return reply.status(404).send({ error: "Message not found" });
  }
  if (message.conversationId !== conversationId) {
    return reply.status(404).send({ error: "Message not found" });
  }

  // Acknowledge execution started
  await reply.status(202).send({ status: "executing", messageId });

  // ─── Background: run Agent and push via SSE ──────────────────────────

  runAgentExecution(conversationId, message.content, cm).catch((err) => {
    request.server.log.error({ err, messageId }, "Agent execution failed");
    if (cm) {
      cm.pushToConversation(conversationId, "error", {
        message: err instanceof Error ? err.message : "Execution failed",
        code: "EXECUTION_ERROR",
      });
    }
  });
}

async function runAgentExecution(
  conversationId: string,
  content: string,
  cm: FastifyInstance["connectionManager"],
): Promise<void> {
  // Get conversation contacts to find agents
  const conv = await getConversation(conversationId);
  if (!conv) return;

  const contactIds = conv.contactIds ?? [];
  if (contactIds.length === 0) return;

  // Use the first contact's agent for now
  // (Orchestrator module will handle multi-agent dispatch)
  const contacts = await Promise.all(
    contactIds.map(() => listContacts(conv.ownerId)),
  );

  const flatContacts = contacts.flat();
  for (const contact of flatContacts) {
    const provider = contact.agent.provider.toLowerCase();

    try {
      const adapter = createAdapter(provider);
      const context = {
        conversationId,
        message: content,
        history: [],
        agents: [],
      };

      for await (const chunk of adapter.execute(context)) {
        pushChunk(cm, conversationId, chunk);
      }

      cm.pushToConversation(conversationId, "done", {
        messageId: "",
        tokenUsage: { input: 0, output: 0 },
      });
    } catch (err) {
      cm.pushToConversation(conversationId, "error", {
        message: err instanceof Error ? err.message : "Agent execution failed",
        code: "ADAPTER_ERROR",
      });
    }
  }
}

function pushChunk(
  cm: FastifyInstance["connectionManager"],
  conversationId: string,
  chunk: Chunk,
): void {
  switch (chunk.type) {
    case ChunkType.Text:
    case ChunkType.Code:
    case ChunkType.ToolCall:
      cm.pushToConversation(conversationId, "chunk", {
        type: chunk.type,
        content: chunk.content,
        timestamp: chunk.timestamp,
      });
      break;

    case ChunkType.Artifact:
      cm.pushToConversation(conversationId, "artifact_status", {
        id: chunk.metadata?.id ?? "",
        status: chunk.metadata?.status ?? "building",
        title: chunk.metadata?.title,
      });
      break;

    case ChunkType.Error:
      cm.pushToConversation(conversationId, "error", {
        message: chunk.content,
        code: "ADAPTER_ERROR",
      });
      break;

    case ChunkType.Done:
      cm.pushToConversation(conversationId, "done", {
        messageId: (chunk.metadata?.messageId as string) ?? "",
        tokenUsage: chunk.metadata?.tokenUsage as { input: number; output: number } | undefined,
      });
      break;
  }
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/list", handleList);
  app.post("/create", handleCreate);
  app.post("/:messageId/pin", handlePin);
  app.post("/:messageId/execute", handleExecute);
}
