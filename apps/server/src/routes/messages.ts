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
  listPinnedMessages,
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

  if (conversation && conversation.type === "group") {
    // Launch orchestrator as background task
    // LLM will determine if and which agents should handle the message
    runOrchestration(message.id, conversation, cm, request.server.log).catch((err) => {
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
 * 1. Resolve conversation members from contactIds
 * 2. Decompose the message into sub-tasks via LLM intent analysis
 * 3. Dispatch tasks via dispatcher (parallel/serial)
 * 4. Persist aggregated results via aggregator
 */
async function runOrchestration(
  messageId: string,
  conversation: Awaited<ReturnType<typeof getConversation>>,
  cm: FastifyInstance["connectionManager"],
  log: FastifyInstance["log"],
): Promise<void> {
  if (!conversation) return;

  const conversationId = conversation.id;

  log.info({ conversationId, messageId }, "Starting orchestration");

  // Build SSE push function
  const pushSSE: PushSSEFn = (event: string, data: unknown) => {
    cm.pushToConversation(conversationId, event, data);
  };

  // Resolve agents from conversation contactIds only
  const contactIds = conversation.contactIds ?? [];
  if (contactIds.length === 0) {
    log.warn({ conversationId }, "No contactIds in group conversation");
    return;
  }

  const message = await getMessage(messageId);
  if (!message) {
    log.warn({ messageId }, "Message not found for orchestration");
    return;
  }

  log.info({ contactIds }, "Resolving agents from contactIds");

  // Get full agent records for each conversation member
  const agents: Agent[] = [];
  for (const contactId of contactIds) {
    const contact = await getContact(contactId);
    if (contact) {
      agents.push(contact as unknown as Agent);
    }
  }

  if (agents.length === 0) {
    log.warn({ conversationId }, "No agents resolved from contactIds");
    return;
  }

  log.info({ agentCount: agents.length, agentNames: agents.map((a) => a.name) }, "Agents resolved");

  // Step 1: Decompose via LLM intent analysis
  log.info({ content: message.content }, "Decomposing message");
  const decomposition = await decomposeMessage({
    content: message.content,
    agents,
    conversationId,
    parentMessageId: messageId,
    history: [],
  });

  // LLM determined no agents needed (greeting, etc.) — finish silently
  if (decomposition.subtasks.length === 0) {
    log.info({ conversationId }, "No subtasks to execute (LLM returned empty)");
    return;
  }

  log.info({ subtaskCount: decomposition.subtasks.length, layers: decomposition.layers }, "Sub-tasks created");

  // Build agent map for dispatcher
  const agentMap = new Map<string, Agent>();
  for (const agent of agents) {
    agentMap.set(agent.id, agent);
  }

  // Step 2: Dispatch
  const dispatcher = new TaskDispatcher();
  const aggregated = await dispatcher.dispatchAll(
    decomposition,
    agentMap,
    pushSSE,
    undefined, // onAgentChunk
    // onTaskCompleted: save each agent's full response as a Contact message
    async (subtask, result) => {
      try {
        await createMessage({
          conversationId,
          senderType: "Contact",
          senderId: subtask.agentId,
          type: "Text",
          content: result.content,
          parentId: messageId,
        });
        log.info({ agentId: subtask.agentId }, "Agent message saved");
      } catch (err) {
        log.error({ err, agentId: subtask.agentId }, "Failed to save agent message");
      }
    },
  );

  log.info({ totalTasks: aggregated.totalTasks, completed: aggregated.completedTasks, failed: aggregated.failedTasks }, "Dispatch completed");

  // Step 3: Aggregate & persist
  const aggregator = new ResultAggregator(
    (data) => createMessage(data),
    (data) => createArtifact(data),
  );
  await aggregator.persist(aggregated, conversationId, messageId, pushSSE);

  log.info({ messageId: aggregated.messageId }, "Orchestration results persisted");
}

// ─── Agent execution ─────────────────────────────────────────────────────────

/** Default timeout for agent execution: 5 minutes */
const AGENT_EXECUTION_TIMEOUT_MS = 300_000;

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
      const adapter = createAdapter(agent.provider, {
        cwd,
        timeout: AGENT_EXECUTION_TIMEOUT_MS,
        ...(agent.model ? { model: agent.model } : {}),
      });

      // Register so the adapter can be aborted if SSE disconnects
      cm.registerAdapter(conversationId, adapter);

      const context = {
        conversationId,
        message: content,
        history: [],
        agents: [],
      };

      let fullResponse = "";

      for await (const chunk of adapter.execute(context)) {
        if (
          chunk.type === ChunkType.Text ||
          chunk.type === ChunkType.Code ||
          chunk.type === ChunkType.ToolCall
        ) {
          fullResponse += chunk.content;
        }
        // Don't forward Done chunk — we persist first, then push done event
        if (chunk.type !== ChunkType.Done) {
          pushChunk(cm, conversationId, chunk, agent.id);
        }
      }

      // Save AI response to database
      let messageId = "";
      if (fullResponse) {
        const saved = await dbCreateMessage({
          conversationId,
          senderType: "Contact",
          senderId: agent.id,
          type: "Text",
          content: fullResponse,
          parentId: null,
        });
        messageId = saved.id;
      }

      cm.pushToConversation(conversationId, "done", {
        messageId,
        agentId: agent.id,
        tokenUsage: { input: 0, output: 0 },
      });
    } catch (err) {
      cm.pushToConversation(conversationId, "error", {
        message: err instanceof Error ? err.message : "Agent execution failed",
        code: "ADAPTER_ERROR",
      });
    } finally {
      cm.removeAdapter(conversationId);
    }
  }
  // Group-type conversations use the orchestrator path (handled in handleCreate)
}

