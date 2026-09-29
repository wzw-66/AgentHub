# Long-Term Memory Module

为 AgentHub 增加长期记忆能力，让 AI Agent 记住**同一个项目会话内**此前做过什么 ——
架构决策、排查结论、用户约定。

## 记忆的作用域是会话，不是用户

本系统的使用方式是「一个项目 = 一个 Conversation」（`findSingleConversationByAgentId`
保证重开窗口回到同一个会话）。因此记忆的主用途是回答「这个项目之前做了什么」，
检索以 `conversation_id` **排他过滤**。

**为什么排他：** 项目之间会互相矛盾 —— 项目 A 约定 tab 缩进，项目 B 约定 2 空格，
两者都成立。「矛盾」和「相关」在向量空间里无法区分，只有作用域能区分。
允许跨会话召回会让 A 的会话被注入 B 的约定，且没有任何信号能提示模型这是外来上下文。

**代价（明确接受）：** 用户级偏好这类真正的跨会话知识不会被召回。恢复它需要
「另做一路」，尚未实现。

> 早期版本的本文档称「让 AI Agent 能跨对话记住用户偏好」—— 那是**错的**，
> 与本模块的实际作用域相反。

## Status

- **Status:** Implemented（混合检索：BM25 + 向量 + RRF）
- **Author:** CEO Review / 混合检索改造
- **Date:** 2026-06-05（初版）/ 2026-09-29（同步实现）
- **Branch:** `feat/hybrid-memory-retrieval`
- **Spec:** `docs/superpowers/specs/2026-09-28-hybrid-memory-retrieval-design.md`

## 存储位置

长期记忆库与业务库是**两个独立的 SQLite 文件**，都放在仓库根的 `.agenthub/`（整个目录已 gitignore）：

| 文件 | 归属 | 说明 |
|------|------|------|
| `.agenthub/agenthub.db` | Prisma（`packages/db`） | 用户、联系人、会话、消息 |
| `.agenthub/memory.db` | better-sqlite3（`packages/memory`） | 记忆记录、FTS5 索引、向量 |

**必须保持两个文件。** `prisma db push` 不认识 FTS5 的影子表（`memory_fts_*`），
会把它当作 schema drift 删掉 —— 合并成一个文件会丢记忆索引。

`packages/memory` 的库路径解析顺序是：`setDbPath()` 显式设置 → 否则 `<cwd>/.agenthub/memory.db`。
`apps/server/src/index.ts` 在启动时显式钉到仓库根的 `.agenthub/memory.db`，不依赖 cwd。

## Core Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                            @agenthub/memory                           │
│                                                                       │
│  ┌────────────────┐   ┌──────────────────┐   ┌───────────────────┐   │
│  │ Repository      │   │ Retrieval         │   │ Extractor         │   │
│  │ createMemory()  │   │ searchMemories()  │   │ extractMemories() │   │
│  │ getMemory()     │   │  ├─ BM25 路        │   │  LLM 判断         │   │
│  │ updateMemory()  │   │  ├─ 向量路         │   │  ADD/UPDATE/      │   │
│  │ listMemories()  │   │  └─ RRF 融合       │   │  DELETE/NOOP      │   │
│  │ deleteMemory()  │   │ buildMemoryContext│   │                   │   │
│  └───────┬─────────┘   └────────┬──────────┘   └────────┬──────────┘   │
│          │                      │                       │              │
│          │         ┌────────────┴────────────┐          │              │
│          │         │ configureSearch() 注入:  │          │              │
│          │         │  segmenter / provider /  │          │              │
│          │         │  vectorIndex             │          │              │
│          │         └────────────┬─────────────┘          │              │
│          ▼                      ▼                        ▼              │
│  ┌───────────────────────────────────────────────────────────────┐    │
│  │  memory.db (better-sqlite3)                                    │    │
│  │  memory_records(+content_seg/tags_seg) · memory_fts(FTS5)     │    │
│  │  memory_embeddings(BLOB)     · PRAGMA user_version = 3         │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                      ▲                                                │
│                      │ 后台轮询（默认 5s，一批 32 条）                  │
│              ┌───────┴─────────┐                                       │
│              │ Embedding worker │──▶ EmbeddingProvider（可选）          │
│              └─────────────────┘     OpenAI 兼容 /v1/embeddings        │
└───────────────────────────────────────────────────────────────────────┘
     ▲                                        ▲
     │ 写入：每次 Agent 回复后                   │ 读取：注入 systemPrompt
     │ triggerMemoryExtraction()                │ buildMemoryContext()
