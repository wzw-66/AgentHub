import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory, getMemory, listMemories, deleteMemory, updateMemory } from "../repository.js";
import { createBlobVectorIndex } from "../vector-index.js";
import { FakeSegmenter } from "./fakes.js";

// 词表刻意**不含**「代码风格」：FakeSegmenter 是最长匹配，词表里有整词就不会切开它，
// 那样 tags_seg 断言会永远拿不到「代码 风格」—— 也就测不出「中文 tag 必须被切成
// 查询侧能匹配到的词」这个性质本身。这里放的是 jieba 会切出的子词。
const seg = new FakeSegmenter(["缩进", "用户", "偏好", "代码", "风格"]);

let db: DatabaseType;

beforeAll(() => {
  db = createTestDb();
});

afterAll(() => {
  destroyTestDb(db);
});

const MOCK_INPUT = {
  userId: "user-1",
  conversationId: "conv-1",
  agentId: "agent-1",
  type: "fact" as const,
  content: "The project uses TypeScript 6 with strict mode",
  tags: ["typescript", "config"],
  importance: 7,
};

describe("createMemory", () => {
  it("creates a memory record and returns it", () => {
    const result = createMemory(MOCK_INPUT, db);
    expect(result.id).toBeTruthy();
    expect(result.userId).toBe("user-1");
    expect(result.agentId).toBe("agent-1");
    expect(result.type).toBe("fact");
    expect(result.content).toBe(MOCK_INPUT.content);
    expect(result.tags).toEqual(["typescript", "config"]);
    expect(result.importance).toBe(7);
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
  });

  it("creates with sourceMessageId and conversationId", () => {
    const result = createMemory({
      ...MOCK_INPUT,
      content: "memory with source",
      sourceMessageId: "msg-123",
      conversationId: "conv-456",
    }, db);
    expect(result.sourceMessageId).toBe("msg-123");
    expect(result.conversationId).toBe("conv-456");
  });

  it("defaults importance to 1 when not provided", () => {
    const result = createMemory({
      userId: "user-1",
      conversationId: "conv-1",
      agentId: "agent-1",
      type: "context",
      content: "default importance",
    }, db);
    expect(result.importance).toBe(1);
  });
});

describe("conversation scoping in createMemory", () => {
  it("persists conversation_id as a non-null value equal to the input", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-abc",
      agentId: "agent-1",
      type: "fact",
      content: "conversation id round-trip",
    }, db);

    expect(created.conversationId).toBe("conv-abc");

    // 直接查库，确认落库的是真实值而非依赖 rowToMemoryRecord 的转换
    const raw = db
      .prepare("SELECT conversation_id FROM memory_records WHERE id = ?")
      .get(created.id) as { conversation_id: string | null };
    expect(raw.conversation_id).toBe("conv-abc");
    expect(raw.conversation_id).not.toBeNull();
  });

  it("rejects a missing conversationId at compile time", () => {
    // @ts-expect-error conversationId 必填：漏传必须是编译错误，不能静默写入孤儿记忆
    const buildOrphan = () => createMemory({ userId: "u", agentId: "a", type: "fact", content: "orphan" }, db);
    // 只验证类型层面被拦截，不实际执行 —— 类型测试由 `tsc --noEmit` 把关
    expect(typeof buildOrphan).toBe("function");
  });
});

