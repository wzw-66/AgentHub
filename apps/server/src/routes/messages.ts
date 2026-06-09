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
  deleteMessagesAfter as dbDeleteMessagesAfter,
  getConversation,
  getContact,
  listPinnedMessages,
  listCredentials,
} from "@agenthub/db";
import { createAdapter, AgentHarness, ToolRegistry, LocalSandbox, BlackboardMiddleware, MicroCompactMiddleware } from "@agenthub/agent-core";
import type { Chunk, Agent, Message as SharedMessage, ToolDefinition } from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";
import { processChunk } from "../orchestrator/artifact-detector.js";
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
    runAgentExecution(conversationId, body.content, cm, request.server.log).catch((err) => {
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

  const cm = request.server.connectionManager;

  // 1. Update the message content
  const updated = await dbUpdateMessage(request.params.messageId, { content });

  // 2. Delete all subsequent messages (AI responses become stale)
  const deletedMessageIds = await dbDeleteMessagesAfter(
    request.params.conversationId,
    message.createdAt,
  );

  // 3. Trigger agent re-execution in background (for both single and group chat)
  const conversation = await getConversation(request.params.conversationId);
  if (conversation) {
    if (conversation.type === "single") {
      runAgentExecution(
        request.params.conversationId,
        content,
        cm,
        request.server.log,
      ).catch((err) => {
        request.server.log.error(
          { err, messageId: request.params.messageId },
          "Agent re-execution after edit failed",
        );
        if (cm) {
          cm.pushToConversation(request.params.conversationId, "error", {
            message: err instanceof Error ? err.message : "Re-execution failed",
            code: "EXECUTION_ERROR",
          });
        }
      });
    } else if (conversation.type === "group") {
      runOrchestration(
        request.params.messageId,
        conversation,
        cm,
        request.server.log,
      ).catch((err) => {
        request.server.log.error(
          { err, messageId: request.params.messageId },
          "Re-orchestration after edit failed",
        );
        if (cm) {
          cm.pushToConversation(request.params.conversationId, "error", {
            message: err instanceof Error ? err.message : "Re-orchestration failed",
            code: "ORCHESTRATION_ERROR",
          });
        }
      });
    }
  }

  // 4. Return updated message and deleted IDs so frontend can clean up
  return reply.status(200).send({
    message: updated,
    deletedMessageIds,
  });
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

  runAgentExecution(conversationId, message.content, cm, request.server.log).catch((err) => {
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

  // Build SSE push function — also broadcasts chunk/done/error to WebSocket
  // so the client (which listens on WebSocket) receives streaming events
  const pushSSE: PushSSEFn = (event: string, data: unknown) => {
    cm.pushToConversation(conversationId, event, data);
    if (event === "chunk" || event === "done" || event === "error") {
      cm.broadcastToConversation(cm.getConnectedUserIds(), event, data);
    }
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
    // onTaskCompleted: save each agent's full response as a Contact message and return its ID
    async (subtask, result) => {
      try {
        const msg = await createMessage({
          conversationId,
          senderType: "Contact",
          senderId: subtask.agentId,
          type: "Text",
          content: result.content,
          parentId: messageId,
        });
        log.info({ agentId: subtask.agentId }, "Agent message saved");
        return msg.id;
      } catch (err) {
        log.error({ err, agentId: subtask.agentId }, "Failed to save agent message");
        return undefined;
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

/**
 * Map Prisma Message types to shared Message types.
 * Prisma uses PascalCase enums (User/Contact/System, Text/Code/etc.)
 * while the shared package uses lowercase enums (user/contact/system, text/code/etc.).
 */
function mapPrismaMessage(msg: { id: string; conversationId: string; senderType: string; senderId: string; type: string; content: string; parentId?: string | null; isPinned?: boolean | null; createdAt: Date | string; updatedAt: Date | string; artifacts?: unknown[] }): SharedMessage {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderType: msg.senderType.toLowerCase() as SharedMessage["senderType"],
    senderId: msg.senderId,
    type: msg.type.toLowerCase() as SharedMessage["type"],
    content: msg.content,
    parentId: msg.parentId ?? undefined,
    isPinned: msg.isPinned ?? undefined,
    createdAt: typeof msg.createdAt === "string" ? msg.createdAt : msg.createdAt.toISOString(),
    updatedAt: typeof msg.updatedAt === "string" ? msg.updatedAt : msg.updatedAt.toISOString(),
  };
}

function mapPrismaMessages(
  msgs: Array<{ id: string; conversationId: string; senderType: string; senderId: string; type: string; content: string; parentId?: string | null; isPinned?: boolean | null; createdAt: Date | string; updatedAt: Date | string; artifacts?: unknown[] }>,
): SharedMessage[] {
  return msgs.map(mapPrismaMessage);
}

async function runAgentExecution(
  conversationId: string,
  content: string,
  cm: FastifyInstance["connectionManager"],
  log: FastifyInstance["log"],
): Promise<void> {
  log.info({ conversationId }, "runAgentExecution start");
  const conv = await getConversation(conversationId);
  if (!conv) { log.warn("Conversation not found"); return; }

  const contactIds = conv.contactIds ?? [];
  if (contactIds.length === 0) { log.warn("No contactIds"); return; }

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
      const adapterConfig: Record<string, unknown> = {
        cwd,
        timeout: AGENT_EXECUTION_TIMEOUT_MS,
        ...(agent.model ? { model: agent.model } : {}),
      };

      // For Custom provider, resolve endpoint and API key from config/credentials
      if (agent.provider === "Custom") {
        const contactConfig = agent.config as Record<string, unknown> | null;
        // Support both apiEndpoint and apiUrl for backward compatibility
        let endpoint = (contactConfig?.apiEndpoint ?? contactConfig?.apiUrl) as string | undefined;
        // Auto-append /chat/completions if endpoint is a base URL (e.g. https://api.deepseek.com)
        if (endpoint && !endpoint.endsWith("/chat/completions") && !endpoint.includes("/v1/")) {
          endpoint = endpoint.replace(/\/+$/, "") + "/chat/completions";
        }
        if (endpoint) {
          adapterConfig.endpoint = endpoint;
        }
        // Look up API key from user credentials, fall back to contact config
        const credentials = await listCredentials(conv.ownerId);
        const customCred = credentials.find((c) => c.provider === "Custom");
        adapterConfig.apiKey = customCred?.encryptedKey ?? contactConfig?.apiKey;
      }

      const adapter = createAdapter(agent.provider, adapterConfig);

      // Register so the adapter can be aborted if SSE disconnects
      cm.registerAdapter(conversationId, adapter);

      // Load recent history (last 50 messages) for context
      const historyResult = await listMessages(conversationId, { limit: 50 });
      const historyMessages = mapPrismaMessages(historyResult.data);

      // Inject pinned messages as additional system context
      let pinnedContext: string | undefined;
      try {
        const pinnedMessages = await listPinnedMessages(conversationId);
        if (pinnedMessages.length > 0) {
          pinnedContext = pinnedMessages
            .map((m: { content: string }) => `[Pinned Context]: ${m.content}`)
            .join("\n");
        }
      } catch {
        // Ignore errors loading pinned messages
      }

      // ── Build AgentHarness with middleware and tools ─────────────
      const harness = new AgentHarness(adapter, {
        maxTurns: 10,
      });

      // Sandbox + ToolRegistry for file/command tools
      let harnessSandbox: LocalSandbox | undefined;
      if (cwd) {
        harnessSandbox = new LocalSandbox(cwd);
        const toolRegistry = new ToolRegistry(harnessSandbox);
        harness.setToolRegistry(toolRegistry);
        harness.setSandbox(harnessSandbox);
      }

      // Middleware: blackboard for shared state, micro-compact for context
      harness.use(new BlackboardMiddleware());
      harness.use(new MicroCompactMiddleware());

      // Build tool definitions from the registry for the model to see
      const toolDefinitions: ToolDefinition[] = [
        {
          name: "execute_command",
          description: "Execute a shell command in the workspace",
          inputSchema: {
            type: "object",
            properties: {
              command: { type: "string", description: "The shell command to execute" },
            },
            required: ["command"],
          },
        },
        {
          name: "read_file",
          description: "Read a file from the workspace",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "Path to the file relative to workspace" },
            },
            required: ["path"],
          },
        },
        {
          name: "write_file",
          description: "Write content to a file in the workspace",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "Path to the file relative to workspace" },
              content: { type: "string", description: "Content to write" },
            },
            required: ["path", "content"],
          },
        },
        {
          name: "list_dir",
          description: "List files in a directory",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "Directory path relative to workspace" },
            },
            required: ["path"],
          },
        },
      ];

      const context = {
        conversationId,
        message: content,
        history: historyMessages,
        agents: [],
        systemPrompt: [agent.systemPrompt, pinnedContext].filter(Boolean).join("\n\n") || undefined,
        tools: toolDefinitions,
      };

      // ── Multi-turn text tracking ─────────────────────────────────
      // Track text per-turn: discard intermediate turns' text (where the agent
      // called tools) and keep only the final turn's clean response.
      let finalResponse = "";
      let streamingText = "";
      let lastPushedContent = "";

      for await (const chunk of harness.execute(context)) {
        // ── Interactive: AskUserQuestion detection ─────────────────────
        if (chunk.type === ChunkType.ToolCall) {
          const toolName = extractToolName(chunk.content);
          if (toolName === "AskUserQuestion" || toolName === "ask_user_question") {
            try {
              const parsed = JSON.parse(chunk.content) as { id?: string; input?: { questions?: Array<{ question: string; options?: string[]; multiSelect?: boolean }> } };
              const questions = parsed.input?.questions;
              if (questions && questions.length > 0) {
                const q = questions[0]!;
                const prompt = q.question;
                const options = q.options?.map((label) => ({ label, description: "" }));
                const multiSelect = q.multiSelect ?? false;

                // Create pending interaction — blocks until user responds
                const response = await cm.createInteraction(conversationId, {
                  prompt,
                  toolUseId: parsed.id ?? "unknown",
                  options,
                  multiSelect,
                });

                // Write user's response to the adapter's stdin
                adapter.writeStdin?.(response);
              }
            } catch (err) {
              // Timeout or cancellation: abort the adapter, clear partial response
              log.warn({ err, conversationId }, "Interaction error");
              adapter.abort();
              finalResponse = "";
              streamingText = "";
            }
            continue; // Skip rest of loop for this chunk
          }
        }

        const processed = processChunk(chunk);

        if (processed.type === ChunkType.Text || processed.type === ChunkType.Code) {
          streamingText += processed.content;
          finalResponse += processed.content;

          if (processed.type === ChunkType.Text && processed.content === lastPushedContent) {
            continue;
          }
          lastPushedContent = processed.content;
        }

        // A ToolCall ends this turn. The text so far was intermediate thinking;
        // discard it so the next turn becomes the new finalResponse.
        // Note: processChunk may convert ToolCall → Text with markers,
        // so we check the ORIGINAL chunk type here.
        if (chunk.type === ChunkType.ToolCall) {
          finalResponse = "";
        }

        if (processed.type !== ChunkType.Done) {
          pushChunk(cm, conversationId, processed, agent.id);
        }
      }

      // Fallback: if last turn had no text, use full stream as-is
      if (!finalResponse && streamingText) {
        finalResponse = streamingText;
      }

      // Save AI response to database
      let messageId = "";
      if (finalResponse) {
        const saved = await dbCreateMessage({
          conversationId,
          senderType: "Contact",
          senderId: agent.id,
          type: "Text",
          content: finalResponse,
          parentId: null,
        });
        messageId = saved.id;
      }

      const donePayload = { messageId, agentId: agent.id, tokenUsage: { input: 0, output: 0 } };
      cm.pushToConversation(conversationId, "done", donePayload);
      cm.broadcastToConversation(cm.getConnectedUserIds(), "done", donePayload);
    } catch (err) {
      const errorPayload = { message: err instanceof Error ? err.message : "Agent execution failed", code: "ADAPTER_ERROR" };
      cm.pushToConversation(conversationId, "error", errorPayload);
      cm.broadcastToConversation(cm.getConnectedUserIds(), "error", errorPayload);
    } finally {
      cm.removeAdapter(conversationId);
    }
  }
  // Group-type conversations use the orchestrator path (handled in handleCreate)
}

