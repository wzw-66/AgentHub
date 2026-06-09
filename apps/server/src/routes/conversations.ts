import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  listConversations,
  getConversation,
  createConversation as dbCreateConversation,
  updateConversation as dbUpdateConversation,
  deleteConversation as dbDeleteConversation,
  addConversationMembers,
  removeConversationMembers,
  findSingleConversationByAgentId,
  findUserById,
} from "@agenthub/db";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { WORKSPACE_ROOT } from "../config/env.js";

// ─── Types ───────────────────────────────────────────────────────────────────

type CreateConversationBody = {
  title: string;
  type: "single" | "group";
  contactIds?: string[];
};

type UpdateConversationBody = {
  title?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  addMembers?: string[];
  removeMembers?: string[];
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
  if (
    typeof b.title !== "string" ||
    b.title.length === 0 ||
    (b.type !== "single" && b.type !== "group")
  ) {
    return false;
  }
  // Group conversations require at least 2 contacts
  if (b.type === "group") {
    const contactIds = b.contactIds;
    if (!Array.isArray(contactIds) || contactIds.length < 2) return false;
  }
  return true;
}

type FindByAgentParams = {
  agentId: string;
};

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
  const userId = request.userId!;

  // Fetch user to get email for workspace path
  const user = await findUserById(userId);
  if (!user) {
    return reply.status(404).send({ error: "User not found" });
  }

  const conversation = await dbCreateConversation({
    title: body.title,
    type: body.type,
    ownerId: userId,
    contactIds: body.contactIds ?? [],
  });

  // Create workspace directory: agent-workspace/{email}/conversations/{id}/
  const safeEmail = user.email.replace(/[^a-zA-Z0-9@._-]/g, "_");
  const workspacePath = `agent-workspace/${safeEmail}/conversations/${conversation.id}`;

  try {
    const workspaceDir = resolve(WORKSPACE_ROOT, workspacePath);
    await mkdir(workspaceDir, { recursive: true });

    // Create a minimal .git directory to block Claude CLI's upstream
    // git detection — without it, Claude walks up to the project root,
    // finds the repo's CLAUDE.md, and reads it even though the
    // conversation workspace is a subdirectory.
    const gitDir = resolve(workspaceDir, ".git");
    await mkdir(gitDir, { recursive: true });
    await writeFile(resolve(gitDir, "HEAD"), "ref: refs/heads/main\n", "utf-8");
  } catch (err) {
    request.server.log.error({ err }, "Failed to create conversation workspace directory");
    return reply.status(500).send({ error: "Failed to create workspace directory" });
  }

  // update conversation with workspacePath
  const updated = await dbUpdateConversation(conversation.id, {
    workspacePath,
  });

  return reply.status(201).send(updated);
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

  // Handle member management fields separately
  const { addMembers, removeMembers, ...updateFields } = body;

  let conversation = existing;

  // Apply scalar updates first (title, isArchived, etc.)
  if (Object.keys(updateFields).length > 0) {
    conversation = await dbUpdateConversation(request.params.id, updateFields);
  }

  // Add members
  if (addMembers && addMembers.length > 0) {
    conversation = await addConversationMembers(request.params.id, addMembers);
  }

  // Remove members
  if (removeMembers && removeMembers.length > 0) {
    conversation = await removeConversationMembers(request.params.id, removeMembers);

    // Abort any active agent streaming for this conversation
    try {
      request.server.connectionManager.abortAdapters(request.params.id);
    } catch {
      // ConnectionManager may not be available in all contexts
    }
  }

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

  // Clean up workspace directory if it exists
  if (existing.workspacePath) {
    rm(resolve(WORKSPACE_ROOT, existing.workspacePath), { recursive: true, force: true }).catch(
      (err) => request.server.log.error({ err }, "Failed to remove conversation workspace"),
    );
  }

  await dbDeleteConversation(request.params.id);
  return reply.status(204).send();
}

async function handleFindByAgent(
  request: FastifyRequest<{ Params: FindByAgentParams }>,
  reply: FastifyReply
): Promise<void> {
  const conversation = await findSingleConversationByAgentId(
    request.userId!,
    request.params.agentId,
  );

  return reply.status(200).send({ conversation });
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/list", handleList);
  app.post("/create", handleCreate);
  app.get("/:id/detail", handleDetail);
  app.patch("/:id/update", handleUpdate);
  app.delete("/:id/delete", handleDelete);
  app.get("/find-by-agent/:agentId", handleFindByAgent);
}