┌────┴─────────────────────┐        ┌──────────┴──────────────────────────┐
│ routes/messages.ts        │        │ orchestrator/executor.ts            │
│ （单 agent 路径 +          │        │ （仅首次 SubTask 注入，见下）        │
│    orchestrator 每个子任务）│        │ routes/messages.ts（单 agent 路径）  │
└───────────────────────────┘        └─────────────────────────────────────┘
```

## 数据模型

### `memory_records`（业务表）

```sql
CREATE TABLE memory_records (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,            -- 租户边界
  agent_id          TEXT NOT NULL,            -- 元数据 + 展示筛选，**不参与检索过滤**
  type              TEXT NOT NULL DEFAULT 'fact',
  content           TEXT NOT NULL,            -- 记忆原文（注入提示词用这一列）
  content_seg       TEXT,                     -- jieba 预分词结果，FTS5 索引这一列
  tags              TEXT NOT NULL DEFAULT '[]', -- JSON array（原文，用于展示）
  tags_seg          TEXT,                     -- tags 的预分词结果，FTS5 索引这一列
  source_message_id TEXT,
  conversation_id   TEXT,                     -- 检索作用域的唯一依据
  importance        INTEGER NOT NULL DEFAULT 1, -- 1-10
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_memory_user_agent     ON memory_records(user_id, agent_id);
CREATE INDEX idx_memory_user           ON memory_records(user_id);
CREATE INDEX idx_memory_conversation   ON memory_records(conversation_id);
```

**`conversation_id` 可为 NULL，但那等于「不可召回」**：所有自动注入路径都按会话排他过滤，
`conversation_id IS NULL` 的行在任何会话下都检索不到（spec §9.6 的已知损失，
由 `/api/memory/list` 的 `orphanCount` 暴露）。

### `memory_fts`（FTS5 虚表）

索引的是**分词后的列** `content_seg` / `tags_seg`，不是原文：

```sql
CREATE VIRTUAL TABLE memory_fts USING fts5(
  content_seg, tags_seg,
  content='memory_records',        -- 外部内容表
  content_rowid='rowid',
  tokenize='unicode61'
);
```

**为什么索引分词列：** `unicode61` 不切分 CJK，整句会被当成**一个** token，
只有整句精确匹配才命中 —— 这是「中文基本检索不出来」的根因。
写入侧用 jieba 切好后存进 `_seg` 列，查询侧用**同一种**切分构造 MATCH 表达式。
两端必须一致：不一致时该行会被**静默**漏掉（spec §8.3）。

三个触发器（`mem_fts_ai` / `mem_fts_ad` / `mem_fts_au`）把 `memory_records`
的增删改同步到索引。注意 SQLite 触发器**不能调用 JS**，所以 `content_seg` /
`tags_seg` 必须由写入侧（`createMemory` / `updateMemory`）算好，触发器只做搬运。

### `memory_embeddings`（向量表）

```sql
CREATE TABLE memory_embeddings (
  memory_id   TEXT PRIMARY KEY REFERENCES memory_records(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,   -- `${model}:${dim}:${mode}` —— 向量空间的指纹
  model       TEXT NOT NULL,
  dim         INTEGER NOT NULL,
  vec         BLOB NOT NULL,   -- Float32Array 的原始字节
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`fingerprint` 是**唯一**的向量失效判据。不能用 `model` 代替：同一个模型名可能服务
多个输出维度（如 Qwen3-Embedding 的 MRL），只比 `model` 会让不同维度的向量混进
同一个索引而不触发重算。

### 迁移机制：`PRAGMA user_version`

`initSchema()` 只是 `migrate()` 的别名，按 `user_version` 顺序执行**只追加**的迁移列表。
用 `CREATE TABLE IF NOT EXISTS` 做不到这件事 —— 它对已存在的表静默跳过任何结构变更，
而换 FTS 分词器必须 `DROP` 虚表再重建。

| 版本 | 内容 |
|------|------|
| v1 | 改造前的原始 schema（对老库是 no-op，对新库是建库） |
| v2 | `content_seg` / `tags_seg` 两列 + `memory_embeddings` 表（纯 DDL，不回填） |
| v3 | `memory_fts` 重建到分词列 + 三个触发器改指向 `_seg` 列 |

当前版本 **v3**。v3 刻意不拆到 v2 —— 重建虚表会让索引瞬间变空，只有在同一处紧接着
`rebuild` 才能把「索引未就绪」的窗口关掉。**迁移只做结构，灌数据是 `reindexMemories` 的职责。**
库的版本比代码新时 `migrate()` 直接抛错，不静默继续。

### TypeScript 类型

```typescript
// @agenthub/shared
interface MemoryRecord {
  id: string;
  userId: string;
  agentId: string;
  type: MemoryType;
  content: string;
  tags: string[];
  sourceMessageId?: string;
  conversationId?: string;
  importance: number;   // 1-10
  createdAt: string;
  updatedAt: string;
}

type MemoryType = "fact" | "preference" | "decision" | "error_pattern" | "context";

// @agenthub/memory
interface ExtractedMemory {           // LLM extractor 的输出单元
  action: "add" | "update" | "delete" | "noop";
  id?: string;
  type?: MemoryType;
  content?: string;
  tags?: string[];
  importance?: number;
  reason?: string;
}

type MemoryScope =                    // 判别联合，必填，无默认值
  | { conversationId: string }
  | { allConversations: true };

type EmbeddingMode = "symmetric" | "asymmetric";
```

## 检索：双路混合 + RRF 融合

```
query
  ├── BM25 路（同步）   预分词 →  OR 查询  →  memory_fts MATCH  →  top 50
  └── 向量路（异步）    查询向量化 → 余弦暴力扫描 → 阈值 0.35 →  top 50
                                    │
                    RRF（k=60，只用名次不用分数）
                                    │
                     请求级过滤（user + scope + agentId，两路统一）
                                    │
                          切片 → 回查完整记录 → 返回
```

- **两条路都要出现在数组里**，失败的那一路是**空榜单**而不是被省略的槽位 ——
  融合层的契约是「缺失的榜单就是空集」，靠省略表达会让下标错位。
  **融合层没有降级分支**：任一路失败只让它自己变成空榜单，RRF 天然退化为另一路。
- **两路的分工不是冗余**：同义改写/中文自然语言靠向量；错误码、文件路径、变量名
  （`E_CONN_RESET`、`workspacePath`）这类 token 在 embedding 词表里语义稀薄，
  靠 BM25 精确匹配。
- **`agentId` 在融合之后、切片之前统一施加一次**（`allowedMemoryIds`）。只加在 BM25 路
  会让筛选漏出别的 agent 的记忆，还会让被过滤掉的 BM25 命中被未过滤的向量命中挤下去。
- **`minSimilarity`（默认 0.35）只作用于向量路自己的名次上**，在融合之前 ——
  放进融合层就变成拿余弦去和 BM25 的量纲比，两边不可比。向量路对**任意**查询都会
  返回 top-k，会话作用域让候选集变小、**更容易凑够 k 条无关记忆**，所以这个阈值
  是必需的（具体取值留给 Spec 2 用消融实验标定）。
- **`buildScopeClause` 是作用域的唯一实现点**（BM25 路的 `MATCH` 与向量路的 `filter`
  共用它），SQL 片段以 `r.` 为前缀。用 `"conversationId" in scope` 而不是真值判断 ——
  空串 `""` 是合法的 conversationId。

## 触发链路

### 写入：Agent 回复完成后异步提取

```
Agent 回复完成（runAgentExecution / runOrchestration）
       │
       ▼
triggerMemoryExtraction({ userId, conversationId, agentId, agentName,
                          userMessage, agentResponse, llm, log })
       │  fire-and-forget，进程内并发上限 2（超出的排队，不丢弃）
       ▼
extractMemories(...)
       ├─ searchMemories：在本会话内取 top 5 相关记忆作为去重候选
       ├─ LLM 调用（config.llm，见「配置」）
       └─ 解析 JSON → 逐条执行 ADD / UPDATE / DELETE / NOOP
```

去重候选的检索**限定在 (user, conversation)**：候选若跨租户或跨会话，
LLM 会看到别人的记忆并把它们当作可 update/delete 的对象。

`update` 走的是 `updateMemory` 的**就地 UPDATE**，保留 `id` 与 `created_at`：
旧实现把它写成 `delete + create`，导致 `sourceMessageId` 溯源链断裂、
记忆年龄归零、向量行成孤儿。`importance` **只在 LLM 给出时才进 patch** ——
patch 里缺席即「不改这一列」，`?? 1` 会把「LLM 没重申重要度」变成「重置为 1」。

### 读取：注入 `systemPrompt`

两条路径共用 `buildMemoryContext()`（此前单 agent 路径根本不注入，1:1 聊天里记忆只写不读）：

| 路径 | 位置 | 作用域 |
|------|------|--------|
| orchestrator | `executor.ts:buildContext()` | `{ conversationId }`，**仅首次 SubTask** |
| 单 agent | `routes/messages.ts` | `{ conversationId }` |

**设计决策：首次 SubTask 仅注入一次。** 此举确保后续 SubTask 的 system prompt 完全固定，
充分利用 Anthropic prompt prefix caching —— 首次请求未命中，之后同一对话内的所有请求
全量命中缓存。代价是最小实时性：本对话中新提取的记忆要下次对话才进提示词
（刚讨论过的内容由 Agent 的短时记忆覆盖）。

`buildMemoryContext` 的边界：

- **不收 `agentId`** —— 检索作用域是会话，`agentId` 已降级为元数据。这是设计决定，不是漏了。
- 默认 `tokenBudget = 800`，条数硬上界 20（同时是检索的 `limit`）。
- token 估算按 **4 字符 / token**。**已知偏差：中文被低估约 4 倍**（一个汉字常就是一个 token），
  最坏情况下 800 的预算实际注入约 3200 token。方向安全（只会偏多），但别把它当噪声。
- **绝不抛错**：记忆是提示，不是必需条件。但降级必须可观察 —— 走日志。
- 「检索到 0 条」与「检索到了但第一条就超预算」都返回 `undefined`，
  两者在日志里长得**不一样**（后者会打 warning，否则一条过大的记忆会静默压掉整轮记忆）。

### 启动期：迁移 → 回填 → 监听

`initializeMemory()`（`apps/server/src/services/memory-startup.ts`）的顺序钉死为
「迁移（DDL）→ 回填 + rebuild（数据）→ `listen()`」：迁移会 DROP 并重建 `memory_fts`，
此后索引是空的而记忆表有数据，在这个窗口内 `MATCH` 静默返回 0 行。

重建失败**不阻止启动**（记忆是辅助能力，爆炸半径不成比例），但绝不静默降级：
留下 ERROR 日志 + `isBm25Ready() === false`，检索侧据此**跳过** BM25 路并打 warning。
注意这里**没有后台重试** —— `reindexMemories` 是同步的，要么已经返回、要么已经抛出，
降级持续到下一次重启（`REINDEX_TIMEOUT_MS` 因此还不是真正的截止时间）。

### 后台嵌入 worker

写入路径**完全不碰 embedding 服务**（`createMemory` 恒不调用它），所以向量算不出来
只会让这条记忆暂时只出现在 BM25 榜单里，不会让记忆本身写不进去。

- **「待嵌入」不是状态列，而是一个 LEFT JOIN**：没有一条指纹匹配的向量行。
  没有状态机可以写错、天然自愈（worker 崩了重启即可）、换模型自动作废旧向量。
- 默认每 5 秒一轮、每轮 32 条；至多一轮在飞（重叠的 tick 跳过）。
- 一批里的一条坏向量**不影响同批其他条**：整批 reject 时拆成单条重试。
  `bge-m3` + Ollama 对某些技术文档返回 NaN（见 `embedding-setup.md`），
  `assertFiniteVector` 拒收这类向量 —— 该条记忆停留在「只有 BM25 可召回」的状态。

## 公开 API

```typescript
// === Repository API （全部同步）===

function createMemory(
  input: CreateMemoryInput,          // conversationId 必填
  customDb?: Database,
  segmenter?: Segmenter,             // 注入点：仅测试用
): MemoryRecord;

function getMemory(id: string, customDb?: Database): MemoryRecord | null;

function updateMemory(
  id: string,
  patch: { type?: MemoryType; content?: string; tags?: string[]; importance?: number },
  customDb?: Database,
  segmenter?: Segmenter,
): MemoryRecord | null;              // null = id 不存在，不抛错

function listMemories(params: {
  userId: string;                    // 必填
  agentId?: string;
  type?: MemoryType;
  limit?: number;                    // 默认 50
  offset?: number;                   // 默认 0
}, customDb?: Database): { data: MemoryRecord[]; total: number };

function deleteMemory(id: string, customDb?: Database): void;

function getMemoriesByIds(ids: string[], customDb?: Database): MemoryRecord[];  // 保持传入顺序

// === Search （异步 —— 内部需要一次 embedding API 调用）===

function searchMemories(options: {
  query: string;
  userId: string;                    // 必填
  scope: MemoryScope;                // 必填 —— { conversationId } | { allConversations: true }
  agentId?: string;                  // 仅供 Web UI 筛选
  limit?: number;                    // 默认 50
  offset?: number;                   // 默认 0
}, customDb?: Database): Promise<MemoryRecord[]>;

function buildMemoryContext(params: {
  userId: string;
  conversationId: string;            // 必填
  query: string;
  tokenBudget?: number;              // 默认 800
  customDb?: Database;
}): Promise<string | undefined>;

// === 检索依赖注入（生产接线在 apps/server/src/index.ts）===

function configureSearch(options: {
  segmenter: Segmenter;
  vectorIndex?: VectorIndex;         // 与 worker 必须是同一个实例
  embeddingProvider?: EmbeddingProvider;
  minSimilarity?: number;            // 默认 0.35
}): void;

// === Extractor API ===

function extractMemories(params: {
  userId: string;
  conversationId: string;            // 必填
  agentId: string;
  agentName: string;
  userMessage: string;
  agentResponse: string;
}, llmConfig?: {                     // 不再读 process.env —— 那是第二个真相源
  apiKey?: string;                   // 可选：本地端点不需要鉴权
  endpoint?: string;                 // 必填
  model?: string;                    // 必填
}, customDb?: Database): Promise<void>;

// === 后台 worker ===

function startEmbeddingWorker(opts: {
  provider: EmbeddingProvider;
  index: VectorIndex;
  batchSize?: number;                // 默认 32，非正数抛错
  intervalMs?: number;               // 默认 5000；0 = 只手动 runOnce()
  db?: Database;
}): { stop(): void; runOnce(): Promise<{ processed: number; failed: number }>; pendingCount(): number };

function reindexMemories(segmenter: Segmenter, customDb?: Database): { backfilled: number };
function isBm25Ready(): boolean;
function pendingEmbeddingCount(customDb?: Database, fingerprint?: string): number;

// === 迁移 ===

function initSchema(customDb?: Database): void;   // = migrate()
function migrate(db: Database): { from: number; to: number };
```

**参数契约（`global-constraints.md` 钉死）：** `searchMemories` 的 `userId` / `scope`、
`createMemory` 与 `extractMemories` 的 `conversationId`、四个 `EMBEDDING_*` 变量
**一律不给默认值**。漏传必须是编译错误或启动错误，不能是静默兜底 ——
本仓库已经因为一次静默兜底（`?? "deepseek-chat"`）让用户配置的模型从未生效且无人发现。

`searchMemories` **必须是异步的**：内部需要一次 embedding 调用把 query 变成向量。
这不改变「检索 → 拼进提示词」的流程，调用方只是多了个 `await`。

`createMemory` **刻意保持同步**：写入路径不做任何网络调用，`content_seg` 由 JS 分词器
在写入侧算好。`updateMemory` 同理 —— 内容变更时它删掉该 id 的向量行（即「重新入队」），
由 worker 异步补齐，而不是在这里重算。

## 配置

### LLM（`config.llm`，`apps/server/src/config/env.ts`）

| 变量 | 必填？ | 说明 |
|------|--------|------|
| `LLM_BASE_URL` | 是 | 启动期硬依赖，缺失即抛错 |
| `LLM_MODEL` | 是 | 同上。**不是 `BASE_URL` / `MODEL`** —— 那两个是历史遗留的死键 |
| `API_KEY` | 否 | 缺失时 `LLMIntentAnalyzer` 走**显式降级**路径（全部 agent 并行派发） |

### Embedding（可选能力）

| 变量 | 必填？ | 说明 |
|------|--------|------|
| `EMBEDDING_BASE_URL` | 启用向量路则必填 | OpenAI 兼容端点根，代码拼 `/embeddings` |
| `EMBEDDING_API_KEY` | 同上 | 独立于 `API_KEY`；Ollama 不校验，但实现要求非空 |
| `EMBEDDING_MODEL` | 同上 | **无默认值** |
| `EMBEDDING_DIM` | 同上 | **无默认值**；与端点实际返回的长度校验，不符即抛错 |
| `EMBEDDING_MODE` | 否 | `symmetric`（默认）/ `asymmetric` |
| `EMBEDDING_DIMENSIONS` | 否 | MRL 降维（仅部分模型支持） |
| `EMBEDDING_QUERY_PREFIX` / `EMBEDDING_DOCUMENT_PREFIX` | 否 | 非对称模型的查询/文档侧前缀 |

**四个必填变量缺任意一个 → `config.embedding` 整体为 `undefined`**，向量路关闭，
退化为纯 BM25，启动时打一条 warning 说明缺什么、后果是什么。**不做部分兜底，
不给 `model` / `dim` 设默认值。**

**非法值与缺失同等对待**：一个认不出的 `EMBEDDING_MODE`（`Asymmetric`、`symetric`、
`"asymmetric "`）、一个非正整数的 `EMBEDDING_DIM`（`1024abc`）或 `EMBEDDING_DIMENSIONS`，
都让整条配置作废并走同一条 warning。可选带默认值的契约是「省略 ⇒ 默认」，
**不是「认不出 ⇒ 默认」**。

部署与选型见 `docs/architecture/embedding-setup.md`。

## Server Integration

### 路由 `/api/memory/*`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/memory/create` | 手动创建。`conversationId` 必填（缺失会写入一条永不召回的孤儿） |
| GET | `/api/memory/list` | 分页列表，返回 `{ data, total, orphanCount, globalPendingCount }` |
| GET | `/api/memory/search` | 全文搜索，`q` 必填 |
| DELETE | `/api/memory/delete` | 按 `id` 删除（校验归属：非本人 403） |

**`/api/memory/search` 是唯一该用 `allConversations` 的地方** —— Web UI 的手动搜索语义
就是「翻所有记忆」。自动注入提示词的检索一律传 `conversationId`。
（做作用域验证时注意这条：`/search` 会同时返回两个会话的记忆，**那是设计如此，不是作用域失效**。）

`/api/memory/list` 的两个可观测字段：

- **`orphanCount`**（按请求者过滤）：`conversation_id IS NULL` 的记忆条数 ——
  在任何会话作用域下都检索不到，部署方靠它判断是否需要跑一次性回填。
- **`globalPendingCount`**（**进程级，刻意不按请求者过滤**）：待嵌入条数。
  判据是「没有一条指纹匹配的向量行」，所以它拿到的是**当前配置的指纹** —— 换模型后
  旧向量会被正确判为未完成。名字里的 `global` 与 `pending` 各占一个要点：
  它是**这个模型的队列**，且是**运维可观测性**用的全局计数（worker 本身就是无用户概念的单进程）。
  向量路未配置时传 `undefined`，计数退化为「从未算过向量的记忆条数」，
  **不是 0** —— 造一个假的 0 正是本项目要根除的静默错误值。

> 该字段此前叫 `pendingCount`，已改名。`startEmbeddingWorker(...).pendingCount()` 是
> worker 实例上的方法，与这个 HTTP 响应字段同名但不同物，别混。

### `routes/messages.ts`

- **写入**：orchestrator 的每个子任务完成后、单 agent 路径回复完成后，各调一次
  `triggerMemoryExtraction(...)`（`conversationId` 与 `llm` 都在这里补上）。
- **读取**：单 agent 路径用 `buildMemoryContext` 注入，与 orchestrator 共用同一实现。

## Web UI（设计稿，尚未实现）

`MemoryPanel` 组件目前**不存在**于 `apps/web`（`apps/web/components/` 下没有任何记忆相关组件，
也没有对应的 API 调用）。下面是设计意图，不是现状：

- 位置：`apps/web/components/MemoryPanel.tsx`
- 功能：按 Agent 筛选、全文搜索、删除、手动新建
- 数据来源：`GET /api/memory/list`（筛选 `agentId`）与 `GET /api/memory/search`（全文检索）

```
┌─────────────────────────────────────┐
│  💾 长期记忆     [+ 新建]           │
├─────────────────────────────────────┤
│  🔍 搜索记忆...                      │
├─────────────────────────────────────┤
│  Agent: [全部 ▼]  类型: [全部 ▼]     │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 📌 用户偏好使用 React 18         │ │
│ │    类型: preference  重要性: 7   │ │
│ │    来自 2026-06-01 #架构讨论    │ │
│ │                           [✕]  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## 手动验证步骤

以下三段对应 spec §15 第 6 条的验收要求。**全部可独立执行**，
不依赖真实 Agent 执行成功（第 1、2 段连 LLM 都不需要）。

### 1. 作用域隔离（P0，不需要 embedding、不需要 LLM）

写两条**互相矛盾**的缩进约定（两个会话各一条），互换提问，断言各自只拿到自己那条。

把下面的脚本存成 `/tmp/scope-check.mjs`，然后从 `apps/server` 目录执行 ——
**必须在该目录执行**：工作区依赖（`@agenthub/memory`）只链接在 `apps/server/node_modules` 下。
另外 `import "@agenthub/memory"` 解析到的是**构建产物 `dist/`**（已被 gitignore）：
新克隆的仓库先跑一次 `pnpm --filter @agenthub/memory build`，否则会报 `ERR_MODULE_NOT_FOUND`。

```bash
cd apps/server && node --input-type=module < /tmp/scope-check.mjs
```

```javascript
// /tmp/scope-check.mjs
import { rmSync } from "node:fs";
import {
  setDbPath, initSchema, configureSearch, createJiebaSegmenter,
  reindexMemories, createMemory, searchMemories,
} from "@agenthub/memory";

// 每次从空库开始：不清掉临时库的话，重跑会追加两条重复记忆，
// 下面印出来的「期望输出」就对不上了（第一次跑是对的，第二次全错）。
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`/tmp/mem-scope-check.db${suffix}`, { force: true });
}

setDbPath("/tmp/mem-scope-check.db");   // 临时库，不碰 .agenthub/memory.db
initSchema();
const segmenter = createJiebaSegmenter();
configureSearch({ segmenter });   // 只开 BM25 路 —— 这一段验的是作用域，不是向量
reindexMemories(segmenter);       // 必须：新进程里 isBm25Ready() 恒为 false，
                                  // 不跑这步 BM25 路会整体跳过，结果全是空的

const userId = "u-verify";
const A = "conv-A", B = "conv-B";
createMemory({ userId, conversationId: A, agentId: "agent-1", type: "decision",
               content: "项目 A 的缩进约定是 tab", tags: ["缩进"] });
createMemory({ userId, conversationId: B, agentId: "agent-1", type: "decision",
               content: "项目 B 的缩进约定是 2 个空格", tags: ["缩进"] });

for (const [label, conv, own, other] of [["A", A, "tab", "2 个空格"], ["B", B, "2 个空格", "tab"]]) {
  const hits = (await searchMemories({ query: "缩进约定是什么", userId,
                                       scope: { conversationId: conv } })).map(h => h.content);
  const ok = hits.some(c => c.includes(own)) && !hits.some(c => c.includes(other));
  console.log(`${label}: ${ok ? "PASS" : "FAIL"} -> ${JSON.stringify(hits)}`);
}

const all = (await searchMemories({ query: "缩进约定是什么", userId,
                                    scope: { allConversations: true } })).map(h => h.content);
console.log(`allConversations -> ${JSON.stringify(all)}`);
```

**期望输出（逐字）：**

```
A: PASS -> ["项目 A 的缩进约定是 tab"]
B: PASS -> ["项目 B 的缩进约定是 2 个空格"]
allConversations -> ["项目 A 的缩进约定是 tab","项目 B 的缩进约定是 2 个空格"]
```

- `PASS` 同时断言了两件事：**自己的那条在**，**对方的那条不在**。
- 第三行是**反面对照**：显式写 `allConversations: true` 时两条都回来 ——
  说明「只返回一条」不是因为检索不到，而是作用域在排他过滤。
- 若看到 `[memory] BM25 leg skipped: FTS index is not ready`，说明漏了 `reindexMemories`。

**HTTP 侧的补充检查**（可选，需要 server 在跑 + 一个真实 `conversationId`）：
`POST /api/memory/create` 两条，再 `GET /api/memory/list` 能看到它们、`orphanCount` 不变；
`GET /api/memory/search?q=缩进` 会**同时**返回两条 —— 这正是上面第三行的
`allConversations` 语义，不是 bug。

### 2. 配置被真正读取（P0，验的是 §4.9 那个 bug）

**为什么需要专门写下来：服务端日志从不打印 LLM 模型名**，配错或静默兜底时
日志上完全看不出来。唯一可靠的观察点是**提取请求实际带的 `model` 字段**。

用一个本地桩把 LLM 流量接住并打印请求体：

```bash
node -e '
require("http").createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const m = JSON.parse(body || "{}");
    console.log(new Date().toISOString(), req.url, "model=", m.model,
                "| system:", String(m.messages?.[0]?.content ?? "").slice(0, 40));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "[]" } }] }));
  });
}).listen(8899, () => console.log("LLM stub on :8899"));
'
```

`{"choices":[{"message":{"content":"[]"}}]}` 是**合法**响应：提取器解析出一个空操作数组、
不写任何记忆，链路照常跑完。

1. 把根 `.env` 暂时改成 `LLM_BASE_URL=http://127.0.0.1:8899`（`config.llm.endpoint`
   会自动拼成 `/v1/chat/completions`），`LLM_MODEL=model-alpha`。