/**
 * Extract the tool name from a ToolCall chunk's JSON content.
 */
function extractToolName(content: string): string {
  try {
    const parsed = JSON.parse(content) as { name?: string; toolName?: string };
    return parsed.name ?? parsed.toolName ?? "unknown";
  } catch {
    return "unknown";
  }
}

function pushChunk(
  cm: FastifyInstance["connectionManager"],
  conversationId: string,
  chunk: Chunk,
  agentId: string,
): void {
  switch (chunk.type) {
    case ChunkType.Text:
    case ChunkType.Code: {
      const data = {
        type: chunk.type,
        content: chunk.content,
        timestamp: chunk.timestamp,
        agentId,
      };
      // SSE
      cm.pushToConversation(conversationId, "chunk", data);
      cm.broadcastToConversation(cm.getConnectedUserIds(), "chunk", data);
      break;
    }

    case ChunkType.Interactive: {
      // Interactive chunks are pushed via ConnectionManager.createInteraction()
      // and handled by the frontend's interactive card. No additional SSE push needed.
      break;
    }

    case ChunkType.ToolCall: {
      // Send tool calls as a separate event — frontend renders them
      // as processing indicators, not as chat text.
      const toolName = extractToolName(chunk.content);
      const data = {
        toolName,
        content: chunk.content,
        agentId,
      };
      cm.pushToConversation(conversationId, "tool_status", data);
      cm.broadcastToConversation(cm.getConnectedUserIds(), "tool_status", data);
      break;
    }

    case ChunkType.Error: {
      const data = {
        message: chunk.content,
        code: "ADAPTER_ERROR",
        agentId,
      };
      cm.pushToConversation(conversationId, "error", data);
      cm.broadcastToConversation(cm.getConnectedUserIds(), "error", data);
      break;
    }

    case ChunkType.Done: {
      const data = {
        messageId: (chunk.metadata?.messageId as string) ?? "",
        tokenUsage: chunk.metadata?.tokenUsage as { input: number; output: number } | undefined,
      };
      cm.pushToConversation(conversationId, "done", data);
      cm.broadcastToConversation(cm.getConnectedUserIds(), "done", data);
      break;
    }
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

  // 2. Find the most recent user message BEFORE this AI message
  const allMessages = await listMessages(conversationId, { limit: 100 });
  const aiCreatedAt = new Date(aiMessage.createdAt).getTime();
  const precedingUserMessages = allMessages.data.filter(
    (m) => m.senderType === "User" && new Date(m.createdAt).getTime() < aiCreatedAt,
  );
  const userMessage = precedingUserMessages[precedingUserMessages.length - 1];
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
      const adapterConfig: Record<string, unknown> = {
        cwd,
        timeout: AGENT_EXECUTION_TIMEOUT_MS,
        ...(agent.model ? { model: agent.model } : {}),
      };

      // For Custom provider, resolve endpoint and API key from config/credentials
      if (agent.provider === "Custom") {
        const contactConfig = agent.config as Record<string, unknown> | null;
        let endpoint = (contactConfig?.apiEndpoint ?? contactConfig?.apiUrl) as string | undefined;
        if (endpoint && !endpoint.endsWith("/chat/completions") && !endpoint.includes("/v1/")) {
          endpoint = endpoint.replace(/\/+$/, "") + "/chat/completions";
        }
        if (endpoint) {
          adapterConfig.endpoint = endpoint;
        }
        const credentials = await listCredentials(conv.ownerId);
        const customCred = credentials.find((c) => c.provider === "Custom");
        adapterConfig.apiKey = customCred?.encryptedKey ?? contactConfig?.apiKey;
      }

      const adapter = createAdapter(agent.provider, adapterConfig);

      // Register adapter so it can be aborted if SSE disconnects
      cm.registerAdapter(conversationId, adapter);

      // ── Build AgentHarness with middleware and tools ─────────────
      const harness = new AgentHarness(adapter, {
        maxTurns: 10,
      });

      let harnessSandbox: LocalSandbox | undefined;
      if (cwd) {
        harnessSandbox = new LocalSandbox(cwd);
        const toolRegistry = new ToolRegistry(harnessSandbox);
        harness.setToolRegistry(toolRegistry);
        harness.setSandbox(harnessSandbox);
      }
      harness.use(new BlackboardMiddleware());
      harness.use(new MicroCompactMiddleware());

      const toolDefinitions: ToolDefinition[] = [
        { name: "execute_command", description: "Execute a shell command in the workspace", inputSchema: { type: "object", properties: { command: { type: "string", description: "The shell command to execute" } }, required: ["command"] } },
        { name: "read_file", description: "Read a file from the workspace", inputSchema: { type: "object", properties: { path: { type: "string", description: "Path to the file relative to workspace" } }, required: ["path"] } },
        { name: "write_file", description: "Write content to a file in the workspace", inputSchema: { type: "object", properties: { path: { type: "string", description: "Path to the file relative to workspace" }, content: { type: "string", description: "Content to write" } }, required: ["path", "content"] } },
        { name: "list_dir", description: "List files in a directory", inputSchema: { type: "object", properties: { path: { type: "string", description: "Directory path relative to workspace" } }, required: ["path"] } },
      ];

      // Load history, excluding the AI message being regenerated and messages after it
      const historyResult = await listMessages(conversationId, { limit: 50 });
      const historyBeforeRegen = historyResult.data.filter(
        (m) => new Date(m.createdAt).getTime() < aiCreatedAt,
      );
      const historyMessages = mapPrismaMessages(historyBeforeRegen);

      const context = {
        conversationId,
        message: userMessage.content,
        history: historyMessages,
        agents: [],
        systemPrompt: agent.systemPrompt ?? undefined,
        tools: toolDefinitions,
      };

      let fullResponse = "";
      let streamingText = "";
      let lastPushedContent = "";

      for await (const chunk of harness.execute(context)) {
        const processed = processChunk(chunk);

        // Handle interactive chunks (AskUserQuestion) during regeneration
        if (chunk.type === ChunkType.ToolCall) {
          const toolName = extractToolName(chunk.content);
          if (toolName === "AskUserQuestion" || toolName === "ask_user_question") {
            try {
              const parsed = JSON.parse(chunk.content) as {
                id?: string;
                input?: { questions?: Array<{ question: string; options?: string[]; multiSelect?: boolean }> };
              };
              const questions = parsed.input?.questions;
              if (questions && questions.length > 0) {
                const q = questions[0]!;
                const response = await cm.createInteraction(conversationId, {
                  prompt: q.question,
                  toolUseId: parsed.id ?? "unknown",
                  options: q.options?.map((label) => ({ label, description: "" })),
                  multiSelect: q.multiSelect ?? false,
                });
                adapter.writeStdin?.(response);
              }
            } catch {
              adapter.abort();
              fullResponse = "";
              streamingText = "";
            }
            continue;
          }
        }

        // Only accumulate text/code for the persisted message
        if (
          processed.type === ChunkType.Text ||
          processed.type === ChunkType.Code
        ) {
          streamingText += processed.content;
          fullResponse += processed.content;

          if (processed.type === ChunkType.Text && processed.content === lastPushedContent) {
            continue;
          }
          lastPushedContent = processed.content;
        }

        // A ToolCall ends this turn; discard intermediate text
        if (chunk.type === ChunkType.ToolCall) {
          fullResponse = "";
        }

        if (processed.type !== ChunkType.Done) {
          pushChunk(cm, conversationId, processed, agent.id);
        }
      }

      // Fallback: if last turn had no text, use full stream
      if (!fullResponse && streamingText) {
        fullResponse = streamingText;
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

      const donePayload = { messageId, agentId: agent.id, tokenUsage: { input: 0, output: 0 } };
      cm.pushToConversation(conversationId, "done", donePayload);
      cm.broadcastToConversation(cm.getConnectedUserIds(), "done", donePayload);
    } catch (err) {
      cm.pushToConversation(conversationId, "error", {
        message: err instanceof Error ? err.message : "Regeneration failed",
        code: "ADAPTER_ERROR",
      });
    } finally {
      cm.removeAdapter(conversationId);
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

// ─── Interaction respond (REST fallback) ─────────────────────────────────────

type InteractRespondBody = {
  response: string;
};

async function handleInteractRespond(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // conversationId is from the route prefix: /api/conversations/:conversationId
  const conversationId = (request.params as Record<string, string>).conversationId;
  const body = request.body as InteractRespondBody | undefined;
  const cm = request.server.connectionManager;

  if (!body?.response || typeof body.response !== "string" || !body.response.trim()) {
    return reply.status(400).send({ error: "response is required" });
  }

  const resolved = cm.resolveInteraction(conversationId, body.response.trim());
  if (!resolved) {
    return reply.status(404).send({ error: "No pending interaction for this conversation" });
  }

  return reply.status(200).send({ status: "ok" });
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
  app.post("/interact/respond", handleInteractRespond);
}
