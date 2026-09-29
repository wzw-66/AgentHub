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