2. 重启 server，在 UI 里发一条消息。
3. 观察桩的输出，找到 system prompt 以 `You are a memory extraction system` 开头的那一行
   （携带 `temperature: 0.1` 的**记忆提取**请求；同一路还会收到意图分析请求，
   两者用的是同一个 `config.llm.model`）：

   ```
   ... /v1/chat/completions model= model-alpha | system: You are a memory extraction system.
   ```
4. 把 `.env` 改成 `LLM_MODEL=model-beta`，**重启 server**（`dotenv` 只在进程启动时读一次
   `.env`，热改文件无效），再发一条同样的消息。

**期望：桩上打印的 `model=` 从 `model-alpha` 变成 `model-beta`。**

若两次都是同一个值（或变成一个你没配过的名字），说明配置链路又出现了静默兜底 ——
这正是要根除的那类缺陷。验证完记得把 `.env` 改回来。

### 3. 双路各自独立贡献（需要 embedding 配置）

先按 `embedding-setup.md` 把 Ollama + `bge-m3` 配好、重启 server。然后存成
`/tmp/legs-check.mjs`，同样在 `apps/server` 下执行：

```bash
cd apps/server && node --input-type=module < /tmp/legs-check.mjs
```

```javascript
// /tmp/legs-check.mjs
import { rmSync } from "node:fs";
import {
  setDbPath, initSchema, configureSearch, createJiebaSegmenter, reindexMemories,
  createMemory, searchMemories, createOpenAICompatibleEmbeddingProvider,
  createMemoryVectorIndex, startEmbeddingWorker,
} from "@agenthub/memory";

// 每次从空库开始（理由同第 1 段）：不清库重跑会写进重复记忆，
// 两条路都会多召回几条，输出不再可比。
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`/tmp/mem-legs-check.db${suffix}`, { force: true });
}

setDbPath("/tmp/mem-legs-check.db");
initSchema();
const segmenter = createJiebaSegmenter();
const userId = "u-verify", conv = "conv-legs";

const IDENTIFIER_QUERY = "E_CONN_RESET";      // 精确标识符 → BM25 主场
const PARAPHRASE_QUERY = "容器编排文件放哪了";  // 与下面第二条记忆**无共同词项** → 只有向量路可能命中

createMemory({ userId, conversationId: conv, agentId: "agent-1", type: "error_pattern",
               content: "错误码 E_CONN_RESET 表示连接被对端重置", tags: ["错误码"] });
createMemory({ userId, conversationId: conv, agentId: "agent-1", type: "context",
               content: "沙箱镜像预热脚本在 docker-compose.yaml 里", tags: ["沙箱"] });

// ① 只开 BM25 路
configureSearch({ segmenter });
reindexMemories(segmenter);
for (const q of [IDENTIFIER_QUERY, PARAPHRASE_QUERY]) {
  const hits = (await searchMemories({ query: q, userId,
                                       scope: { conversationId: conv } })).map(h => h.content);
  console.log(`BM25-only  ${JSON.stringify(q)} -> ${JSON.stringify(hits)}`);
}

// ② 两路都开
const provider = createOpenAICompatibleEmbeddingProvider({
  baseUrl: "http://127.0.0.1:11434/v1", apiKey: "EMPTY", model: "bge-m3", dim: 1024,
});
const index = createMemoryVectorIndex();
configureSearch({ segmenter, embeddingProvider: provider, vectorIndex: index });

const worker = startEmbeddingWorker({ provider, index, intervalMs: 0 });
console.log("embed runOnce ->", JSON.stringify(await worker.runOnce()),
            "pending:", worker.pendingCount());
for (const q of [IDENTIFIER_QUERY, PARAPHRASE_QUERY]) {
  const hits = (await searchMemories({ query: q, userId,
                                       scope: { conversationId: conv } })).map(h => h.content);
  console.log(`both legs  ${JSON.stringify(q)} -> ${JSON.stringify(hits)}`);
}
```

