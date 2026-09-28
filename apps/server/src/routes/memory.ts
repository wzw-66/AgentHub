import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MemoryType } from "@agenthub/shared";
import {
  createMemory,
  getDatabase,
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
  /** 必填 —— 检索作用域的唯一依据（spec §1.1）。缺失会写入一条永不召回的孤儿记忆。 */
  conversationId: string;
  tags?: string[];
  sourceMessageId?: string;
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
    VALID_MEMORY_TYPES.includes(b.type) &&
    typeof b.conversationId === "string" &&
    b.conversationId.length > 0
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

  // 无主记忆（conversation_id IS NULL）在任何会话作用域下都检索不到 —— 这是
  // 迁移已知的、被接受的损失（spec §9.6），但损失必须可见：部署方靠这个计数
  // 判断是否需要跑那次一次性回填。按请求者过滤，不是一个全局计数。
  const orphanRow = getDatabase()
    .prepare(
      "SELECT COUNT(*) AS count FROM memory_records WHERE user_id = ? AND conversation_id IS NULL",
    )
    .get(request.userId!) as { count: number };

  return reply.status(200).send({ ...result, orphanCount: orphanRow.count });
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
    // Web UI 的手动搜索语义就是「翻所有记忆」，不受会话作用域限制（spec §4.2、§11）。
    // 这是唯一该传 allConversations 的地方 —— 自动注入提示词的检索一律传 conversationId。
    scope: { allConversations: true },
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
