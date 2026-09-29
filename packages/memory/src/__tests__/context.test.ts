import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory } from "../repository.js";
import { buildMemoryContext } from "../context.js";
import { configureSearch, resetSearchDepsForTesting, searchMemories } from "../search.js";
import { setBm25ReadyForTesting } from "../worker.js";
import { FakeSegmenter } from "./fakes.js";

const seg = new FakeSegmenter(["缩进", "用户", "偏好", "连接池", "格式化", "脚本"]);
let db: DatabaseType;

beforeEach(() => {
  db = createTestDb();
  // `createTestDb` 只建表，不跑启动期的重建。索引就绪必须**显式**声明：
  // `isBm25Ready()` 默认 false 时 BM25 路整条跳过（Task 13 的刻意设计），
  // 检索会静默返回 `[]`，让所有断言以「实现坏了」的样子红 —— 与实现无关。
  setBm25ReadyForTesting(true);
  configureSearch({ segmenter: seg });
});

afterEach(() => {
  resetSearchDepsForTesting();
  destroyTestDb(db);
});

/**
 * 写入侧显式传 `seg`（而不是靠 `setDefaultSegmenter` 的默认词表）——
 * 写入与查询必须共用**同一个**分词器，否则索引里的词项与查询切出的词项对不上，
 * 该行会被静默漏掉（spec §8.3）。
 */
function seed(content: string, conversationId = "c1") {
  return createMemory({
    userId: "u1",
    conversationId,
    agentId: "a1",
    type: "preference",
    content,
  }, db, seg);
}

/** 从渲染结果里取回条目行，忽略空行。 */
function entriesOf(block: string): string[] {
  return block.split("\n\n").filter((s) => s.startsWith("[Memory"));
}

describe("buildMemoryContext", () => {
  it("returns undefined when there are no memories", async () => {
    const out = await buildMemoryContext({
      userId: "u1", conversationId: "c1", query: "缩进", customDb: db,
    });
    expect(out).toBeUndefined();
  });

  it("formats memories with their type label", async () => {
    seed("用户偏好缩进");
    const out = await buildMemoryContext({
      userId: "u1", conversationId: "c1", query: "缩进", customDb: db,
    });
    expect(out).toContain("[Memory - preference]");
    expect(out).toContain("用户偏好缩进");
  });

  it("only returns memories from the requested conversation", async () => {
    seed("用户偏好缩进 in project A", "conv-a");
    seed("用户偏好缩进 in project B", "conv-b");

    const a = await buildMemoryContext({
      userId: "u1", conversationId: "conv-a", query: "缩进", customDb: db,
    });
    expect(a).toContain("project A");
    expect(a).not.toContain("project B");
  });

  it("stops adding memories once the token budget is exhausted", async () => {
    for (let i = 0; i < 20; i++) {
      seed(`用户偏好缩进 number ${i} with quite a lot of extra padding text to consume budget`);
    }

    const out = await buildMemoryContext({
      userId: "u1", conversationId: "c1", query: "缩进", tokenBudget: 40, customDb: db,
    });

    expect(out).toBeDefined();
    // 40 token ≈ 160 字符；每条约 80 字符，因此最多 2-3 条
    const entries = entriesOf(out!);
    expect(entries.length).toBeLessThan(5);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("returns undefined rather than an empty string when nothing fits", async () => {
    seed("用户偏好缩进 with a very long tail that definitely exceeds a tiny budget");
    const out = await buildMemoryContext({
      userId: "u1", conversationId: "c1", query: "缩进", tokenBudget: 1, customDb: db,
    });
    expect(out).toBeUndefined();
  });

  it("uses 800 tokens as the default budget", async () => {
    // 每条约 400 字符 ≈ 100 tokens；10 条 ≈ 1000 tokens，塞不进默认的 800。
    for (let i = 0; i < 10; i++) seed(`用户偏好缩进 ${i} ` + "pad ".repeat(93));

    const byDefault = await buildMemoryContext({
      userId: "u1", conversationId: "c1", query: "缩进", customDb: db,
    });
    const explicit = await buildMemoryContext({
      userId: "u1", conversationId: "c1", query: "缩进", tokenBudget: 800, customDb: db,
    });

    expect(byDefault).toBeDefined();
    // 默认值就是 800 —— 换个数字这条立刻红。
    expect(byDefault).toBe(explicit);
    const entries = entriesOf(byDefault!);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThan(10);
  });

  it("still caps the number of memories when the budget is huge", async () => {
    // 预算是「能塞多少 token」的上限，不是唯一上限：条数本身也要有硬上界，
    // 否则一次检索可以把几百条短事实全部拼进提示词。
    for (let i = 0; i < 30; i++) seed(`用户偏好缩进 short fact ${i}`);

    const out = await buildMemoryContext({
      userId: "u1", conversationId: "c1", query: "缩进", tokenBudget: 100_000, customDb: db,
    });

    expect(entriesOf(out!).length).toBe(20);
  });

  it("agrees with a direct searchMemories call for the same conversation", async () => {
    // spec §13「路径一致」：同一个 conversationId 走 `buildMemoryContext` 与直接
    // `searchMemories`，结果必须一致 —— 防的是「两条链路的作用域参数漏传其中一个」。
    // 只断言「包含某条」是不够的：漏传 conversationId 时另一条会话的记忆会**额外**
    // 出现，包含式断言照样绿。
    seed("用户偏好缩进 in this project", "c1");
    seed("用户偏好缩进 in another project", "c2");

    const direct = await searchMemories(
      { query: "缩进", userId: "u1", scope: { conversationId: "c1" } },
      db,
    );
    const block = await buildMemoryContext({
      userId: "u1", conversationId: "c1", query: "缩进", customDb: db,
    });

    expect(entriesOf(block!)).toEqual(
      direct.map((m) => `[Memory - ${m.type}] ${m.content}`),
    );
  });

  it("never throws when the underlying search fails", async () => {
    seed("用户偏好缩进");
    // 用**真的**坏掉的库而不是一个正常的空库：空库上「检索失败」与「没有记忆」
    // 都返回 undefined，这条测试就什么都没验到。
    const broken = createTestDb();
    destroyTestDb(broken);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        buildMemoryContext({ userId: "u1", conversationId: "c1", query: "缩进", customDb: broken }),
      ).resolves.toBeUndefined();
      // 降级可以，静默不行 —— 与 orchestrator 原来的裸 catch 修正一致。
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
