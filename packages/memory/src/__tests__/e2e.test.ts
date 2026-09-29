import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory, setDefaultSegmenter } from "../repository.js";
import { searchMemories, configureSearch, resetSearchDepsForTesting } from "../search.js";
import { buildMemoryContext } from "../context.js";
import { extractMemories } from "../extractor.js";
import { buildFtsQuery } from "../fts-query.js";
import { createBlobVectorIndex, type VectorIndex } from "../vector-index.js";
import type { MemoryScope } from "../types.js";
import { startEmbeddingWorker, setBm25ReadyForTesting, reindexMemories } from "../worker.js";
import { FakeEmbeddingProvider, FakeSegmenter } from "./fakes.js";

/**
 * 本文件是**唯一**的端到端用例：前面每个 task 都只验自己那一环，这里把
 * 「消息 → 提取 → 存储 → 双路召回 → 注入」整条链跑通（spec §7.1）。
 *
 * 因此它刻意不复刻各单元测试的边界条件，只回答一个问题：这些部件**接在一起**
 * 还成立吗？凡是能用「某一路被单独关掉后仍能召回」表达的地方就这么写 ——
 * 「返回了东西」证明不了双路，只靠一路也能让包含式断言变绿。
 */

/**
 * 分词词表。
 *
 * `setDefaultSegmenter` 是给**写入侧**用的（`extractMemories` 内部调 `createMemory`
 * 时不传分词器），`configureSearch` 是给**查询侧**用的 —— 两者必须是同一个实例：
 * 索引里的词项由写入侧切、查询词项由查询侧切，两端不一致时该行会被静默漏掉
 * （spec §8.3），而那种红与本次要验的链路毫无关系。
 */
const VOCAB = ["缩进", "用户", "偏好", "连接池", "格式化", "脚本", "压测", "通过", "空格"];
const seg = new FakeSegmenter(VOCAB);

/** 库里现存记忆的正文，顺序按写入先后。 */
function storedContents(): string[] {
  const rows = db
    .prepare("SELECT content FROM memory_records ORDER BY created_at ASC, rowid ASC")
    .all() as Array<{ content: string }>;
  return rows.map((r) => r.content);
}

let db: DatabaseType;

/**
 * 截获**真正执行过**的 MATCH 语句。
 *
 * BM25 路的作用域片段只存在于它的 SQL 文本里，而它的效果会被请求级过滤掩盖
 * （见「scopes each leg's candidate set」那条用例）。`searchMemories` 对 db 只用到
 * `prepare`，所以一层只转发 `prepare` 的代理就够了。
 */
async function captureMatchSql(
  run: (probe: DatabaseType) => Promise<unknown>,
): Promise<string[]> {
  const seen: string[] = [];
  const probe = new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") {
        return (sql: string, ...rest: unknown[]) => {
          if (sql.includes("memory_fts MATCH")) seen.push(sql);
          return (target.prepare as unknown as (s: string, ...a: unknown[]) => unknown)(sql, ...rest);
        };
      }
      return Reflect.get(target, prop);
    },
  }) as DatabaseType;

  await run(probe);
  return seen;
}

/** 把 `fetch` 换成返回固定 JSON 的桩 —— `callLLM` 走 HTTP，测试不许出网。 */
function llmRespondingWith(operations: unknown[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(operations) } }],
      }),
    }),
  );
}

beforeEach(() => {
  db = createTestDb();
  // createTestDb 只跑 DDL，不跑启动期的回填。索引就绪必须**显式**声明：
  // 默认 false 时 BM25 路整条跳过（Task 13 的刻意设计），检索会静默只返回向量命中，
  // 断言就会以「实现坏了」的样子红。
  setBm25ReadyForTesting(true);
  // 覆盖 createTestDb 装的 TEST_VOCABULARY —— 写入与查询必须共用同一个分词器。
  setDefaultSegmenter(seg);
});

afterEach(() => {
  resetSearchDepsForTesting();
  vi.unstubAllGlobals();
  destroyTestDb(db);
});

