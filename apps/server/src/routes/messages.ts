import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { resolve } from "node:path";
import { WORKSPACE_ROOT } from "../config/env.js";
import {
  listMessages,
  createMessage as dbCreateMessage,
  getMessage,
  pinMessage as dbPinMessage,
  updateMessage as dbUpdateMessage,
  deleteMessage as dbDeleteMessage,
  getConversation,
  getContact,
  listContacts,
} from "@agenthub/db";
import { createAdapter } from "@agenthub/agent-core";
import type { Chunk, Agent } from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";
import { decomposeMessage } from "../orchestrator/intent-analyzer.js";
import { TaskDispatcher } from "../orchestrator/dispatcher.js";
import { ResultAggregator } from "../orchestrator/aggregator.js";
import { createMessage, createArtifact } from "@agenthub/db";
import type { PushSSEFn } from "../orchestrator/types.js";

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

type UpdateMessageBody = {
  content: string;
};

type MessageIdRouteParams = {
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

// ─── @mention helpers ────────────────────────────────────────────────────────

const MENTION_RE = /@(\S+?)(?=\s|$|，|。|、|\.|,)/g;

/**
 * Extract unique @mention names from message content.
 */
function extractMentions(content: string): string[] {
  const mentions = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, "g");
  while ((match = re.exec(content)) !== null) {
    const name = match[1]?.trim();
    if (name) mentions.add(name);
  }
  return Array.from(mentions);
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
  const { conversationId } = request.params;

  // Create the user message first
  const message = await dbCreateMessage({
    conversationId,
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
        conversationId,
        senderId: request.userId!,
        preview: body.content.slice(0, 100),
      },
      request.userId!,
    );
  }

  // Check if this should trigger orchestration
  const conversation = await getConversation(conversationId);
  const mentions = extractMentions(body.content);

  if (
    conversation &&
    conversation.type === "group" &&
    mentions.length >= 2
  ) {
    // Launch orchestrator as background task
    runOrchestration(message.id, conversation, request).catch((err) => {
      request.server.log.error({ err, messageId: message.id }, "Orchestration failed");
      if (cm) {
        cm.pushToConversation(conversationId, "error", {
          message: err instanceof Error ? err.message : "Orchestration failed",
          code: "ORCHESTRATION_ERROR",
        });
      }
    });
  }

  // Single conversation: trigger agent execution
  if (conversation && conversation.type === "single") {
    runAgentExecution(conversationId, body.content, cm).catch((err) => {
      request.server.log.error({ err, messageId: message.id }, "Agent execution failed");
      if (cm) {
        cm.pushToConversation(conversationId, "error", {
          message: err instanceof Error ? err.message : "Execution failed",
          code: "EXECUTION_ERROR",
        });
      }
    });
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

// ─── Message update / delete ──────────────────────────────────────────────────

async function handleUpdateMessage(
  request: FastifyRequest<{ Params: MessageIdRouteParams }>,
  reply: FastifyReply
): Promise<void> {
  const message = await getMessage(request.params.messageId);

  if (!message) {
    return reply.status(404).send({ error: "Message not found" });
  }

  if (message.conversationId !== request.params.conversationId) {
    return reply.status(404).send({ error: "Message not found" });
  }

  // Only the sender can update their own message
  if (message.senderId !== request.userId!) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  const body = request.body as UpdateMessageBody | undefined;
  const content = body?.content?.trim();
  if (!content) {
    return reply.status(400).send({ error: "Content is required" });
  }

  const updated = await dbUpdateMessage(request.params.messageId, { content });
  return reply.status(200).send(updated);
}

async function handleDeleteMessage(
  request: FastifyRequest<{ Params: MessageIdRouteParams }>,
  reply: FastifyReply
): Promise<void> {
  const message = await getMessage(request.params.messageId);

  if (!message) {
    return reply.status(404).send({ error: "Message not found" });
  }

  if (message.conversationId !== request.params.conversationId) {
    return reply.status(404).send({ error: "Message not found" });
  }

  // Only the sender can delete their own message
  if (message.senderId !== request.userId!) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  await dbDeleteMessage(request.params.messageId);
  return reply.status(204).send();
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

// ─── Orchestration ───────────────────────────────────────────────────────────

/**
 * Run the full orchestration pipeline in the background.
 *
 * Steps:
 * 1. Resolve mentioned agents from conversation contacts
 * 2. Decompose the message into sub-tasks
 * 3. Dispatch tasks via dispatcher (parallel/serial)
 * 4. Persist aggregated results via aggregator
 */
async function runOrchestration(
  messageId: string,
  conversation: Awaited<ReturnType<typeof getConversation>>,
  request: FastifyRequest,
): Promise<void> {
  if (!conversation) return;

  const cm = request.server.connectionManager;
  const conversationId = conversation.id;

  // Build SSE push function
  const pushSSE: PushSSEFn = (event: string, data: unknown) => {
    cm.pushToConversation(conversationId, event, data);
  };

  // Resolve agents from conversation contacts
  const contacts = await listContacts(conversation.ownerId);
  const agentMap = new Map<string, Agent>();

  // Only include agents whose names are mentioned in the user's contacts
  const message = await getMessage(messageId);
  if (!message) return;

  for (const contact of contacts) {
    const agent = contact as unknown as Agent;
    agentMap.set(agent.id, agent);
  }

  // Get the full agent records from shared types
  const mentionedAgents: Agent[] = [];
  const mentions = extractMentions(message.content);

  for (const contact of contacts) {
    const agent = contact as unknown as Agent;
    if (
      mentions.some(
        (m) => agent.name.toLowerCase().includes(m.toLowerCase()),
      )
    ) {
      mentionedAgents.push(agent);
    }
  }

  if (mentionedAgents.length < 2) return; // Not a multi-agent message

  // Step 1: Decompose
  const decomposition = decomposeMessage({
    content: message.content,
    agents: mentionedAgents,
    conversationId,
    parentMessageId: messageId,
    history: [],
  });

  if (decomposition.subtasks.length === 0) return;

  // Build agent map for dispatcher
  const agents = new Map<string, Agent>();
  for (const agent of mentionedAgents) {
    agents.set(agent.id, agent);
  }

  // Step 2: Dispatch
  const dispatcher = new TaskDispatcher();
  const aggregated = await dispatcher.dispatchAll(
    decomposition,
    agents,
    pushSSE,
  );

  // Step 3: Aggregate & persist
  const aggregator = new ResultAggregator(
    (data) => createMessage(data),
    (data) => createArtifact(data),
  );
  await aggregator.persist(aggregated, conversationId, messageId, pushSSE);
}

// ─── Agent execution ─────────────────────────────────────────────────────────

async function runAgentExecution(
  conversationId: string,
  content: string,
  cm: FastifyInstance["connectionManager"],
): Promise<void> {
  const conv = await getConversation(conversationId);
  if (!conv) return;

  const contactIds = conv.contactIds ?? [];
  if (contactIds.length === 0) return;

  if (conv.type === "single") {
    // Single-agent conversation: resolve the target agent and execute
    const contactId = contactIds[0]!;
    const agent = await getContact(contactId);
    if (!agent) {
      cm.pushToConversation(conversationId, "error", {
        message: "Agent not found",
        code: "AGENT_NOT_FOUND",
      });
      return;
    }

    const cwd = conv.workspacePath
      ? resolve(WORKSPACE_ROOT, conv.workspacePath)
      : agent.workspacePath
        ? resolve(WORKSPACE_ROOT, agent.workspacePath)
        : undefined;

    try {
      const adapter = createAdapter(agent.provider, { cwd });
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
  // Group-type conversations use the orchestrator path (handled in handleCreate)
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
  app.patch("/:messageId/update", handleUpdateMessage);
  app.delete("/:messageId/delete", handleDeleteMessage);
}
