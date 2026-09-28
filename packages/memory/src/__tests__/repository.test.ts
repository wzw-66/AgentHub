import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory, getMemory, listMemories, deleteMemory } from "../repository.js";

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
