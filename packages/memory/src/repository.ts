import type { MemoryRecord, MemoryType } from "@agenthub/shared";
import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import type { CreateMemoryInput } from "./types.js";
import { rowToMemoryRecord } from "./utils.js";
import type { Segmenter } from "./segmenter.js";
import { createJiebaSegmenter } from "./segmenter.js";
import { randomUUID } from "node:crypto";

let defaultSegmenter: Segmenter | undefined;

/** 延迟创建 —— 默认分词器要加载 jieba 词典，不在模块顶层做。 */
function resolveSegmenter(explicit?: Segmenter): Segmenter {
  if (explicit) return explicit;
  if (!defaultSegmenter) defaultSegmenter = createJiebaSegmenter();
  return defaultSegmenter;
}

/** 仅测试用：注入一个确定性分词器，避免依赖 jieba 词典。 */
export function setDefaultSegmenter(seg: Segmenter): void {
  defaultSegmenter = seg;
}

export function createMemory(
  input: CreateMemoryInput,
  customDb?: Database,
  segmenter?: Segmenter,
): MemoryRecord {
  const db = customDb || getDatabase();
  const seg = resolveSegmenter(segmenter);
  const id = randomUUID();
  const tagsJson = JSON.stringify(input.tags ?? []);
  const now = new Date().toISOString();

  // 分词在写入侧完成 —— SQLite 触发器无法调用 JS 分词器（spec §6.1）。
  // 写入与查询必须用同一个分词器：中文 tag 整词在 unicode61 下是**一个** token，
  // 查询侧却被切成两个词并 OR 展开，两端不一致会让该行被静默漏掉（spec §8.3）。
  const contentSeg = seg.cut(input.content).join(" ");
  const tagsSeg = (input.tags ?? []).flatMap((t) => seg.cut(t)).join(" ");

  db.prepare(`
    INSERT INTO memory_records (id, user_id, agent_id, type, content, content_seg, tags, tags_seg, source_message_id, conversation_id, importance, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.userId,
    input.agentId,
    input.type,
    input.content,
    contentSeg,
    tagsJson,
    tagsSeg,
    input.sourceMessageId ?? null,
    input.conversationId,
    input.importance ?? 1,
    now,
    now,
  );

  return getMemory(id, db) as MemoryRecord;
}

export function getMemory(id: string, customDb?: Database): MemoryRecord | null {
  const db = customDb || getDatabase();
  const row = db.prepare("SELECT * FROM memory_records WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToMemoryRecord(row) : null;
}

export function listMemories(
  params: {
    userId: string;
    agentId?: string;
    type?: MemoryType;
    limit?: number;
    offset?: number;
  },
  customDb?: Database,
): { data: MemoryRecord[]; total: number } {
  const db = customDb || getDatabase();

  const conditions: string[] = ["user_id = ?"];
  const values: unknown[] = [params.userId];

  if (params.agentId) {
    conditions.push("agent_id = ?");
    values.push(params.agentId);
  }
  if (params.type) {
    conditions.push("type = ?");
    values.push(params.type);
  }

  const where = conditions.join(" AND ");
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const totalRow = db
    .prepare(`SELECT COUNT(*) as count FROM memory_records WHERE ${where}`)
    .get(...values) as { count: number };
  const total = totalRow.count;

  const rows = db
    .prepare(`SELECT * FROM memory_records WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...values, limit, offset) as Record<string, unknown>[];

  return {
    data: rows.map(rowToMemoryRecord),
    total,
  };
}

export function deleteMemory(id: string, customDb?: Database): void {
  const db = customDb || getDatabase();
  db.prepare("DELETE FROM memory_records WHERE id = ?").run(id);
}