**期望输出：**

```
BM25-only  "E_CONN_RESET" -> ["错误码 E_CONN_RESET 表示连接被对端重置"]
BM25-only  "容器编排文件放哪了" -> []
embed runOnce -> {"processed":2,"failed":0} pending: 0
both legs  "E_CONN_RESET" -> ["错误码 E_CONN_RESET 表示连接被对端重置", ...]
both legs  "容器编排文件放哪了" -> [... "沙箱镜像预热脚本在 docker-compose.yaml 里" ...]
```

> **这组期望值的出处：本地桩（固定返回同一个 1024 维单位向量）跑出来的，
> 不是 `bge-m3` 的真实输出。** 上面 `processed: 2 / failed: 0` 依赖「端点正常且不返回 NaN」，
> 换成真实模型后 `failed` 很可能不是 0。实测对着 `ollama serve`（模型尚未 pull）跑同一脚本，
> 得到的是 `embed runOnce -> {"processed":0,"failed":2} pending: 2` —— 这不是 bug，
> 而是本节的降级路径在起作用（BM25 两行仍然照常命中）。
>
> **`failed` 非零时，用日志区分两种成因，别把「模型缺陷」读成「链路坏了」：**
>
> - `Embedding request failed: HTTP 404 … model "bge-m3" not found` → 端点/模型没就绪（先 `ollama pull bge-m3`）
> - `Embedding contains a non-finite value at doc[…]` → 命中 `bge-m3` + Ollama 的已知 NaN 缺陷。
>   上面两条 fixture 都是技术文档，正落在触发区间内（见 `embedding-setup.md` 的 NaN 一节）。
>   这类记忆仍留在 BM25 榜单里，靠 `globalPendingCount` 是否回落来区分。
>
> 第三、四行的命中条数取决于真实相似度是否过得去 `minSimilarity = 0.35`
> （桩把相似度全算成 1.0，所以桩下会多带出无关记忆）。断言写在
> 「**同一查询从空变为非空**」这一层，不要断言具体条数。