function pushChunk(
  cm: FastifyInstance["connectionManager"],
  conversationId: string,
  chunk: Chunk,
  agentId: string,
): void {
  switch (chunk.type) {
    case ChunkType.Text:
    case ChunkType.Code:
    case ChunkType.ToolCall:
      cm.pushToConversation(conversationId, "chunk", {
        type: chunk.type,
        content: chunk.content,
        timestamp: chunk.timestamp,
        agentId,
      });
      break;

    case ChunkType.Artifact:
      cm.pushToConversation(conversationId, "artifact_status", {
        id: chunk.metadata?.id ?? "",
        status: chunk.metadata?.status ?? "building",
        title: chunk.metadata?.title,
        agentId,
      });
      break;

    case ChunkType.Error:
      cm.pushToConversation(conversationId, "error", {
        message: chunk.content,
        code: "ADAPTER_ERROR",
        agentId,
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

// ─── Regenerate ──────────────────────────────────────────────────────────────

type RegenerateRouteParams = {
  conversationId: string;
  messageId: string;
};

async function handleRegenerate(
  request: FastifyRequest<{ Params: RegenerateRouteParams }>,
  reply: FastifyReply
): Promise<void> {
  const { conversationId, messageId } = request.params;
  const cm = request.server.connectionManager;

  // 1. Find the AI reply message
  const aiMessage = await getMessage(messageId);
  if (!aiMessage || aiMessage.senderType !== "Contact") {
    return reply.status(400).send({ error: "Not an AI message" });
  }

  // 2. Find the most recent user message before this AI message
  const allMessages = await listMessages(conversationId, { limit: 100 });
  const userMessages = allMessages.data.filter((m) => m.senderType === "User");
  const userMessage = userMessages[userMessages.length - 1];
  if (!userMessage) {
    return reply.status(400).send({ error: "No user message to regenerate from" });
  }

  // Acknowledge
  await reply.status(202).send({ status: "regenerating", messageId });

  // 3. Re-execute agent (reuse existing logic)
  const conv = await getConversation(conversationId);
  if (!conv) return;

  const contactIds = conv.contactIds ?? [];
  if (contactIds.length === 0) return;

  if (conv.type === "single") {
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
        message: userMessage.content,
        history: [],
        agents: [],
      };

      let fullResponse = "";
      for await (const chunk of adapter.execute(context)) {
        if (
          chunk.type === ChunkType.Text ||
          chunk.type === ChunkType.Code ||
          chunk.type === ChunkType.ToolCall
        ) {
          fullResponse += chunk.content;
        }
        if (chunk.type !== ChunkType.Done) {
          pushChunk(cm, conversationId, chunk, agent.id);
        }
      }

      // 4. Update the AI reply message content (replace, not create new)
      if (fullResponse) {
        await dbUpdateMessage(messageId, { content: fullResponse });
      }

      cm.pushToConversation(conversationId, "replace", {
        messageId,
        content: fullResponse,
        agentId: agent.id,
      });
    } catch (err) {
      cm.pushToConversation(conversationId, "error", {
        message: err instanceof Error ? err.message : "Regeneration failed",
        code: "ADAPTER_ERROR",
      });
    }
  }
  // Group conversation regeneration skipped for now (higher complexity)
}

// ─── List Pinned Messages ────────────────────────────────────────────────────

async function handleListPinned(
  request: FastifyRequest<{ Params: MessageRouteParams }>,
  reply: FastifyReply
): Promise<void> {
  const { conversationId } = request.params;
  const messages = await listPinnedMessages(conversationId);
  return reply.status(200).send(messages);
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/list", handleList);
  app.post("/create", handleCreate);
  app.post("/:messageId/pin", handlePin);
  app.post("/:messageId/execute", handleExecute);
  app.post("/:messageId/regenerate", handleRegenerate);
  app.get("/pinned/list", handleListPinned);
  app.patch("/:messageId/update", handleUpdateMessage);
  app.delete("/:messageId/delete", handleDeleteMessage);
}