describe("end-to-end: spec §7.1 长会话的项目续接", () => {
  const provider = new FakeEmbeddingProvider({ dim: 16 });

  it("stores, embeds, and recalls a decision made long ago in the same conversation", async () => {
    const index = createBlobVectorIndex(db);
    configureSearch({
      segmenter: seg,
      vectorIndex: index,
      embeddingProvider: provider,
      minSimilarity: 0,
    });

    // ── 第一周：用户陈述偏好 ─────────────────────────────────────────
    llmRespondingWith([
      { action: "add", type: "preference", content: "用户偏好缩进", importance: 7 },
    ]);

    await extractMemories(
      {
        userId: "u1",
        conversationId: "C1",
        agentId: "a1",
        agentName: "小助",
        userMessage: "这个项目缩进用 tab，别用空格",
        agentResponse: "好的，我记下了。",
      },
      { apiKey: "k", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
      db,
    );

    // ── 第三周：一个错误模式的排查结论 ───────────────────────────────
    llmRespondingWith([
      { action: "add", type: "error_pattern", content: "连接池 被打满 压测 通过", importance: 8 },
    ]);

    await extractMemories(
      {
        userId: "u1",
        conversationId: "C1",
        agentId: "a1",
        agentName: "小助",
        userMessage: "连接池老是被打满",
        agentResponse: "pool_size 调到 20 之后压测通过了",
      },
      { apiKey: "k", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
      db,
    );

    // 先钉住「提取真的落库了」。少了这一条，一个坏掉的 fetch 桩会让下游的
    // 「没有召回」看起来像检索坏了 —— callLLM 失败时返回 "" 而不是抛错。
    expect(storedContents()).toEqual(["用户偏好缩进", "连接池 被打满 压测 通过"]);

    // ── 后台嵌入 ────────────────────────────────────────────────────
    // 写入侧不嵌入（createMemory 是同步的），向量由 worker 异步补齐。
    const worker = startEmbeddingWorker({ provider, index, batchSize: 32, intervalMs: 0, db });
    expect((await worker.runOnce()).processed).toBe(2);
    expect(worker.pendingCount()).toBe(0);
    worker.stop();
    expect(index.size()).toBe(2);

    // ── 第八周：重开同一个会话，问很久以前的事 ───────────────────────
    const context = await buildMemoryContext({
      userId: "u1",
      conversationId: "C1",
      query: "连接池",
      customDb: db,
    });

    expect(context).toBeDefined();
    expect(context).toContain("连接池");
    expect(context).toContain("[Memory - error_pattern]");

    // 直接检索也应当命中，且**只有**那一条 —— 同会话的另一条（缩进偏好）
    // 与查询无关，漏出来的话包含式断言照样绿。
    const hits = await searchMemories(
      { query: "连接池", userId: "u1", scope: { conversationId: "C1" } },
      db,
    );
    expect(hits.map((m) => m.content)).toEqual(["连接池 被打满 压测 通过"]);

    // ── 双路都要真的在贡献 ──────────────────────────────────────────
    // 上面任何一条断言单独都证明不了双路：只靠 BM25、或只靠向量，结果都一样。
    // 把两路**分别**关掉各跑一次，关掉哪一路都还召回得到，才说明两路都在干活。

    // ① 不注入 vectorIndex ⇒ 向量路为空榜单，命中只可能来自 BM25 路。
    configureSearch({ segmenter: seg, minSimilarity: 0 });
    const bm25Only = await searchMemories(
      { query: "连接池", userId: "u1", scope: { conversationId: "C1" } },
      db,
    );
    expect(bm25Only.map((m) => m.content)).toEqual(["连接池 被打满 压测 通过"]);

    // ② 索引未就绪 ⇒ BM25 路整条跳过，命中只可能来自向量路。
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      setBm25ReadyForTesting(false);
      configureSearch({
        segmenter: seg,
        vectorIndex: index,
        embeddingProvider: provider,
        minSimilarity: 0,
      });
      const vectorOnly = await searchMemories(
        { query: "连接池", userId: "u1", scope: { conversationId: "C1" } },
        db,
      );
      expect(vectorOnly.map((m) => m.content)).toEqual(["连接池 被打满 压测 通过"]);
      // 「不可用」必须留痕，不能与「没有匹配」长得一样（spec §7.7）。
      expect(warn).toHaveBeenCalled();
    } finally {
      setBm25ReadyForTesting(true);
      warn.mockRestore();
    }
  });

  it("keeps two projects' contradictory conventions apart end to end", async () => {
    // spec §13 称这条为整个设计最重要的测试（§1.1）：两个项目持有**互相矛盾**的
    // 约定，而「矛盾」与「相关」在向量空间里无法区分 —— 只有作用域能区分。
    const index = createBlobVectorIndex(db);
    configureSearch({
      segmenter: seg,
      vectorIndex: index,
      embeddingProvider: provider,
      minSimilarity: 0,
    });

    const tab = createMemory({
      userId: "u1", conversationId: "C1", agentId: "a1",
      type: "preference", content: "用户偏好缩进", tags: [],
    }, db, seg);
    const spaces = createMemory({
      userId: "u1", conversationId: "C2", agentId: "a1",
      type: "preference", content: "用户偏好空格", tags: [],
    }, db, seg);

    const worker = startEmbeddingWorker({ provider, index, batchSize: 32, intervalMs: 0, db });
    expect((await worker.runOnce()).processed).toBe(2);
    worker.stop();

    const inC1 = await buildMemoryContext({
      userId: "u1", conversationId: "C1", query: "缩进", customDb: db,
    });
    const inC2 = await buildMemoryContext({
      userId: "u1", conversationId: "C2", query: "缩进", customDb: db,
    });

    expect(inC1).toContain("缩进");
    expect(inC1).not.toContain("空格");
    expect(inC2).toContain("空格");
    expect(inC2).not.toContain("用户偏好缩进");

    // ── 前提：词项匹配不是区分者，作用域才是 ─────────────────────────
    // 查询「用户偏好」在两会话下都能命中词项（两条 content_seg 都含 用户 / 偏好），
    // 全库搜索会同时返回两条。所以下面「只返回一条」这件事只可能由作用域造成。
    configureSearch({ segmenter: seg, minSimilarity: 0 });

    const bm25C1 = await searchMemories(
      { query: "用户偏好", userId: "u1", scope: { conversationId: "C1" } },
      db,
    );
    const bm25C2 = await searchMemories(
      { query: "用户偏好", userId: "u1", scope: { conversationId: "C2" } },
      db,
    );
    const bm25All = await searchMemories(
      { query: "用户偏好", userId: "u1", scope: { allConversations: true } },
      db,
    );

    expect(bm25C1.map((m) => m.id)).toEqual([tab.id]);
    expect(bm25C2.map((m) => m.id)).toEqual([spaces.id]);
    expect(bm25All.map((m) => m.id).sort()).toEqual([tab.id, spaces.id].sort());

    // ── 向量路：同一个查询向量、同一个索引，只有 scope 不同 ───────────
    // 无作用域时 C2 那条**排在最前**（分数更高）：漏掉作用域时它会顶掉 C1 自己的
    // 约定 —— 「矛盾」与「相关」在向量空间里无法区分，只有作用域能区分（spec §1.1）。
    const qvec = await provider.embedQuery("缩进");
    const vecC1 = index.search(qvec, 10, { userId: "u1", scope: { conversationId: "C1" } });
    const vecAll = index.search(qvec, 10, { userId: "u1", scope: { allConversations: true } });

    // 两条都真的被嵌入了 —— 否则「C1 只返回一条」可能只是索引里根本没有另一条。
    expect(index.size()).toBe(2);
    expect(vecC1.map((h) => h.memoryId)).toEqual([tab.id]);
    expect(vecAll.map((h) => h.memoryId)).toEqual([spaces.id, tab.id]);
  });

  it("scopes each leg's candidate set, not merely the final result", async () => {
    // 为什么这条测试必须存在（实测得出的事实）：`searchMemories` 在融合之后还有一次
    // 请求级过滤（`allowedMemoryIds`），它用**同一个** scope 再查一遍库，把任何一路
    // 漏出来的越界条目重新滤掉 —— spec §8.4 的纵深防御。后果是：**单独**把任一层
    // （BM25 路的 scope 片段、向量路的 filter、请求级过滤）改成「全库」，最终结果
    // 都不变，本文件其余断言全部照常通过。上面那条端到端用例因此只能证明「作用域
    // 被某一层守住了」，证明不了两路各自守住了。要证明后者，只能观测两路的入参。
    const index = createBlobVectorIndex(db);
    createMemory({
      userId: "u1", conversationId: "C1", agentId: "a1",
      type: "preference", content: "用户偏好缩进", tags: [],
    }, db, seg);

    // ── 向量路：看 `VectorIndex.search` 收到的 filter ────────────────
    const filtersSeen: Array<{ userId: string; scope: MemoryScope }> = [];
    const probingIndex: VectorIndex = {
      ...index,
      search(vec, k, filter) {
        filtersSeen.push(filter);
        return index.search(vec, k, filter);
      },
    };
    configureSearch({
      segmenter: seg,
      vectorIndex: probingIndex,
      embeddingProvider: provider,
      minSimilarity: 0,
    });

    await searchMemories(
      { query: "缩进", userId: "u1", scope: { conversationId: "C1" } },
      db,
    );
    expect(filtersSeen).toEqual([{ userId: "u1", scope: { conversationId: "C1" } }]);

    // ── BM25 路：作用域片段只写在它真正执行的 SQL 里 ──────────────────
    const sqls = await captureMatchSql((probe) =>
      searchMemories({ query: "缩进", userId: "u1", scope: { conversationId: "C1" } }, probe),
    );
    expect(sqls.length).toBe(1);
    // 片段来自 `buildScopeClause` —— 与向量路是同一份实现（spec §8.4）
    expect(sqls[0]).toContain("r.conversation_id = ?");
  });

  it("injects nothing at all — not an empty block — for a conversation with no memories", async () => {
    // 冷启动：新会话的第一轮就走到这里，注入块必须是 `undefined`。
    // 空串会被调用方的 `if (block)` 判为真，拼出一个空段落（spec §8.7）。
    const index = createBlobVectorIndex(db);
    configureSearch({
      segmenter: seg,
      vectorIndex: index,
      embeddingProvider: provider,
      minSimilarity: 0,
    });

    // 库里**有**记忆，但不是这个会话的 —— 空的是会话，不是整库。
    // 这样断言才不会因为「什么都没写」而变成同义反复。
    createMemory({
      userId: "u1", conversationId: "C2", agentId: "a1",
      type: "preference", content: "用户偏好缩进",
    }, db, seg);

    const context = await buildMemoryContext({
      userId: "u1", conversationId: "C1", query: "缩进", customDb: db,
    });

    expect(context).toBeUndefined();
    expect(context).not.toBe("");
  });

  it("survives an embedding outage and still recalls through BM25", async () => {
    const index = createBlobVectorIndex(db);
    const flaky = new FakeEmbeddingProvider({ dim: 16, failuresRemaining: 1 });
    configureSearch({
      segmenter: seg,
      vectorIndex: index,
      embeddingProvider: flaky,
      minSimilarity: 0,
    });

    createMemory({
      userId: "u1", conversationId: "C1", agentId: "a1",
      type: "error_pattern", content: "连接池 被打满",
    }, db, seg);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // 后台嵌入失败 —— 记忆仍只在 BM25 榜单里
      const worker = startEmbeddingWorker({ provider: flaky, index, intervalMs: 0, db });
      const failed = await worker.runOnce();
      expect(failed.processed).toBe(0);
      worker.stop();
      // 失败必须留痕：静默重试会让「嵌不进向量空间」看起来像一切正常。
      expect(errorSpy).toHaveBeenCalled();

      // 检索仍应通过 BM25 命中（向量索引此时是空的）
      const hits = await searchMemories(
        { query: "连接池", userId: "u1", scope: { conversationId: "C1" } },
        db,
      );
      expect(hits.length).toBe(1);
      expect(hits[0]!.content).toBe("连接池 被打满");

      // 恢复后 worker 自动补齐
      const recovered = startEmbeddingWorker({ provider: flaky, index, intervalMs: 0, db });
      expect((await recovered.runOnce()).processed).toBe(1);
      recovered.stop();
      expect(index.size()).toBe(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("re-enqueues every memory when the embedding fingerprint changes", async () => {
    const index = createBlobVectorIndex(db);
    const provider8 = new FakeEmbeddingProvider({ dim: 8 });
    const provider16 = new FakeEmbeddingProvider({ dim: 16 });

    createMemory({
      userId: "u1", conversationId: "C1", agentId: "a1", type: "fact", content: "用户偏好缩进",
    }, db, seg);

    const first = startEmbeddingWorker({ provider: provider8, index, intervalMs: 0, db });
    expect((await first.runOnce()).processed).toBe(1);
    first.stop();

    // 换维度 → fingerprint 变 → 全部重新入队（队列判据与失效判据是同一个值）
    const second = startEmbeddingWorker({ provider: provider16, index, intervalMs: 0, db });
    expect((await second.runOnce()).processed).toBe(1);
    second.stop();

    const row = db.prepare("SELECT fingerprint FROM memory_embeddings").get() as { fingerprint: string };
    expect(row.fingerprint).toBe(provider16.fingerprint);
  });

  it("runs the full migration → reindex → search path on a legacy database", async () => {
    const index = createBlobVectorIndex(db);
    configureSearch({ segmenter: seg, vectorIndex: index, embeddingProvider: provider });

    // 模拟迁移前的行：conversation_id 为 NULL、content_seg 为 NULL
    db.prepare(
      `INSERT INTO memory_records (id, user_id, agent_id, type, content, tags, conversation_id, importance, created_at, updated_at)
       VALUES ('legacy', 'u1', 'a1', 'fact', '用户偏好缩进', '[]', NULL, 1, datetime('now'), datetime('now'))`,
    ).run();

    const { backfilled } = reindexMemories(seg, db);
    expect(backfilled).toBe(1);

    // 无主记忆在会话作用域下不可召回 —— 这是明确接受的损失（spec §9.6）
    const scoped = await searchMemories(
      { query: "缩进", userId: "u1", scope: { conversationId: "C1" } },
      db,
    );
    expect(scoped.length).toBe(0);

    // 但在全库搜索（Web UI）下可见
    const global = await searchMemories(
      { query: "缩进", userId: "u1", scope: { allConversations: true } },
      db,
    );
    expect(global.length).toBe(1);
    expect(global[0]!.id).toBe("legacy");
  });

  it("adds a new row — rather than rewriting an existing one — when extraction says add", async () => {
    // 名字要点明 `add` 语义：提取出的第二条偏好与第一条**无关**（tab vs 空格），
    // 只断言「有两条」而不看正文，就无法区分「新增」与「就地改写」。
    // 真正的 `update` 就地改写路径由 extractor.test.ts 覆盖（那里才断言
    // id / createdAt 不变）—— 这条用例不重复它，只钉住 add 不走 update 分支。
    const index = createBlobVectorIndex(db);
    configureSearch({ segmenter: seg, vectorIndex: index, embeddingProvider: provider });

    createMemory({
      userId: "u1", conversationId: "C1", agentId: "a1",
      type: "preference", content: "用户偏好缩进",
    }, db, seg);

    llmRespondingWith([
      { action: "add", type: "preference", content: "用户偏好空格", importance: 5 },
    ]);
    await extractMemories(
      {
        userId: "u1", conversationId: "C1", agentId: "a1", agentName: "小助",
        userMessage: "改成空格吧", agentResponse: "好",
      },
      { apiKey: "k", endpoint: "https://fake.test/v1/chat/completions", model: "m" },
      db,
    );

    const all = db.prepare("SELECT id, created_at FROM memory_records WHERE user_id = 'u1'").all() as Array<{
      id: string;
      created_at: string;
    }>;
    // add 语义应当新增一条，而不是改写已有的
    expect(all.length).toBe(2);
    expect(storedContents()).toEqual(["用户偏好缩进", "用户偏好空格"]);
  });
});

/**
 * `buildFtsQuery` 的输出**真的能被 FTS5 接受**。
 *
 * 已提交的 `fts-query.test.ts` 只断言字符串形状与「纯字符串函数不抛」——
 * 那证明不了 FTS5 会接受它。Task 11 的复核用一个**未提交的一次性脚本**验证过
 * （`"-" OR "*" OR "(" OR ")" OR ":" OR "^"` 能解析；`MATCH ''` / `MATCH ' '`
 * 真的抛错），但那件事在仓库里无法复现。这里有一个真实的 `memory_fts` 表，
 * 所以把生成的表达式真的丢给 `MATCH` 执行一次 —— 断言因此可复现。
 */
describe("buildFtsQuery 的输出能被真实的 FTS5 执行", () => {
  const match = () => db.prepare("SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?");

  it("executes every generated expression as a real MATCH", () => {
    // 覆盖：普通词项、FTS5 操作符字符、被引号包住的伪函数调用，以及纯操作符串。
    const inputs = [
      "用户偏好缩进",
      "E_CONN_RESET -x *y (z)",
      'NEAR("a" "b") AND ^c :d',
      "- * ( ) : ^",
    ];

    for (const input of inputs) {
      const q = buildFtsQuery(input, seg);
      expect(q).not.toBeNull();
      expect(() => match().all(q!)).not.toThrow();
    }

    // 内嵌双引号的转义（`""`）最容易写坏，单独钉一次
    const quoted = new FakeSegmenter(['a"b']);
    const escaped = buildFtsQuery('a"b', quoted);
    expect(escaped).toBe('"a""b"');
    expect(() => match().all(escaped!)).not.toThrow();
  });

  it("parses the operator-only expression Task 11 could not reproduce", () => {
    // 每个字符都单独成词 —— 这正是复核里那句表达式的来源。
    const ops = buildFtsQuery("- * ( ) : ^", seg);
    expect(ops).toBe('"-" OR "*" OR "(" OR ")" OR ":" OR "^"');
    expect(() => match().all(ops!)).not.toThrow();
  });

  it("finds the row it is supposed to find, so the assertion is not vacuous", () => {
    // 「不抛错」也可能是「表里没数据、什么都没发生」。真的召回一行才算数。
    const mem = createMemory({
      userId: "u1", conversationId: "C1", agentId: "a1",
      type: "preference", content: "用户偏好缩进",
    }, db, seg);

    const rows = match().all(buildFtsQuery("缩进", seg)!) as Array<{ rowid: number }>;
    expect(rows.length).toBe(1);
    const row = db.prepare("SELECT rowid FROM memory_records WHERE id = ?").get(mem.id) as { rowid: number };
    expect(rows[0]!.rowid).toBe(row.rowid);
  });

  it("proves the MATCH assertion is meaningful: an empty expression really throws", () => {
    // 这一条是上面所有 `.not.toThrow()` 的对照面：FTS5 确实会拒绝空表达式。
    // 正因如此，buildFtsQuery 对空输入返回 null（而不是 ""）是**必需**的 ——
    // 否则调用方会往搜索路径里送一个必然抛错的 MATCH。
    expect(() => match().all("")).toThrow(/fts5/i);
    expect(() => match().all(" ")).toThrow(/fts5/i);
    expect(buildFtsQuery("   ", seg)).toBeNull();
  });
});