/**
 * 真正的 UPDATE —— **保留 `id` 与 `created_at`**，仅刷新 `updated_at`。
 *
 * 修复 spec §4.4：旧实现把「更新」写成 `delete + create`，导致 id 变更
 * （`sourceMessageId` 溯源链断裂）、`created_at` 重置（丢失记忆年龄）、
 * 向量行成孤儿污染检索。
 *
 * 内容变更时**删除该 id 的向量行而非重算** —— 使 `updateMemory` 保持同步，
 * 并复用待嵌入队列（`listPendingEmbeddings` 是 LEFT JOIN 指纹），由 worker
 * 异步补齐（spec §9.5）。指纹是 `model:dim:mode`，它检测不到内容变化，
 * 所以「失效」这件事只能由写入方显式做。
 *
 * **tags 变更时也删，但那属于保险而非必需：** worker 只对 `content` 做嵌入
 * （worker.ts 的 `embedDocuments(items.map((item) => item.content))`），tags
 * 从不进入向量文本，因此 tags 变更最多让 worker 白算一次；它对检索的真正影响
 * 由 `tags_seg` + FTS 触发器承担。保留是为了统一「派生数据变更即失效」这一条
 * 规则，**不要据此推断 tags 参与向量**。
 *
 * 返回 `null` 表示 id 不存在 —— 与 `getMemory` 的约定一致，不抛错。
 */
export function updateMemory(
  id: string,
  patch: { type?: MemoryType; content?: string; tags?: string[]; importance?: number },
  customDb?: Database,
  segmenter?: Segmenter,
): MemoryRecord | null {
  const db = customDb || getDatabase();
  const existing = getMemory(id, db);
  if (!existing) return null;

  const seg = resolveSegmenter(segmenter);
  const now = new Date().toISOString();

  // 只把 patch 里出现过的字段放进 SET —— 未出现的字段原样保留。
  const sets: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  if (patch.type !== undefined) {
    sets.push("type = ?");
    values.push(patch.type);
  }

  const contentChanged = patch.content !== undefined && patch.content !== existing.content;
  if (patch.content !== undefined) {
    sets.push("content = ?");
    values.push(patch.content);
    // content_seg 必须由写入侧计算，触发器调不到 JS 分词器（spec §6.1）。
    // 只能用 patch 里的新值算：拿旧值重算会把索引改回陈旧内容。
    sets.push("content_seg = ?");
    values.push(seg.cut(patch.content).join(" "));
  }

  const tagsChanged =
    patch.tags !== undefined && JSON.stringify(patch.tags) !== JSON.stringify(existing.tags);
  if (patch.tags !== undefined) {
    sets.push("tags = ?");
    values.push(JSON.stringify(patch.tags));
    sets.push("tags_seg = ?");
    values.push(patch.tags.flatMap((t) => seg.cut(t)).join(" "));
  }

  if (patch.importance !== undefined) {
    sets.push("importance = ?");
    values.push(patch.importance);
  }

  const txn = db.transaction(() => {
    db.prepare(`UPDATE memory_records SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
    if (contentChanged || tagsChanged) {
      // 删行即「重新入队」：worker 按「缺向量或有旧指纹」挑选待嵌入项。
      // 不在这里重算 —— 那会把网络调用带进同步签名（spec §9.5）。
      // WHERE 不可省：只能删**该 id** 的行（spec §9.5），否则一次编辑会清空
      // 整个向量索引，把全库记忆打回待嵌入。
      db.prepare("DELETE FROM memory_embeddings WHERE memory_id = ?").run(id);
    }
  });
  txn();

  return getMemory(id, db);
}

/**
 * 按 id 批量取回完整记录，**保持传入的顺序**。
 *
 * 融合层只产出 id 与分数，需要回查完整记录。SQL 的 `IN` 不保证顺序，
 * 所以在 JS 侧重排 —— 顺序就是融合的结论，不能被数据库打乱。
 */
export function getMemoriesByIds(ids: string[], customDb?: Database): MemoryRecord[] {
  if (ids.length === 0) return [];
  const db = customDb || getDatabase();

  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT * FROM memory_records WHERE id IN (${placeholders})`)
    .all(...ids) as Record<string, unknown>[];

  const byId = new Map(rows.map((r) => [r["id"] as string, rowToMemoryRecord(r)]));
  return ids.map((id) => byId.get(id)).filter((m): m is MemoryRecord => m !== undefined);
}
