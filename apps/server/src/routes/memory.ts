import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MemoryType } from "@agenthub/shared";
import {
  createMemory,
  getMemory,
  listMemories,
  searchMemories,
  deleteMemory,
  initSchema,
} from "@agenthub/memory";

// ─── Types ───────────────────────────────────────────────────────────────────

type CreateMemoryBody = {
  agentId: string;
  type: MemoryType;
  content: string;
  tags?: string[];
  sourceMessageId?: string;
  conversationId?: string;
  importance?: number;
};

type ListMemoriesQuery = {
  agentId?: string;
  type?: MemoryType;
  limit?: string;
  offset?: string;
};

type SearchMemoriesQuery = {
  q: string;
  agentId?: string;
  limit?: string;
  offset?: string;
};

type DeleteMemoryQuery = {
  id: string;
};

// ─── Validation helpers ──────────────────────────────────────────────────────

const VALID_MEMORY_TYPES = ["fact", "preference", "decision", "error_pattern", "context"];

function validateCreateBody(body: unknown): body is CreateMemoryBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.agentId === "string" &&
    typeof b.content === "string" &&
    b.content.length > 0 &&
    typeof b.type === "string" &&
    VALID_MEMORY_TYPES.includes(b.type)
  );
}

function parseIntParam(val: string | undefined, defaultVal: number): number {
  const n = parseInt(val ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : defaultVal;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleCreate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!validateCreateBody(request.body)) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  const body = request.body as CreateMemoryBody;

  const memory = createMemory({
    userId: request.userId!,
    agentId: body.agentId,
    type: body.type,
    content: body.content,
    tags: body.tags,
    sourceMessageId: body.sourceMessageId,
    conversationId: body.conversationId,
    importance: body.importance,
  });

  return reply.status(201).send(memory);
}

async function handleList(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListMemoriesQuery;

  const result = listMemories({
    userId: request.userId!,
    agentId: query.agentId,
    type: query.type,
    limit: parseIntParam(query.limit, 50),
    offset: parseIntParam(query.offset, 0),
  });

  return reply.status(200).send(result);
}

async function handleSearch(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as SearchMemoriesQuery;

  if (!query.q || typeof query.q !== "string" || query.q.trim().length === 0) {
    return reply.status(400).send({ error: "Query parameter 'q' is required" });
  }

  const results = searchMemories({
    query: query.q,
    userId: request.userId!,
    agentId: query.agentId,
    limit: parseIntParam(query.limit, 50),
    offset: parseIntParam(query.offset, 0),
  });

  return reply.status(200).send(results);
}

async function handleDelete(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as DeleteMemoryQuery;

  if (!query.id) {
    return reply.status(400).send({ error: "Query parameter 'id' is required" });
  }

  // Check ownership
  const existing = getMemory(query.id);
  if (!existing) {
    return reply.status(404).send({ error: "Memory not found" });
  }
  if (existing.userId !== request.userId!) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  deleteMemory(query.id);
  return reply.status(204).send();
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  // Ensure the memory database schema is initialized on first route registration
  // (idempotent — only creates tables if they don't exist)
  initSchema();

  app.post("/api/memory/create", handleCreate);
  app.get("/api/memory/list", handleList);
  app.get("/api/memory/search", handleSearch);
  app.delete("/api/memory/delete", handleDelete);
}
