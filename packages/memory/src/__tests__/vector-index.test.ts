import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory } from "../repository.js";
import { createBlobVectorIndex, toFloat32View } from "../vector-index.js";
import { normalize } from "../embedding.js";
import { FakeSegmenter } from "./fakes.js";

const seg = new FakeSegmenter(["缩进", "用户", "偏好"]);

let db: DatabaseType;
let index: ReturnType<typeof createBlobVectorIndex>;

beforeEach(() => {
  db = createTestDb();
  // 级联删除要求外键打开（生产库在 db.ts 里开，测试库按本包惯例局部开，
  // 见 worker.test.ts / migrations.test.ts）。
  db.pragma("foreign_keys = ON");
  index = createBlobVectorIndex(db);
});

afterEach(() => {
  destroyTestDb(db);
});

function seedMemory(id: string, userId: string, conversationId: string) {
  return createMemory({
    userId,
    conversationId,
    agentId: "agent-vi",
    type: "fact",
    content: `memory ${id}`,
  }, db, seg);
}

describe("BlobVectorIndex", () => {
  it("stores a vector and finds it by exact match", () => {
    const mem = seedMemory("m1", "u1", "c1");
    index.upsert(mem.id, normalize(new Float32Array([1, 0, 0])), "fp", "model-a");

    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });

    expect(hits.length).toBe(1);
    expect(hits[0]!.memoryId).toBe(mem.id);
    expect(hits[0]!.score).toBeCloseTo(1, 5);
  });

  it("ranks by descending cosine similarity", () => {
    const a = seedMemory("a", "u1", "c1");
    const b = seedMemory("b", "u1", "c1");
    index.upsert(a.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.upsert(b.id, normalize(new Float32Array([0, 1, 0])), "fp", "m");

    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });

    expect(hits.map((h) => h.memoryId)).toEqual([a.id, b.id]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it("respects the k limit", () => {
    for (let i = 0; i < 5; i++) {
      const m = seedMemory(`m${i}`, "u1", "c1");
      index.upsert(m.id, normalize(new Float32Array([1, i + 1, 0])), "fp", "m");
    }

    const hits = index.search(new Float32Array([1, 0, 0]), 2, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    expect(hits.length).toBe(2);
  });

  it("excludes vectors from another conversation", () => {
    const mine = seedMemory("mine", "u1", "c-mine");
    const theirs = seedMemory("theirs", "u1", "c-theirs");
    index.upsert(mine.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.upsert(theirs.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");

    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c-mine" },
    });

    expect(hits.map((h) => h.memoryId)).toEqual([mine.id]);
  });

  it("excludes vectors belonging to another user", () => {
    const mine = seedMemory("u1-mem", "u1", "c1");
    const other = seedMemory("u2-mem", "u2", "c1");
    index.upsert(mine.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.upsert(other.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");

    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    expect(hits.map((h) => h.memoryId)).toEqual([mine.id]);
  });

  it("returns vectors from every conversation under allConversations", () => {
    const a = seedMemory("a", "u1", "c-a");
    const b = seedMemory("b", "u1", "c-b");
    index.upsert(a.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.upsert(b.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");

    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { allConversations: true },
    });
    expect(hits.length).toBe(2);
  });

  it("still excludes another user's vectors under allConversations", () => {
    // 「跳过会话过滤」不等于「跳过用户过滤」—— userId 在任何作用域下都是硬边界。
    const mine = seedMemory("mine", "u1", "c-a");
    const other = seedMemory("other", "u2", "c-a");
    index.upsert(mine.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.upsert(other.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");

    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { allConversations: true },
    });
    expect(hits.map((h) => h.memoryId)).toEqual([mine.id]);
  });

  it("replaces the vector when the same memory is upserted twice", () => {
    const mem = seedMemory("m1", "u1", "c1");
    index.upsert(mem.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.upsert(mem.id, normalize(new Float32Array([0, 1, 0])), "fp", "m");

    expect(index.size()).toBe(1);
    const hits = index.search(new Float32Array([0, 1, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    expect(hits[0]!.score).toBeCloseTo(1, 5);
  });

  it("removes a vector", () => {
    const mem = seedMemory("m1", "u1", "c1");
    index.upsert(mem.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.remove(mem.id);
    expect(index.size()).toBe(0);
  });

  it("cascade-deletes the vector row when the memory is deleted", () => {
    const mem = seedMemory("m1", "u1", "c1");
    index.upsert(mem.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");

    db.prepare("DELETE FROM memory_records WHERE id = ?").run(mem.id);

    expect(index.size()).toBe(0);
  });

  it("returns an empty array when there is nothing to search", () => {
    const hits = index.search(new Float32Array([1, 0, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    expect(hits).toEqual([]);
  });

  it("handles a query vector of a different length than stored vectors without returning garbage", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m1 = seedMemory("m1", "u1", "c1");
    const m2 = seedMemory("m2", "u1", "c1");
    index.upsert(m1.id, normalize(new Float32Array([1, 0, 0])), "fp", "m");
    index.upsert(m2.id, normalize(new Float32Array([0, 1, 0])), "fp", "m");

    const hits = index.search(new Float32Array([1, 0]), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });
    // 维度不匹配的行必须被跳过，而不是拿截断/补零的结果参与排序
    expect(hits).toEqual([]);

    // 但跳过**不能是静默的**：换 dim 后整个向量路会回 `[]`，与「没有相关记忆」
    // 在调用方看完全一样。日志必须同时给出「存的维度」与「查询的维度」。
    const warnings = warn.mock.calls.map(([m]) => String(m));
    // 每次检索只警告一次，不是每行一次（换 dim 后库里可能有上万行不匹配）
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("dim=3");
    expect(warnings[0]).toContain("dim=2");

    warn.mockRestore();
  });

  it("scores by dot product, which equals cosine only because vectors are normalized", () => {
    // spec §13 列出的五个最重要测试之一：实现只做点积、不做任何缩放，
    // 「向量已归一化」这个前提是 0.96 成立的唯一原因。若上游漏了归一化，
    // 点积会被当作余弦使用，排序静默出错。
    const mem = seedMemory("m1", "u1", "c1");
    const stored = [3, 4, 0]; // |v| = 5
    const query = [4, 3, 0]; // |v| = 5

    // 期望值由余弦定义独立算出，不反向调用被测实现
    const rawDot = 3 * 4 + 4 * 3 + 0 * 0; // 24
    const cosine = rawDot / (Math.hypot(...stored) * Math.hypot(...query)); // 0.96

    index.upsert(mem.id, normalize(new Float32Array(stored)), "fp", "m");
    const hits = index.search(normalize(new Float32Array(query)), 5, {
      userId: "u1",
      scope: { conversationId: "c1" },
    });

    expect(hits[0]!.score).toBeCloseTo(cosine, 6);
    // 同一对向量未归一化时的点积是 24 —— 与 0.96 相差两个数量级，
    // 说明「已归一化」这个前提确实在承重，不是可有可无的装饰。
    expect(rawDot).not.toBeCloseTo(cosine, 2);
  });
});

describe("toFloat32View", () => {
  it("builds a zero-copy view when the buffer offset is 4-byte aligned", () => {
    const src = new Float32Array([1, 0, 0]);
    const buf = Buffer.from(src.buffer); // 与 src 共享内存，byteOffset 为 0
    expect(buf.byteOffset % 4).toBe(0);

    const view = toFloat32View(buf, 3);

    expect(Array.from(view)).toEqual([1, 0, 0]);
    // 零拷贝：视图直接坐在原 buffer 上，而不是复制一份
    expect(view.buffer).toBe(buf.buffer);
  });

  it("falls back to copying when the buffer offset is not 4-byte aligned", () => {
    // 未对齐时 `new Float32Array(buf.buffer, byteOffset, dim)` 会抛
    // RangeError（spec §12：应回退到复制路径而非抛错）。
    const backing = new ArrayBuffer(4 * 3 + 2);
    const buf = Buffer.from(backing, 2, 12); // byteOffset = 2
    expect(buf.byteOffset % 4).toBe(2);
    Buffer.from(new Float32Array([0.5, -0.25, 0.125]).buffer).copy(buf);

    const view = toFloat32View(buf, 3);

    expect(Array.from(view)).toEqual([0.5, -0.25, 0.125]);
    expect(view.buffer).not.toBe(backing);
  });
});
