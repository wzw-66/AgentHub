import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MemoryType } from "@agenthub/shared";
import {
  buildFingerprint,
  createMemory,
  getDatabase,
  getMemory,
  listMemories,
  pendingEmbeddingCount,
  searchMemories,
  deleteMemory,
  initSchema,
} from "@agenthub/memory";
import { config as appConfig } from "../config/env.js";

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

  const db = getDatabase();

  // 无主记忆（conversation_id IS NULL）在任何会话作用域下都检索不到 —— 这是
  // 迁移已知的、被接受的损失（spec §9.6），但损失必须可见：部署方靠这个计数
  // 判断是否需要跑那次一次性回填。按请求者过滤，不是一个全局计数。
  const orphanRow = db
    .prepare(
      "SELECT COUNT(*) AS count FROM memory_records WHERE user_id = ? AND conversation_id IS NULL",
    )
    .get(request.userId!) as { count: number };

  // 待嵌入计数（spec §12）。两个要点，字段名里的 `global` 与 `pending` 各占一个：
  //
  // **`pending`：这是「这个模型的队列」** —— 判据是「没有一条指纹匹配的向量行」，
  // 所以它必须拿到当前配置的指纹，否则换了模型以后旧向量会被当成已完成的工作，
  // 队列看起来是空的而索引里全是另一个向量空间的数据。指纹走 `buildFingerprint`，
  // 与 provider 用的是同一个定义。
  //
  // **`global`：这个计数刻意是进程级的，不按请求者过滤**（与上面那个按
  // `request.userId` 过滤的 `orphanCount` 不同）。理由是它的用途是**运维可观测性** ——
  // spec §12 要它「使『向量路落后多少』可观测」—— 而 worker 是无用户概念的单进程，
  // 它要消化的就是整个记忆库的积压。按请求者切一刀只会得到一个对不上 worker 实际
  // 进度的小数字，反而误导；而且 `memory_embeddings` 没有 user 列，按用户过滤得给
  // `pendingEmbeddingCount` 加参数，偏离 spec §6.2/§8.6 钉死的签名。泄露的是一个
  // 计数，不是别人的记忆内容。
  //
  // 向量路未配置时传 `undefined`：那时没有任何指纹算「匹配」，计数退化为
  // 「从未算过向量的记忆条数」。这不是 0 —— 造一个假的 0 正是本项目要根除的
  // 静默错误值。语义与 worker 的 `pendingCount()` 在未配置时一致。
  const embedding = appConfig.embedding;
  const globalPendingCount = pendingEmbeddingCount(
    db,
    embedding ? buildFingerprint(embedding.model, embedding.dim, embedding.mode) : undefined,
  );

  return reply
    .status(200)
    .send({ ...result, orphanCount: orphanRow.count, globalPendingCount });
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