怎么读这个结果：

- **第一行证明 BM25 路独立成立**：`E_CONN_RESET` 这类 token 在 embedding 词表里
  语义稀薄，能召回它的是精确匹配。**第二行证明这条路确实只靠词项** ——
  改写查询没有任何共同词项（可与 `seg.cut()` 对拍），BM25 榜单是空的。
- **第四行证明向量路独立成立**：同一个改写查询在只开 BM25 时返回空，
  开了向量路之后命中了那条记忆 —— 这个命中只可能来自向量路。
  （返回结果里可能还带出别的记忆，取决于相似度是否过得去 `minSimilarity = 0.35`；
  这正是 Spec 2 要用消融实验标定的参数。）
- **`processed: 2` / `pending: 0`** 说明嵌入队列确实被 worker 消化了；
  若 `pending` 长期不降，去看 `embedding-setup.md` 的 NaN 一节。

## Dependencies

```
@agenthub/shared ──▶ @agenthub/memory ──▶ @agenthub/server
                          │
                          ├── better-sqlite3        (runtime)
                          └── jieba-wasm            (runtime，中文预分词词典)
```

## 实现状态

对照 spec §14 的分阶段计划，全部落地：

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | 会话作用域管道（`conversationId` 落库、`userId` 必填、`MemoryScope` 检索过滤）+ §4.9 配置 bug 修复 | 已完成 |
| P1 | `PRAGMA user_version` 迁移框架 + `content_seg` / `tags_seg` + FTS rebuild | 已完成 |
| P2 | jieba 预分词 + OR 查询构造 | 已完成 |
| P3 | `EmbeddingProvider`（不对称接口）+ 向量索引 + 后台 worker（可选能力） | 已完成 |
| P4 | RRF 融合 + `searchMemories` 双路异步化 | 已完成 |
| P5 | 触发链路修正：单 agent 路径注入、并发限流、`updateMemory` 就地更新 | 已完成 |
| P6 | 集成测试（§7.1 正反面场景）+ 文档 | 本文件 |

留给 Spec 2：`minSimilarity` 的取值标定、混合检索相对纯 BM25 的净收益、
跨会话「另做一路」是否值得做。