describe("segmented columns", () => {
  it("populates content_seg with space-joined terms", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-seg",
      agentId: "agent-1",
      type: "preference",
      content: "用户偏好缩进",
    }, db, seg);

    const raw = db
      .prepare("SELECT content_seg FROM memory_records WHERE id = ?")
      .get(created.id) as { content_seg: string | null };
    expect(raw.content_seg).toBe("用户 偏好 缩进");
  });

  it("populates tags_seg by segmenting every tag and flattening", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-seg",
      agentId: "agent-1",
      type: "preference",
      content: "用户偏好缩进",
      tags: ["代码风格", "偏好"],
    }, db, seg);

    const raw = db
      .prepare("SELECT tags_seg FROM memory_records WHERE id = ?")
      .get(created.id) as { tags_seg: string | null };
    // 「代码风格」必须被切开，否则 unicode61 下它是一个 token，
    // 而查询侧的「代码 风格」永远匹配不到它（spec §8.3）
    expect(raw.tags_seg).toBe("代码 风格 偏好");
  });

  it("stores an empty string, not null, when content yields no terms", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-seg",
      agentId: "agent-1",
      type: "fact",
      content: "   ",
    }, db, seg);

    const raw = db
      .prepare("SELECT content_seg FROM memory_records WHERE id = ?")
      .get(created.id) as { content_seg: string | null };
    expect(raw.content_seg).toBe("");
  });

  it("stores an empty string, not null, when a memory has no tags", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-seg",
      agentId: "agent-1",
      type: "fact",
      content: "用户偏好缩进",
    }, db, seg);

    const raw = db
      .prepare("SELECT tags_seg FROM memory_records WHERE id = ?")
      .get(created.id) as { tags_seg: string | null };
    expect(raw.tags_seg).toBe("");
  });

  it("keeps the original content and tags untouched for display", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-seg",
      agentId: "agent-1",
      type: "preference",
      content: "用户偏好缩进",
      tags: ["代码风格"],
    }, db, seg);

    expect(created.content).toBe("用户偏好缩进");
    expect(created.tags).toEqual(["代码风格"]);
  });
});

describe("getMemory", () => {
  it("returns null for non-existent id", () => {
    expect(getMemory("non-existent", db)).toBeNull();
  });

  it("returns the memory record for an existing id", () => {
    const created = createMemory({ ...MOCK_INPUT, content: "get-test" }, db);
    const fetched = getMemory(created.id, db);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.content).toBe("get-test");
  });
});

describe("listMemories", () => {
  it("returns memories filtered by userId", () => {
    // Create memories for two users
    createMemory({ ...MOCK_INPUT, content: "user2 memory" }, db);
    const result = listMemories({ userId: "user-1" }, db);
    expect(result.data.length).toBeGreaterThanOrEqual(3); // all previous test data
    result.data.forEach((m) => {
      expect(m.userId).toBe("user-1");
    });
  });

  it("filters by agentId when provided", () => {
    createMemory({
      userId: "user-1",
      conversationId: "conv-1",
      agentId: "filter-agent",
      type: "fact",
      content: "filter by agent",
    }, db);
    const result = listMemories({ userId: "user-1", agentId: "filter-agent" }, db);
    expect(result.data.length).toBe(1);
    expect(result.data[0]!.agentId).toBe("filter-agent");
  });

  it("filters by type when provided", () => {
    createMemory({
      userId: "user-1",
      conversationId: "conv-1",
      agentId: "agent-1",
      type: "preference",
      content: "type filter test",
    }, db);
    const result = listMemories({ userId: "user-1", type: "preference" }, db);
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    result.data.forEach((m) => {
      expect(m.type).toBe("preference");
    });
  });

  it("respects limit and offset", () => {
    const result = listMemories({ userId: "user-1", limit: 1, offset: 0 }, db);
    expect(result.data.length).toBe(1);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});

describe("deleteMemory", () => {
  it("deletes an existing memory record", () => {
    const created = createMemory({ ...MOCK_INPUT, content: "to-delete" }, db);
    const id = created.id;

    deleteMemory(id, db);
    expect(getMemory(id, db)).toBeNull();
  });

  it("does not throw when deleting non-existent record", () => {
    expect(() => deleteMemory("non-existent", db)).not.toThrow();
  });
});

describe("updateMemory", () => {
  it("keeps the id and created_at, and refreshes updated_at", async () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "preference",
      content: "用户偏好缩进",
    }, db, seg);

    await new Promise((r) => setTimeout(r, 5)); // 让 updated_at 有可观测的差异

    const updated = updateMemory(created.id, { content: "用户偏好缩进改两格" }, db, seg);

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(created.id);
    expect(updated!.createdAt).toBe(created.createdAt);
    expect(updated!.content).toBe("用户偏好缩进改两格");
    expect(updated!.updatedAt).not.toBe(created.updatedAt);
  });

  it("recomputes content_seg when content changes", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "fact",
      content: "用户偏好缩进",
    }, db, seg);

    updateMemory(created.id, { content: "用户偏好" }, db, seg);

    const raw = db.prepare("SELECT content_seg FROM memory_records WHERE id = ?")
      .get(created.id) as { content_seg: string };
    expect(raw.content_seg).toBe("用户 偏好");
  });

  it("recomputes tags_seg when tags change", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "fact",
      content: "用户偏好缩进",
      tags: ["代码风格"],
    }, db, seg);

    updateMemory(created.id, { tags: ["偏好"] }, db, seg);

    const raw = db.prepare("SELECT tags_seg FROM memory_records WHERE id = ?")
      .get(created.id) as { tags_seg: string };
    expect(raw.tags_seg).toBe("偏好");
  });

  it("drops the vector row when content changes so the worker recomputes it", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "fact",
      content: "用户偏好缩进",
    }, db, seg);
    const index = createBlobVectorIndex(db);
    index.upsert(created.id, new Float32Array([1, 0, 0]), "fp", "m");
    expect(index.size()).toBe(1);

    updateMemory(created.id, { content: "完全不同的一段内容" }, db, seg);

    expect(index.size()).toBe(0);
  });

  it("keeps the vector row when only importance changes", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "fact",
      content: "用户偏好缩进",
    }, db, seg);
    const index = createBlobVectorIndex(db);
    index.upsert(created.id, new Float32Array([1, 0, 0]), "fp", "m");

    updateMemory(created.id, { importance: 9 }, db, seg);

    expect(index.size()).toBe(1);
  });

  it("returns null for a non-existent id", () => {
    expect(updateMemory("no-such-id", { content: "x" }, db, seg)).toBeNull();
  });

  it("leaves unspecified fields untouched", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "preference",
      content: "用户偏好缩进",
      tags: ["代码风格"],
      importance: 4,
    }, db, seg);

    const updated = updateMemory(created.id, { importance: 7 }, db, seg);

    expect(updated!.content).toBe("用户偏好缩进");
    expect(updated!.tags).toEqual(["代码风格"]);
    expect(updated!.type).toBe("preference");
    expect(updated!.importance).toBe(7);
  });

  // 下面两条用**按 memory_id 计数**而不是 index.size()：后者是全表 COUNT(*)，
  // 而同级更早的用例会留下自己的向量行 —— 用全表计数就等于断言一个与本人
  // 无关的常量，既测不出东西，还会随用例顺序漂移。
  const vectorRowCount = (memoryId: string): number =>
    (db.prepare("SELECT COUNT(*) AS count FROM memory_embeddings WHERE memory_id = ?")
      .get(memoryId) as { count: number }).count;

  it("drops the vector row when tags change (tags_seg is indexed too)", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "fact",
      content: "用户偏好缩进",
      tags: ["代码风格"],
    }, db, seg);
    createBlobVectorIndex(db).upsert(created.id, new Float32Array([1, 0, 0]), "fp", "m");
    expect(vectorRowCount(created.id)).toBe(1);

    updateMemory(created.id, { tags: ["格式"] }, db, seg);

    expect(vectorRowCount(created.id)).toBe(0);
  });

  it("keeps the vector row when the patch repeats the content it already had", () => {
    const created = createMemory({
      userId: "user-1",
      conversationId: "conv-upd",
      agentId: "agent-1",
      type: "fact",
      content: "用户偏好缩进",
    }, db, seg);
    createBlobVectorIndex(db).upsert(created.id, new Float32Array([1, 0, 0]), "fp", "m");

    // 判据必须是「值变了」，不是「字段出现了」—— 否则一次无实质变化的
    // 回写就会白扔掉一个仍然有效的向量，逼 worker 重算。
    const updated = updateMemory(created.id, { content: "用户偏好缩进" }, db, seg);

    expect(updated!.content).toBe("用户偏好缩进");
    expect(vectorRowCount(created.id)).toBe(1);
  });
});
