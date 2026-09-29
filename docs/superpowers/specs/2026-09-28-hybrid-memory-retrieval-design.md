# 长期记忆混合检索（Hybrid Retrieval）设计

> 日期：2026-09-28
> 状态：设计待确认
> 目标读者：能读 TypeScript 的开发者
> 范围：Spec 1 / 共 2 份。本份做「检索范围 + 检索质量 + 触发链路」三件事，不做评测框架（见 Spec 2）。
>
> **本份的起点是作用域，不是算法。** 记忆的作用域是「当前会话」（§1.1）——这决定了检索过滤、写入链路、去重语义、甚至数据迁移的处理方式。混合检索（BM25 + 向量 + RRF）是在这个边界**之内**提升召回质量的手段。反过来设计会得到一个技术上正确、语义上错误的结果。

## 1. 概述

`@agenthub/memory` 目前用 SQLite FTS5 单路检索长期记忆。实测下来它有三个独立的失效：

1. **中文基本检索不出来。** FTS5 的 `unicode61` 分词器不切分 CJK，整句被当成一个 token，只有整句精确匹配才命中。
2. **查询构造本身是错的。** `search.ts` 把用户原文直接塞进 `MATCH`，FTS5 把空格分隔的词按 **AND** 处理，多词查询几乎必然返回空。
3. **单 agent 路径根本不注入记忆**（只有 orchestrator 路径注入）。1:1 聊天里记忆只写不读。
4. **记忆没有会话归属，且检索不按会话过滤。** 而本系统的实际使用方式是「**一个项目 = 一个会话**」（§4.7）。记忆本该是那个项目的档案，现在却是一锅没分类的粥。
5. **检索缺 `userId` 过滤，存在跨租户泄漏。** `extractor.ts:141` 与 `executor.ts:135` 都只按 `agentId` 过滤。多个用户导入同一个 Agent 时，A 的记忆会被召回到 B 的提示词里（§4.8）。

本设计引入**双路混合检索**（BM25 + 向量）并用 RRF 融合，把检索范围收窄到**当前会话**，同时修好上述五个问题。

**为什么是混合而不是纯向量：** 两路覆盖不同的查询形态，不是冗余。

| 查询形态 | 更强的路 | 具体场景 |
|---|---|---|
| 同义改写、语义相近 | 向量 | 存「偏好 tab 缩进」，查「帮我写个格式化脚本」 |
| 中文自然语言 | 向量 | 「我之前说的那个代码风格」 |
| 错误码、文件路径、变量名 | **BM25** | 查 `E_CONN_RESET`、`workspacePath` |

第三类是关键：这类 token 在 embedding 模型的词表里语义稀薄，向量路基本失效，而 BM25 是精确匹配。记忆类型中的 `fact`（API 端点、配置）与 `error_pattern`（错误码）正属于此类。

**这三个判断目前是基于推理，不是基于数据。** 用数据验证它们是 Spec 2 的任务（见 §16）。

### 1.1 记忆的归属范围：会话内为主

**这是本设计的第一性决策，其余设计都从它推导。**

本系统的实际使用方式是一条**客户端约定**：一个 Agent ↔ 一个 Single Conversation ↔ 一个项目工作区。用户「重新开个窗口」回到的是**同一个 Conversation**，不是新建一个。因此：

> **长期记忆的主要用途是回答「这个项目之前做了什么」。而「这个项目」在数据模型里就是 `Conversation`。**

所以检索的过滤范围是 **`conversation_id` 排他过滤**——只搜本会话。

**为什么排他，而不是「本会话优先 + 全局兜底」：** 项目之间会**互相矛盾**。项目 A 约定 tab 缩进，项目 B 约定 2 空格，两者都成立。若允许跨会话召回，A 的会话里可能被注入 B 的约定，且没有任何信号能提示模型这是外来上下文。排他过滤让每个项目的记忆自洽。

**代价（明确接受）：** 用户级偏好（「这个人喜欢简洁回答」）这类真正的跨会话知识，在项目会话里**不会**被召回。恢复它需要「另做一路」，见 §16 第 6 条——本份不做。

**作用域的选择与 `history` 的处理方式一致。** `listMessages(conversationId, …)` 返回该会话内**所有** agent 的消息，不区分 sender。记忆同样按会话聚合、不按 agent 切分——两者边界一致，避免「历史跨 agent 共享，记忆却只属于单个 agent」这种自相矛盾的语义。因此 **`agentId` 从检索过滤条件降级为记忆的元数据**（仍存储、仍可用于展示与筛选，但不再参与召回）。

---

## 2. 术语表

| 术语 | 含义 |
|---|---|
| 向量路 / BM25 路 | 混合检索的两条召回通道，各产出一个按相关性排序的记忆 id 榜单 |
| 榜单（list） | 单条路产出的有序 id 列表，RRF 的输入 |
| 融合（fusion） | 把多个榜单合成一个最终排序 |
| RRF | Reciprocal Rank Fusion，只用名次不用分数的融合算法 |
| 待嵌入（pending） | 存在于 `memory_records` 但 `memory_embeddings` 中无对应行（或行中 `model` 不匹配）的记忆 |
| 预分词 | 写入与查询前，在应用层把中文切成词并用空格连接，使 `unicode61` 得到真正的词级 token |
| 归一化 | 把向量缩放为单位长度，使余弦相似度等于点积 |
| 转 | 一轮对话：一条用户消息 + 一条 Agent 回复 |
| 会话作用域（conversation scope） | 检索时以 `conversation_id` **排他**过滤，只返回本会话产生的记忆 |
| 无主记忆（orphan） | `conversation_id IS NULL` 的历史记忆。排他过滤下**永不被召回**（§9.6） |
| `MemoryScope` | 检索作用域的**必填**参数，判别联合：`{conversationId}` 或 `{allConversations:true}`。无默认值（§11） |

---

## 3. 目标与非目标

### 目标

1. **记忆按会话隔离**：检索只在当前 `conversation_id` 内进行，使记忆成为「这个项目的档案」。
2. **打通 `conversation_id` 链路**：写入端要传值（当前全链路都不传），检索端要过滤（当前无该参数）。见 §4.7。
3. **中文关键词检索可用**：2 字词、多词概念查询都能召回。
4. **语义召回可用**：同义改写的查询能命中语义相近的记忆。
5. **单 agent 路径也注入记忆**，与 orchestrator 路径行为一致。
6. **写入路径不因 embedding 而变慢或丢数据**：embedding 服务不可用时记忆仍能保存。
7. **引入 schema 迁移机制**，使后续 schema 变更可安全落地。
8. 修复 `update` 的语义（当前是 `delete + create`，会更换 id 并重置 `created_at`）。
9. **消除跨租户记忆泄漏**：检索必须同时按 `userId` 过滤（§4.8）。
10. **修掉「配置存在但从未生效」这一类缺陷**（§4.9）：统一环境变量名、去掉静默兜底、让记忆提取走服务端的配置解析。
11. **新增的 embedding 配置不重复上述错误**：四个必填项、无默认值、维度与端点响应校验（§10.2、§8.1）。

### 非目标（明确排除）

| 不做 | 理由 |
|---|---|
| 评测框架、golden set、消融实验 | 属于 Spec 2，本份落地后才有东西可测 |
| 分块（chunking） | 长期记忆是 LLM 提炼过的原子事实，不是长文档。再切会破坏语义（详见 §7.3） |
| 向量库外部化（Qdrant/Chroma） | 违背仓库「无需数据库容器」原则 |
| 把 `memory.db` 与业务库合并 | `prisma db push` 会删掉 FTS5 影子表，丢索引（见 `CLAUDE.md`） |
| 多实例横向扩展 | SQLite 单写者，本设计不改变该约束 |
| Web UI 改动 | 与检索质量正交 |
| 记忆的衰减 / TTL / 遗忘策略 | 需要评估数据支撑，留给 Spec 2 之后 |
| **跨会话记忆召回**（用户级偏好） | 与 §1.1 的排他作用域直接冲突。需要「另做一路」并解决冲突消解，见 §16 第 6 条 |
| 把「项目」抽象成独立实体 | 当前 `Conversation` 事实上充当了项目（§4.7）。新增 `Project` 模型是更大的改动，在约定被打破之前没有收益 |
| 修复 `AddAgentView.tsx:50` 重复建会话 | 属于客户端 bug，与本设计的服务端检索链路正交。**但它会制造孤儿记忆**，因此列入 §16 第 7 条跟踪 |
| **部署 / 运维 embedding 端点** | 选型（§10.1）给出建议与判据，但**开哪个账号、要不要自建、谁来运维是部署决策**，不是本设计的内容。本设计只提供配置接口与未配置时的明确降级 |

---

## 4. 现状（读代码得到的事实）

本设计的每一条都基于以下实际读到的代码，不是推测。

### 4.1 写入触发

| 位置 | 路径 | 频率 |
|---|---|---|
| `apps/server/src/routes/messages.ts:768` | 单 agent | agent 回复完成后 1 次 |
| `apps/server/src/routes/messages.ts:440` | orchestrator | **每个子任务各 1 次** |

两处都是 fire-and-forget（`.catch()` 吞错）。**目前没有任何并发上限或限流**：orchestrator 路径下一轮用户消息会触发 N 次并发 LLM 提取（N = 子任务数）。

### 4.2 读取触发

| 位置 | 场景 | 频率 |
|---|---|---|
| `apps/server/src/orchestrator/executor.ts:135` | orchestrator `buildContext()` | 仅首个 SubTask，一次，`limit: 5` |
| `packages/memory/src/extractor.ts:141` | 提取时查已有记忆做去重对比 | 每次提取 5 条 |
| `apps/server/src/routes/memory.ts:116` | 用户手动搜索 | 按需 |

**三个调用点都不带 `conversationId`；前两个还不带 `userId`（§4.7、§4.8）。** `routes/memory.ts:116` 是用户在 Web UI 里主动全库搜索，语义上**不应该**被会话作用域限制（用户就是要翻所有记忆）——该处的 `conversationId` 保持可选（§11）。

**缺口：`messages.ts:673` 的单 agent 路径手工构造 context，只有 `agent.systemPrompt` 与 `pinnedContext`，没有记忆注入。** 该路径下记忆只写不读。

### 4.3 一个正反馈环

`extractor.ts:141` 在提取时用 `searchMemories` 找 5 条已有记忆交给 LLM 做去重判断。而该搜索是坏的（§4 第 1、2 条）→ **去重判断基本失效** → 相似记忆被反复 `add` → 记忆库堆满重复 → 检索结果被同质内容淹没。

修好检索会同时改善写入质量。这是本设计的额外收益，不是副产品。见 §7.4 场景四。

### 4.4 `update` 是伪装的

`packages/memory/src/extractor.ts:201-215`：

```ts
const txn = db.transaction(() => {
  deleteMemory(id, db);
  return createMemory({ ... });   // 新 UUID
});
```

语义是「更新」，实现是「删了重建」。后果：`created_at` 被重置（丢失记忆年龄）、id 变更（`sourceMessageId` 溯源链断裂）、向量行若不清理会产生孤儿。

### 4.5 无迁移机制

`packages/memory/src/schema.ts` 的 `initSchema()` 只有 `CREATE TABLE IF NOT EXISTS`。对已存在的库，它**静默跳过**任何结构变更。换分词器必须 `DROP` 再 `CREATE` 虚表并重建索引，`IF NOT EXISTS` 做不到——会导致「看着修好了其实没修」。

### 4.6 文档与实现已漂移

`docs/architecture/long-term-memory.md:221-250` 声明 `createMemory` / `searchMemories` 返回 `Promise`，实际实现是同步的。本设计完成后该文档需同步更新。

### 4.7 「一个项目 = 一个会话」是客户端约定，且 `conversation_id` 从未被写入

**这是本设计最重要的一条现状，也是 §1.1 的作用域决策所依赖的前提。**

#### 约定确实存在

| 事实 | 位置 |
|---|---|
| `findSingleConversationByAgentId(userId, agentId)`：查 `type=Single && !isArchived` 且 `contactIds` 含该 agent 的会话 | `packages/db/src/repositories/conversation.ts:80-96` |
| `GET /conversations/find-by-agent/:agentId` 暴露它 | `apps/server/src/routes/conversations.ts:214` |
| `Sidebar.tsx:41`、`AgentManageView.tsx:62`、`(market)/agents/[id]/page.tsx:66` 三个入口都是**先查、查不到才建** | `apps/web` |

所以「一个 Agent 只有一个 Single 会话」在实践中成立，**用户重开窗口回到的是同一个 `Conversation`** → `conversation_id` 稳定 → 会话作用域可行。

#### 但它是约定，不是约束

| 风险 | 位置 | 后果 |
|---|---|---|
| **`AddAgentView.handleSelectAgent` 没有先查，无条件 `createConversation`** | `apps/web/components/AddAgentView.tsx:50` | 从「添加 Agent」入口进入会**造出第二个 Single 会话** |
| schema 层面无唯一约束（`contactIds` 是 Json 列，SQLite 无法建唯一索引） | `packages/db/prisma/schema.prisma` `Conversation` | 服务端不阻止重复 |
| `findSingleConversationByAgentId` 取 `lastActiveAt desc` 的第一条 | `conversation.ts:93-95` | 一旦重复，**只有最新的那个可被召回**，旧会话的记忆成为孤儿 |
| `workspacePath` 由 conversation id 派生，删会话会连带删除项目目录 | `conversations.ts:112`、`204-207` | 「项目」的物理身份也绑在 conversation 上 |

**本设计的处理：** 不在本份里修客户端 bug（超出检索链路范围），但把它列入 §16 第 7 条跟踪，并在 §12 记录「孤儿记忆」这一现象。排他过滤让重复会话的代价从「召回噪声」变成「召回缺失」——更容易发现，也更安全。

#### `conversation_id` 的管道完全不存在

| 环节 | 现状 |
|---|---|
| `extractMemories` 参数 | 类型里**没有** `conversationId` 字段 |
| `messages.ts:768`（单 agent）、`messages.ts:440`（orchestrator） | 调用时**都不传** |
| `extractor.ts` | 从不把 `conversationId` 传给 `createMemory` |
| 结果 | `memory_records.conversation_id` **恒为 NULL**；`schema.ts:21` 的 `idx_memory_conversation` 索引的是一个恒为 NULL 的列 |
| `searchMemories` | 无会话过滤参数 |

**所以这不是「改一个 WHERE 条件」，而是要新建整条管道。** 这是 §14 阶段 **P0** 的主要工作量。

### 4.8 检索缺 `userId` 过滤 → 跨租户泄漏

两处检索**只按 `agentId` 过滤，没有 `userId`**：

| 位置 | 代码 |
|---|---|
| `packages/memory/src/extractor.ts:141` | `searchMemories({ query: params.userMessage, agentId: params.agentId, limit: 5 }, db)` |
| `apps/server/src/orchestrator/executor.ts:135` | `searchMemories({ query: subtask.instruction, agentId: subtask.agentId, limit: 5 })` |

`Agent = Contact`（见 `CLAUDE.md`），而用户可以通过 `POST /api/contacts/create` 导入别人发布的 Agent 得到**自己的** Contact 行（`apps/web/src/app/(market)/agents/[id]/page.tsx:83`）。因此两个用户的 `agentId` 通常不同——但只要出现任何一种 agentId 复用（同一 Contact 被多个用户共享、数据导入、测试夹具、未来的团队共享 Agent），**A 的记忆就会被召回到 B 的提示词里**。

这不是理论风险：`searchMemories` 的 `userId` 参数**是可选的**，而唯一的两个自动化调用点都漏了它。测试里也不会失败，因为单用户场景下结果完全正确。

**处理：** 把 `userId` 与 `conversationId` 一并改为**必填**（§11），使漏传成为编译错误而非静默泄漏。

### 4.9 环境变量名不匹配 → 配置从未生效（同类第四例）

**这是本设计在做 embedding 选型时顺带发现的、正在运行的 bug。**

`.env` 与 `.env.example` 里写的是：

```
API_KEY=...
BASE_URL=https://api.deepseek.com
MODEL=deepseek-v4-flash
```

而代码读的是 **`LLM_BASE_URL` / `LLM_MODEL`**：

| 位置 | 代码 |
|---|---|
| `apps/server/src/config/env.ts:51` | `env["LLM_BASE_URL"] \|\| "https://api.deepseek.com"` |
| `apps/server/src/config/env.ts:54` | `env["LLM_MODEL"] \|\| "deepseek-chat"` |
| `packages/memory/src/extractor.ts:51` | `process.env["LLM_BASE_URL"]?.replace(/\/+$/, "")` |
| `packages/memory/src/extractor.ts:57` | `llmConfig?.model ?? process.env["LLM_MODEL"] ?? "deepseek-chat"` |

**`BASE_URL` 与 `MODEL` 是死键，没有任何代码读取。** 后果：

| 用户以为的 | 实际发生的 |
|---|---|
| 模型 = `deepseek-v4-flash` | `LLM_MODEL` 未设 → 兜底 → **`deepseek-chat`** |
| 端点 = `https://api.deepseek.com` | `LLM_BASE_URL` 未设 → 兜底到**同一个字符串**（碰巧正确，掩盖了问题） |

**端点的兜底值恰好等于配置值，正是这个 bug 能长期存在的原因**——若用户把 `BASE_URL` 指向一个代理，配置会被完全忽略而继续直连 `api.deepseek.com`，且没有任何征兆。

补充事实：`packages/memory/src/extractor.ts` **直接读 `process.env`**，不接收 `apps/server` 已解析的 `config.llm`；而 `messages.ts` 的两个调用点也都没传 `llmConfig`。因此记忆提取这条链路**完全绕开了服务端的配置解析**。

**本条与 §4.5、§4.7、§4.8 是同一类缺陷的第四次出现**（§13 末尾会汇总）：

| 编号 | 静默失效 | 掩盖机制 |
|---|---|---|
| §4.5 | `CREATE TABLE IF NOT EXISTS` 跳过结构变更 | 无报错，「看着修好了其实没修」 |
| §4.7 | `conversation_id` 恒为 NULL | 该列从未被任何查询或测试观察过 |
| §4.8 | `userId` 可选 → 调用点漏传 | 单用户测试全绿 |
| **§4.9** | **环境变量名不匹配 → 读到 `undefined`** | **`?? "deepseek-chat"` 兜底，且端点兜底值恰好正确** |

**本设计的处理：**

1. **修掉它**（属于 §15 交付物）——统一为 `LLM_BASE_URL` / `LLM_MODEL`，或反过来改代码读 `BASE_URL` / `MODEL`。**选前者**：`.env.example` 是文档，改文档比改代码影响面小；且 `LLM_` 前缀与新的 `EMBEDDING_` 前缀对称。
2. **去掉 `?? "deepseek-chat"` 兜底**——与 §10.2 对 embedding 的处理一致：配置缺失应显式失败或显式降级，不应猜测。
3. **`extractor.ts` 改为接收解析后的 config**，不直接读 `process.env`。这同时修掉「记忆提取绕开服务端配置」的问题。

这条**不是本设计引入的**，但如果不修，§10 新增的 4 个 `EMBEDDING_*` 变量会以完全相同的方式失效。

---

## 5. 架构总览

```
searchMemories({ query, userId, scope, limit })   ← 签名变异步；scope 必填（§11）
        │
        ├──────────────────────────┬──────────────────────────────┐
        ▼                          ▼                              │
   ┌─────────────┐            ┌─────────────┐                     │
   │  向量路      │            │  BM25 路     │                     │
   │  （新增）    │            │  （修复）     │                     │
   └─────────────┘            └─────────────┘                     │
        │                          │                              │
   EmbeddingProvider          segment(query)                      │
   .embedQuery(query)         → 构造 OR 查询                       │
        │                          │                              │
        ▼                          ▼                              │
   VectorIndex.search         memory_fts                          │
   (BLOB + JS 余弦)           MATCH ... ORDER BY rank             │
   带 user/会话 过滤                                                 │
        │                          │                              │
        ▼                          ▼                              │
   [{memoryId, score}]        [{memoryId, rank}]                  │
   (低于阈值则丢弃)                                                 │
        │                          │                              │
        └────────────┬─────────────┘                              │
                     ▼                                            │
              RRF 融合（只用名次）                                  │
                     ▼                                            │
               top-limit 的 id                                     │
                     ▼                                            │
        回查 memory_records 取完整记录 ───────────────────────────┘
                     ▼
              MemoryRecord[]
```

**关键设计：两路各自独立失败，融合层不写降级分支。**

- 某条记忆尚未嵌入 → 它只出现在 BM25 榜单，向量榜单没有它 → RRF 照样给分
- 查询向量化失败 → 向量榜单为空 → RRF 退化为纯 BM25
- 任一路抛错 → 捕获后视为空榜单，不影响另一路

这是选 RRF 而非加权求和的核心理由：**它融合的是「榜单」，缺失的榜单自然是空集，无需任何 if-else。**

---

## 6. 端到端流程

本节把 §5 的零件拼成完整链路。三个流程：写入、后台嵌入、读取。

### 6.1 写入流程（存储）

```
[Agent 回复完成]
        │
        ├─ 单 agent 路径：messages.ts:768
        └─ orchestrator 路径：messages.ts:440（每个子任务各一次）
        │
        ├─ ① 并发限流信号量（上限 2，超出排队不丢弃）        ← 新增
        ▼
extractMemories({ userId, conversationId, agentId, agentName, userMessage, agentResponse })
        │                              ↑
        │                    新增，由调用方（messages.ts）传入
        │
        ├─ ② searchMemories({ query: userMessage, userId,
        │                     scope: { conversationId } }) 取 top-5 已有记忆
        │     ← 双路检索，作用域 = 本会话（§1.1、§11）
        │     §4.3：检索修好后，这里的去重判断才真正有效
        │     §1.1：去重也限定在本会话内，因此项目 A 与项目 B 的
        │           矛盾约定不会互相覆盖
        │
        ├─ ③ LLM 提取 → [{ action, id?, type, content, importance, reason }]
        ▼
逐条执行：
        add    → createMemory({ ..., conversationId })
        update → updateMemory()          ← 不再是 delete + create
        delete → deleteMemory()
        noop   → 跳过
        │
        ▼
createMemory / updateMemory（同步，无网络调用）：
        content_seg = segmenter.cut(content).join(" ")
        tags_seg    = tags.flatMap(t => segmenter.cut(t)).join(" ")
        INSERT / UPDATE memory_records（含 conversation_id）
            ├─ 触发器同步写 memory_fts          ⇒ BM25 路【立即可查】
            └─ memory_embeddings 无此行（或被删除）⇒ 【进入待嵌入队列】
        │
        ▼
[返回，不等待 embedding]
```

**`conversationId` 必须是必填参数，不是可选。** 若做成可选，两条调用链（`messages.ts:440`、`messages.ts:768`）会像 `userId` 那样静默漏传（§4.8），而后果是全部记忆变成永不可召回的孤儿（§9.6）。让它成为编译错误是唯一可靠的防线。

**三个要点：**

1. **写入路径不调用 embedding。** 所以写入是同步的、零网络延迟的，embedding 服务挂了也不影响写入。
2. **两条索引的更新时机不同**——FTS 同步即时，向量异步秒级。这个窗口是设计的一部分，不是缺陷；RRF 天然处理（见 §7.1）。
3. **`content_seg` 由写入方计算**，不能放在 SQLite 触发器里（触发器无法调用 JS 分词器）。

### 6.2 后台嵌入流程

```
每 intervalMs（默认 5000ms）触发一次 runOnce()：
        │
        ▼
pending = SELECT r.id, r.content
          FROM memory_records r
          LEFT JOIN memory_embeddings e ON e.memory_id = r.id
          WHERE e.memory_id IS NULL OR e.fingerprint != ?
          LIMIT batchSize（默认 32）
        │
        ├─ 为空 → 跳过本轮
        ▼
provider.embedDocuments(contents)           ← 一次批量网络调用
        │
        ├─ 校验每条向量长度 == provider.dim（不符即抛错，见 §8.1）
        ├─ 失败 → 记录日志，本轮结束，不推进、不丢弃，下轮重试
        ▼
INSERT OR REPLACE INTO memory_embeddings
  (memory_id, fingerprint, model, dim, vec)  ← 幂等，可重复执行
        │
        ▼
向量路可查
```

**写入行里的 `fingerprint` 就是下一轮 `WHERE` 的比较对象**——队列的推进与失效判据是同一个值，不可能不一致。这是「无状态队列」能成立的关键：不需要额外的 `status` 或 `indexed_at` 列，也不需要它们与真实情况保持同步。

**「待嵌入」不需要状态列，它就是「没有对应向量行」。** 好处：

- 没有状态机，没有 `status` 列能写错误
- 天然自愈：行没了就再入队；worker 崩了重启即可继续
- **模型变更自动重新入队**——查询里的 `e.fingerprint != ?` 使换模型后所有旧向量自动作废重算
- **维度或前缀模式变更同样自动作废**——这是 `fingerprint` 而非 `model` 的价值：Qwen3-Embedding 同一模型名可服务多个维度（§8.1），只比 `model` 会让不同维度的向量混在同一个索引里而**不触发重算**

### 6.3 读取流程（检索）

```
searchMemories({ query, userId, scope, limit })     ← 异步
        │
        │  【作用域】userId + scope 由两条路共用
        │  scope = { conversationId } | { allConversations: true }   （§11）
        │  clause = buildScopeClause(scope)                          （§8.4）
        │
        ├─────────── BM25 路 ───────────┐
        │  if bm25Ready === false → 跳过 + warning（见 §9.4）
        │  ftsQuery = buildFtsQuery(query, segmenter)
        │  if ftsQuery === null → 跳过
        │  SELECT ... JOIN memory_records r
        │         ON r.rowid = fts.rowid
        │       WHERE memory_fts MATCH ftsQuery
        │         AND r.user_id = ?        ← 修复 §4.8
        │         AND {clause.sql}         ← 新增（§1.1）
        │       ORDER BY rank LIMIT 50
        │                                │
        ├─────────── 向量路 ────────────┤
        │  if provider 未配置 → 跳过
        │  provider.embedQuery(query)    ← 网络调用（这是必须异步的原因）
        │    失败 → 捕获，榜单为空
        │  index.search(qVec, 50, { userId, scope })
        │  丢弃 score < minSimilarity    ← 相关度下限（见 §8.5）
        │                                │
        ▼                                ▼
        fuseRankedLists([bm25List, vectorList])    ← RRF, k=60
        │
        ▼
     top-limit 的 memoryId
        │
        ▼
     回查 memory_records 取完整记录（保持融合后的顺序）
        │
        ▼
     MemoryRecord[]
```

**为什么 `searchMemories` 必须异步：** 它内部需要一次 embedding API 调用把 query 变成向量，这是 I/O。

**这不会改变「检索 → 拼进提示词」的流程。** 唯一的差别是调用方要 `await`：

```typescript
const memories = await searchMemories({ ... });   // ← 只多了 await
if (memories.length > 0) {
  systemParts.push(memories.map((m) => `[Memory - ${m.type}] ${m.content}`).join("\n\n"));
}
```

检索仍然是**阻塞等待结果后拼接**的，不是后台异步注入。真正 fire-and-forget 的是写入路径（§6.1）。

### 6.4 时序与延迟

| 环节 | 延迟 | 阻塞用户？ |
|---|---|---|
| 写入 `createMemory` | 微秒级（本地 SQLite 同步写） | —— |
| 提取 `extractMemories`（LLM） | 秒级 | 否，fire-and-forget |
| 后台嵌入 | ≤ `intervalMs` + 一次网络调用 | 否 |
| 检索 · BM25 | 亚毫秒 | **是** |
| 检索 · 查询向量化 | **~100–300ms（网络）** | **是** |
| 检索 · 暴力余弦 | 微秒–毫秒 | **是** |
| **检索总延迟** | **~100–300ms，由 embedding API 主导** | 是 |

**必须点明：读取路径引入了 100–300ms 的网络延迟**（查询向量化）。这是本设计**唯一**新增的同步延迟。

- orchestrator 路径：只发生一次（首个 SubTask，`_memoryInjected` 保证）
- 单 agent 路径：每次执行一次

**这个延迟有具体的解法，不是理论上的：** §10.1 推荐的落地路径就是**本地 Ollama**（`http://127.0.0.1:11434/v1`），同一套 `OpenAICompatibleEmbeddingProvider` 只改 `EMBEDDING_BASE_URL`，**100–300ms 降到毫秒级，且不需要任何 API key**。因此这张表描述的是**远程托管端点**下的情形，不是本设计的必然代价。

（进程内的 `fastembed` 等 ONNX 方案是另一条路，但它需要第二个 provider 实现——见 §10.1 的路径表。**在有 Ollama 的前提下没有必要**。）

---

## 7. 典型场景走查

以下场景用具体数据验证 §6 的流程确实成立，同时说明每一条设计决策在防什么。

### 7.1 场景一：长会话的项目续接（核心闭环）

**这是本设计要解决的**主要**问题**，也是 §1.1 会话作用域决策的场景依据。

**背景**：用户与 Agent「小助」1:1 聊一个叫「AgentHub 重构」的项目。按 §4.7 的约定，这个项目对应**一个** `Conversation`（记作 `C1`），已积累 200+ 条消息。走的是**单 agent 路径**——即本次修复的缺口。

#### 第一周（`C1` 的消息 #12）

```
用户: 这个项目缩进用 tab，别用空格
Agent: 好的，我记下了。
```

写入链路：

| 步骤 | 组件 | 动作 | 数据状态 |
|---|---|---|---|
| 1 | `messages.ts:768` | Agent 回复完成，触发提取 | 携带 `conversationId = C1`（**新增**） |
| 2 | `extractMemories` | LLM 分析这一轮 | 输出 `{action:"add", type:"preference", content:"用户偏好使用 tab 缩进", importance:7}` |
| 3 | `createMemory` | 分词 + 插入（同步） | `content_seg = "用户 偏好 使用 tab 缩进"`，**`conversation_id = C1`** |
| 4 | SQLite 触发器 | 同步写 `memory_fts` | **BM25 路立即可查** |
| 5 | —— | `memory_embeddings` 无此行 | **进入待嵌入队列** |
| 6 | worker（≤5s 后） | `embedDocuments(["用户偏好使用 tab 缩进"])` | 写入归一化向量 |
| 7 | —— | 向量行就位 | **向量路从此可查** |

> **第 5–7 步之间的窗口**：该记忆只在 BM25 榜单里。若此时发生检索，RRF 只拿到一个榜单，该记忆照常参与排序。**无需任何特殊分支**——这是 RRF 相对加权求和的核心优势。

#### 第三周（消息 #38）

```
用户: 连接池老是被打满，帮我看看
Agent: （排查后）pool_size 默认 10 太小，调到 20 之后压测通过了
```

同一套链路，写入一条 `{type:"error_pattern", content:"连接池被打满：pool_size 从 10 调到 20 后压测通过", conversation_id:"C1"}`。

#### 第八周：用户重新打开这个会话

用户关掉窗口、几天后回来，**回到的还是 `C1`**（§4.7 的先查后建）。此时 `C1` 已有 212 条消息。

```
用户: 上次那个连接池的问题后来怎么解决的？
```

读取链路：

| 步骤 | 组件 | 动作 | 结果 |
|---|---|---|---|
| 1 | **`history`** | `listMessages(C1, { limit: 50 })` | 只回 **#163–#212**。连接池讨论在 **#38** → **完全不可见** |
| 2 | 分词 | `cut("上次那个连接池的问题后来怎么解决的？")` | `["上次","那个","连接池","的","问题","后来","怎么","解决","的"]` |
| 3 | `buildFtsQuery` | OR 连接并转义 | `"上次" OR "那个" OR "连接池" OR …` |
| 4 | **BM25 路** | `MATCH` + `conversation_id = 'C1'` | 命中记忆 `"连接池 被打满 pool_size 从 10 调到 20 后 压测 通过"`（「连接池」是完整 token）→ **榜单第一** |
| 5 | **向量路** | 查询向量 vs 该会话的向量 | 语义高度相近 → **命中，score 0.78** |
| 6 | RRF 融合 | 两个榜单，该记忆在两路都排第一 | `1/(60+1) + 1/(60+1) = 0.0328`，**稳居第一** |
| 7 | 回查 | 按 id 取回 | `MemoryRecord` |
| 8 | 注入 | `systemPrompt` 追加 | `[Memory - error_pattern] 连接池被打满：pool_size 从 10 调到 20 后压测通过` |
| 9 | Agent | 回答 | 「上次是 pool_size 太小，从 10 调到 20 后压测通过了」 |

**这个场景说明三件事：**

1. **第 1 步是问题的根源。** `history` 按**条数**截断（`limit: 50`，`messages.ts:564` 与 `:1003`），不是按 token 预算。对长项目会话，第 50 条之前的一切对 agent 都不存在。这不是「记忆能改善体验」，而是**「除了记忆没有别的通路能触达」**。
2. **第 4 步证明了两件事。** 一是**预分词的价值**：「连接池」经分词后是完整 token，能被精确命中（若用 trigram 则「缩进」「接口」这类 2 字词会静默返回 0 行，`§7.3`）。二是**会话作用域对 BM25 也有独立收益**：候选集从「全库」缩到「本项目」后，IDF 的分母不再被其他项目的高频词稀释，「连接池」在本项目内的区分度更高、噪声更少。**作用域不只服务向量路，它同时改善 BM25。**
3. **第 5 步是向量路的独立贡献。** 若用户改问「上次那个数据库连接老是爆掉的毛病」（无「连接池」这个词项），BM25 空手而归，向量路单独扛住。

#### 改动前会怎样

| 环节 | 现状 | 后果 |
|---|---|---|
| `messages.ts:673` 单 agent 路径 | **不注入任何记忆** | 第 8 步根本不会发生 |
| `searchMemories` 查询构造 | 用户原文直塞 `MATCH`，AND 语义 | 即使注入了，9 个词的 AND 查询也返回空 |
| `conversation_id` | 恒为 NULL，检索不过滤 | 即使前两项修好，也会召回**其他项目**的记忆。最坏情况是 `C2` 那条语义极相近但**互相矛盾**的约定（见下方「会话隔离的验证」）排到第一，agent 据此给出与 `C1` 历史相反的建议 |
| `userId` | 不过滤 | 见 §4.8 |

用户的主观感受是「**它不是记不住，是根本没用上**」。四项叠加，修复才完整。

**注意第三项的性质与前三项不同**：前两项是「查不到」（漏召回），第三项是「查错了」（**错误召回**）。后者更危险——漏召回时 agent 会说「我不记得」，用户立刻知道；错误召回时 agent 会自信地按另一个项目的约定行事，**没有任何信号提示出了错**。

#### 会话隔离的验证（同一场景的反面）

**另一个项目**：用户与「小助」的第二个 `Conversation`（`C2`，项目「数据管道」），第一周写下：

```
用户: 数据管道这个项目缩进统一用 2 空格
```

**现在回到 `C1` 问**：「缩进该用几个？」

| 路 | 行为 |
|---|---|
| BM25 路 | `conversation_id = 'C1'` 过滤掉 `C2` 的 2 空格记忆；命中 `C1` 自己的 tab 记忆 |
| 向量路 | `C2` 的 2 空格记忆在语义上与查询**极其相近**（0.9+），若无 `conversation_id` 过滤必然排第一 → **注入了一个错误且矛盾的项目约定** |
| 结果 | 回答「tab」，与 `C1` 的历史一致 |

**这就是排他过滤的意义**：项目之间的约定会互相矛盾，而「矛盾」和「相关」在向量空间里无法区分——**只有作用域能区分**。

> **同时约束写入侧的去重检索**（§4.3、§6.1 第 ② 步）：`C2` 的 2 空格记忆**不会**出现在 `C1` 的去重候选里，因此二者不会被判定为「重复」而互相覆盖。**若去重检索不做会话过滤，就会出现「在 C2 说了一次 2 空格，C1 的 tab 约定被 update 掉」这种跨项目污染。** 写入侧与读取侧必须用同一个作用域。

### 7.2 场景二：精确标识符召回（BM25 路主场）

**存储**：`{type:"error_pattern", content:"E_CONN_RESET 错误由连接池耗尽引起，需调大 pool_size"}`

**查询**：「E_CONN_RESET 是什么原因」

| 步骤 | 组件 | 动作 | 结果 |
|---|---|---|---|
| 1 | 分词 | `cut("E_CONN_RESET 是什么原因")` | `["E_CONN_RESET","是","什么","原因"]` |
| 2 | BM25 路 | `"E_CONN_RESET" OR "是" OR "什么" OR "原因"` | **精确命中**，BM25 分数高（IDF 大） |
| 3 | 向量路 | `E_CONN_RESET` 在 embedding 词表里被切成碎片 | 相似度约 0.21 **< minSimilarity(0.35) → 被阈值丢弃** |
| 4 | RRF | 只有 BM25 榜单 | 命中 |

**说明**：这是 §1 表格第三行的具体体现。向量路在这里被 `minSimilarity` **主动丢弃**，BM25 单独扛住。

注意第 3 步：如果没有阈值，向量路会以 0.21 的低分把一个噪声结果送进 RRF，稀释 BM25 的精确命中。

### 7.3 场景三：中文 2 字词召回（预分词的价值）

**存储**：`content_seg = "用户 偏好 使用 tab 缩进 不要 空格"`

**查询**：「缩进」

| 方案 | 行为 |
|---|---|
| **trigram（已否决）** | `MATCH '"缩进"'` → 2 字符 < 3 → **静默返回 0 行，不报错** |
| **预分词（本设计）** | `cut("缩进")` → `["缩进"]` → `MATCH '"缩进"'` → `content_seg` 中「缩进」两侧有空格，是完整 token → **命中** |

**说明**：这就是分词方案从 trigram 改为预分词的具体收益。中文里 2 字词（缩进、接口、性能、偏好、配置、路径、错误）是最常见的词长，trigram 会在这类查询上静默失效。

**关于分块（chunking）**：本例中一条记忆 = 一个 chunk = 一个向量。长期记忆是 LLM 提炼过的**原子事实**（「用户偏好使用 tab 缩进」），本身就是 chunk 的理想形态——短、自包含、语义单一。给已经提炼过的事实再切一刀只会破坏语义。**因此本设计没有分块步骤。**

（真正需要分块的是「把整个会话或一整篇文档灌进向量库」的场景，不在本次范围。）

### 7.4 场景四：记忆被更新（去重闭环）

**仍在同一个项目会话 `C1`（第九周，用户改主意了）**

```
用户: 算了，这个项目缩进改成 2 个空格吧
```

| 步骤 | 组件 | 动作 |
|---|---|---|
| 1 | `extractMemories` | 先 `searchMemories({ query: "算了，这个项目缩进改成 2 个空格吧", userId, conversationId: "C1" })` 取 top-5 已有记忆 |
| 2 | 检索 | **双路召回，限定 `C1`**：BM25 命中「缩进」；向量路命中同一语义域 → **第一周那条 tab 偏好被取到**（它在 `C1` 里，所以可见） |
| 3 | LLM | 看到已有记忆，输出 `{action:"update", id:"<tab记忆id>", content:"用户偏好使用 2 空格缩进"}` |
| 4 | `updateMemory` | `UPDATE memory_records SET content=?, content_seg=?, updated_at=? WHERE id=?` |
| 5 | —— | **`id` 不变、`created_at` 保留** |
| 6 | 触发器 | 同步更新 `memory_fts` |
| 7 | `updateMemory` | **删除该 id 的向量行** → 重新进入待嵌入队列 |
| 8 | worker | 补算新向量 |

**这正是 §4.3 的正反馈环**：第 1 步的检索如果还是坏的（现状），第 2 步取不到那条 tab 记忆，LLM 就会输出 `add` 而不是 `update` → 库里同时存在「用 tab」和「用 2 空格」两条**互相矛盾**的记忆 → 以后检索到哪条全看运气。

**对比旧行为（`delete + create`）**：

| | 旧（delete + create） | 新（真 UPDATE） |
|---|---|---|
| `id` | 变 | **不变** |
| `created_at` | 重置为「刚刚」 | **保留**（记忆年龄可用于新近度加权） |
| `sourceMessageId` 溯源 | 断裂 | **保留** |
| 向量行 | 成孤儿，污染检索 | 明确删除后重算 |

### 7.5 场景五：本会话冷启动 / 稀疏（不凑数）

**新建一个 Conversation，或该会话还没有积累到相关记忆。**

| 步骤 | 结果 |
|---|---|
| BM25 路 | `conversation_id = ?` 过滤后无匹配 → 空榜单 |
| 向量路 | 该会话无向量行，或全部低于阈值 → 空榜单 |
| RRF | `[]` |
| `buildMemoryContext` | 返回 `undefined` |
| `systemPrompt` | **不追加任何东西** |

**这是正确的行为，不是缺陷**——但要澄清一个**容易被误解的点**：

> **不能再说「会话内的上下文由 `history` 承担」了。**

在改动之前，这个说法勉强成立，因为记忆是跨会话的。但在本设计里两者都是会话作用域，因此**必须说清边界**：

| 覆盖 | 机制 | 边界 |
|---|---|---|
| 最近 50 条消息（按条数） | `history`（`executor.ts` 已在传） | **固定条数截断，无 token 预算控制**。长会话的早期内容不可见 |
| 更早内容中**被 LLM 提炼过**的部分 | 本设计的会话内记忆 | 只覆盖提炼出的事实/决策/偏好，**不是原文** |

**两者不是冗余，而是互补，且中间有一条明确的缝**：第 51 条之前的**未被提炼**的原始对话，谁都覆盖不到。§7.1 第 1 步展示的正是这条缝。把 `history` 的截断从「条数」改为「token 预算」（§16 第 8 条）能缓解，但不能消除——无论如何截断，超出预算的内容仍只能靠记忆触达。

**反例（若不设 `minSimilarity`）**：向量路对**任意**查询都会返回 top-5（哪怕相似度只有 0.1，因为暴力搜索总会给出最近的 5 条）。RRF 照样融合 → prompt 被无关记忆污染 → 浪费 token，且可能让 agent 产生错误确信。

**注入低相关记忆比不注入更糟。** 这就是 §8.5 的相关度下限不是可选优化的原因。

**在会话作用域下这个风险更大而不是更小**：候选集变小后，向量路更容易「凑够」top-5——比如本会话只有 3 条记忆，其中 2 条与查询毫不相关，它们仍会被返回。`minSimilarity` 是唯一的兜底。

### 7.6 场景六：embedding 服务不可用（降级）

**项目会话 `C1`，embedding API 返回 502。**

| 环节 | 行为 |
|---|---|
| 写入 | `createMemory` **不调用 embedding** → **照常成功**，BM25 路立即可查 |
| worker | 批量调用失败 → 记录日志，本轮不推进 → 下轮重试 |
| 提取 | LLM 调用不受影响（用的是 `LLM_BASE_URL`，与 embedding 是两个服务） |
| 检索 | `embed(query)` 失败 → 捕获 → 向量榜单为空 → RRF 退化为**纯 BM25** |
| 恢复后 | worker 自动补齐所有积压 |

**记忆一条不丢，检索能力降级但可用。** 这是选择「两阶段（先落库、后嵌入）」而非「写入时同步 embed」的核心理由。

### 7.7 场景七：索引未就绪（超时兜底路径）

**前提：这是一个兜底场景，不是常规路径。** 常规路径下 `reindexMemories` 在 `listen()` 之前 `await` 完成，本场景不会发生（§9.4）。

**触发条件：** 迁移的 `DROP`/`CREATE` 已完成，`memory_fts` 是空的；`reindexMemories` 超过了 30s 超时（或失败），服务已开始接受请求。

| 做法 | 结果 |
|---|---|
| 不做保护 | BM25 执行 `MATCH` → **静默返回 0 行** → RRF 把「索引故障」当作「没有匹配」→ 系统看起来正常工作，实际静默丢失了 BM25 的全部召回能力 |
| **本设计的保护** | `bm25Ready === false` → **BM25 路跳过并打 warning**，不执行 `MATCH` → 退化为纯向量路 + ERROR 日志明确提示 |

**关键区分：「BM25 路没有匹配」与「BM25 路不可用」在 RRF 里表现完全相同（都是空榜单），但语义完全不同**——前者是正常结果，后者是故障。用一个显式标志把两者分开，故障才不会被当成正常结果吞掉。

**这个区分之所以重要，恰恰因为主路径已经把它挡住了：** 唯一能进入本场景的方式是「超时/失败」——也就是**已经出了一次故障**。若此时再让 BM25 静默返回空榜单，故障就会从「一次 ERROR 日志」退化成「检索质量莫名变差」，排查成本陡增。

---

## 8. 组件设计

### 8.1 EmbeddingProvider

```typescript
/** 向量空间的指纹。模型相同但维度/前缀模式不同 → 向量不可混用。 */
export type EmbeddingFingerprint = string;   // `${model}:${dim}:${mode}`

export interface EmbeddingProvider {
  readonly id: string;                    // 例如 "openai-compatible"
  readonly model: string;
  readonly dim: number;
  readonly mode: EmbeddingMode;           // "symmetric" | "asymmetric"
  readonly fingerprint: EmbeddingFingerprint;

  /** 索引侧：记忆正文、tags。worker 批量调用。 */
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
  /** 查询侧：用户查询。检索时调用。 */
  embedQuery(text: string): Promise<Float32Array>;

  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}
```

#### 为什么必须区分 `embedDocuments` / `embedQuery`

**单一 `embed(texts)` 方法会让 §8.1 声称的「可插拔」变成假的。**

相当一部分检索模型要求**查询与文档用不同方式嵌入**（非对称嵌入）：

| 模型 | 要求 |
|---|---|
| `BAAI/bge-m3` | **不需要**前缀（这是它的卖点之一） |
| `BAAI/bge-large-zh-v1.5` 等 bge-*-zh 系 | 查询侧必须加 `为这个句子生成表示以用于检索相关文章：` |
| E5 系 | 查询 `query: ` / 文档 `passage: ` |
| `jina-embeddings-v3` | 请求体带 `task: retrieval.query` / `retrieval.passage` |
| Cohere `embed-v4` | 请求体带 `input_type: search_query` / `search_document` |

不加前缀不会报错——**它会静默地把召回率拉低一档**，而这正是 §13 末尾归纳的那一类「不报错的错误」（§4.5 / §4.7 / §4.8 / §4.9 是同一类的四个既有实例）。

若接口只有 `embed()`，那么「从 bge-m3 换到 bge-large-zh」就必须改检索层和 worker 的调用代码——**可插拔性在最有价值的那一类模型上恰好失效**。把不对称性放进接口，两个实现各自决定加不加前缀，上层无感。

`mode` 是声明性的：`symmetric` 的实现让两个方法走同一条路径。**但即使实现是对称的，检索层也永远调 `embedQuery`、worker 永远调 `embedDocuments`**——这样将来换成非对称模型时，调用方一行都不用改。

#### `fingerprint`：向量失效的判据

`model` 单独不足以判定「两个向量在同一个空间」：

- Qwen3-Embedding 同一模型名支持**多个输出维度**（`dimensions` 参数 / Matryoshka 截断）——`model` 相同但 `dim` 不同，向量不可混用
- 同一模型在 `symmetric` 与 `asymmetric` 下产出不同（加了前缀）

因此失效判据是 `fingerprint = ${model}:${dim}:${mode}`，而不是 `model`（§6.2、§9.1 用它做待嵌入队列的判定）。

#### `dim` 必须校验，不能只声明

**这是一个静默数据损坏点。** §8.4 的 BLOB 读取是 `new Float32Array(buf.buffer, buf.byteOffset, dim)`——`dim` 直接决定解析多少个 float32。若配置 `EMBEDDING_DIM=1024` 而端点实际返回 1536 维：

| 环节 | 行为 |
|---|---|
| 写入 | BLOB 存 1536×4 = 6144 字节（正常，不报错） |
| 读取 | `new Float32Array(buf, off, 1024)` → **只读了前 1024 维**，静默截断，不报错 |
| 结果 | 检索结果错误，且错误量取决于被截掉的那 512 维携带多少信息——**看起来像「语义召回不太准」而不是像 bug** |

处理：`embedDocuments` 首次成功响应后断言 `data[0].embedding.length === this.dim`，不符即抛错（启动期失败优于静默错误）；后续每批也校验（成本是读一次 `length`）。

#### `NaN` / `Inf` 必须拒绝，不能写库

**这个校验不是通用的健壮性加固，而是 `bge-m3` + Ollama 的已知缺陷所要求的**（issue #14657，对某些技术文档返回 NaN，见 §10.1）。

NaN 会一路静默通过所有环节：

| 环节 | 行为 |
|---|---|
| 长度校验 | **通过**（NaN 也是合法的 float32，长度正确） |
| 归一化 | `NaN / NaN = NaN`，不抛错 |
| 写库 | **成功**（BLOB 存的是 NaN 的位模式） |
| 点积 | 传播为 `NaN` |
| `sort` 比较 | 含 `NaN` 的比较返回 `false`，**排序结果任意且不抛错** |

**处理：** 归一化前检查每个分量 `Number.isFinite(v)`，任一不满足即**丢弃该条并按失败处理**（记录日志，不写库，下轮重试——与 §7.6 的降级路径一致）。**「向量算不出来」必须表现为「这条记忆暂时只在 BM25 榜单里」，而不是「这条记忆带毒进入向量索引」。**

代价是每条向量多一次 `O(dim)` 的 `isFinite` 扫描——1024 次廉价整数比较，相对一次网络调用可忽略。

**测试要求：** 用一个会返回 NaN 的 `FakeEmbeddingProvider` 断言该条**不写库**、被计入失败计数、且不影响同批其他条（§13）。

#### 其余约定

**返回的向量必须已归一化为单位长度。** 接口层强制，实现层负责（提供 `normalize()` 工具函数，各实现调用）。理由：归一化后余弦相似度 **等于** 点积，向量路的距离计算退化成一重循环，省掉每对向量的两次开方。

首个实现 `OpenAICompatibleEmbeddingProvider`：

- `POST {baseUrl}/embeddings`，body `{ model, input: string[], ...(dimensions ? {dimensions} : {}) }`
- 响应取 `data[].embedding`；**`data` 的顺序必须校验**（索引按 `data[].index` 对齐，不依赖数组顺序——这是 OpenAI 兼容层常见的顺序不保证问题）
- 支持批量（`input` 为数组），worker 按批调用
- 失败时抛错，由调用方决定降级（worker 重试 / 检索退化为纯 BM25）
- 不做内部重试，重试策略统一由 worker 与检索层决定

**为什么可插拔：** 远程 API 与本地模型（如 fastembed）的差异被隔离在接口后。将来换 provider 不影响检索、融合、存储任何一层——**这也正是 §6.4 那 100–300ms 延迟的退出路径。**

DeepSeek 无 embeddings 端点（`api.deepseek.com/v1/embeddings` 返回 404），故远程实现必然需要一个独立的 embedding provider 配置（见 §10）。

### 8.2 Segmenter

```typescript
export interface Segmenter {
  readonly id: string;
  cut(text: string): string[];   // 返回词项，不含空白
}
```

候选实现（**已在 darwin-arm64 / Node v24 上实测**）：

| | **`jieba-wasm` 2.4.0** | `@node-rs/jieba` 2.0.3 | `segmentit` 2.0.3 |
|---|---|---|---|
| 形态 | WASM（jieba-rs 绑定） | napi 原生，13 个平台 optionalDeps | 纯 JS |
| 初始化 | **3ms，同步，零配置** | 49ms，同步，**必须 `Jieba.withDict(dict)`** | 同步 |
| `cut()` 预热后 | 0.030 ms | <0.001 ms | 更慢 |
| 中文成词（实测） | **5/5** | 5/5（**仅正确用法下**） | —— |
| 错误用法的后果 | —— | **0/5，且不抛错** | —— |

#### 选定 `jieba-wasm`，依据是实测而非形态偏好

**先更正本设计早先版本的一个错误前提。** 早先版本写「`jieba-wasm` 初始化是异步的，因此 `Segmenter` 构造是异步的（`await createJiebaSegmenter()`）——这是 §9.4 拆成两步的原因」。

**这个前提是错的。** 实测：

```
m = require("jieba-wasm")
m.cut("用户偏好使用 tab 缩进")   →  ["用户","偏好","使用"," ","tab"," ","缩进", ...]   ← 直接返回数组，同步
Object.keys(m) → [cut, cut_all, cut_for_search, tokenize, add_word, tag, with_dict, __wasm]
                                                                  ↑ 没有 init
```

`init` 根本不是导出。**Node 下 `jieba-wasm` 是同步的、零配置的。**

错误的来源是包内的条件导出：

```json
"exports": { ".": {
  "node":    "./pkg/nodejs/jieba_rs_wasm.js",   ← Node 走这条：WASM 在 require 时同步实例化
  "browser": "./pkg/web/jieba_rs_wasm.js",      ← 浏览器走这条：必须 await init()
  "import":  "./pkg/web/jieba_rs_wasm.js"       ← 注意：这条指向 web 构建
}}
```

异步初始化是**浏览器构建**的性质，我把它错误地推广到了 Node 运行时。（Node 的条件解析顺序里 `node` 先于 `import`，所以服务端拿到的是同步构建。**但这也是一个真实的坑**：若某个打包器不设 `node` 条件，会解析到 web 构建，行为会静默变成需要 await——`packages/memory` 是纯服务端的，不应被打进前端 bundle。）

#### 为什么是 `jieba-wasm` 而不是 `@node-rs/jieba`

`@node-rs/jieba` 更快（0.000 vs 0.030 ms/cut），但**这个差距没有意义**——分词发生在每次写入一条记忆、每次查询一次，0.03ms 相对一次 SQLite 写或一次 embedding 调用可忽略。**性能不是区分项。**

真正的区分项是**API 的容错性**：

```js
const { Jieba } = require("@node-rs/jieba");
new Jieba().cut("用户偏好使用 tab 缩进")
// → ["用","户","偏","好","使","用","tab","缩","进", ...]   成词 0/5
```

**`new Jieba()` 不抛错、返回合法数组，但产出的全是单字。** 词典必须通过 `Jieba.withDict(dict)` 显式传入（`loadDict()` 无参调用会抛 `Get TypedArray info failed`）。

单字切分的**可见后果是「检索精度变差」而非报错**——因为 §8.2 末尾的容错性质（写入与查询两端一致）会让它**照样能召回**，只是每个汉字都成了独立词项，IDF 失去意义、OR 语义把噪声全拉进来。这正是 §13 末尾归纳的那一类缺陷（第五例）。

`jieba-wasm` 的 `cut()` 开箱即用、默认词典完整（实测 5/5 成词），没有这个错法。

**代价（明确接受）：** 多一个 WASM 产物（`pkg/nodejs/jieba_rs_wasm.js` + `.wasm`），且必须保证 `node` 条件被正确解析（见上）。

#### 这个选择对 §9.4 没有影响

早先版本声称「分词器的同步性决定了要不要背一个索引未就绪的失败模式」。**这个关联也是错的**——两个候选在 Node 下都是同步的，而且无论同步异步，`reindex` 都可以 `await`。

**「索引未就绪」这个窗口来自迁移本身**（`DROP` + `CREATE` 后 `memory_fts` 是空的），与分词器无关。§9.4 已按这个正确的归因重写。

测试用 `FakeSegmenter`，按固定映射切词，使测试**不依赖 jieba 的具体词典**——否则 jieba 升级会导致测试结果漂移。

**容错性质：** 写入与查询走同一个 `Segmenter`。即使分词分错了，只要两端错得一致，匹配依然成立。因此分词精度不敏感，这是本方案相对于「精确词边界」方案的容错优势。

### 8.3 BM25 路：预分词 + 查询构造

**这两件事必须一起做。** 只换分词不修查询构造，BM25 榜单大部分时候为空，RRF 会退化成纯向量检索——付了混合架构的复杂度，拿到单路的收益。

#### 存储侧

`memory_records` 新增两列 `content_seg` 与 `tags_seg`：

```
content      = "用户偏好使用 tab 缩进"      （原样，用于展示）
content_seg  = "用户 偏好 使用 tab 缩进"    （分词后，用于索引）

tags         = ["代码风格", "偏好"]          （原样 JSON）
tags_seg     = "代码 风格 偏好"             （每个 tag 分词后展平，用于索引）
```

FTS5 虚表改为索引 `content_seg, tags_seg`，tokenizer 保持 `unicode61`。

**为什么 tags 也必须分词：** 查询侧会被分词，索引侧若不分词，两边就不一致。具体地——tag `代码风格` 在 `unicode61` 下是**一个** token，而查询「代码风格」经 jieba 切成 `["代码","风格"]` 后 OR 展开，两个词项都匹配不到那一个 token → **静默不命中**。这与 §7.3 是同一类问题：**写入与查询必须走同一套分词**（§8.2 的容错性质正建立在这个前提上）。

`unicode61` 在预分词后能正确工作：中文词之间已有空格分隔，成为独立 token；ASCII 标识符维持原有行为（`_` 被视为分隔符，`idx_memory_user_agent` 切为 4 个 token——这对召回反而有利）。

#### 查询侧

```typescript
function buildFtsQuery(query: string, seg: Segmenter): string | null {
  const terms = seg.cut(query).filter((t) => t.trim().length > 0);
  if (terms.length === 0) return null;
  // 每个词项用双引号包裹：既转义 FTS5 语法字符（* " ( ) : ^ -），
  // 又让单个词项作为短语匹配，避免被 FTS5 当作操作符解析
  return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");
}
```

三个要点：

1. **OR 而非 AND。** FTS5 默认 AND，多词查询必然返回空。OR 让部分命中也能召回，相关性由 BM25 排序决定。见 §7.1 第 2 步。
2. **每个词项加双引号。** 否则含 `-` 或 `*` 的词项会被 FTS5 当操作符，导致语法错误或语义错误。
3. **返回 `null` 表示查询为空**，调用方跳过 BM25 路（不执行 `MATCH ''`）。

### 8.4 VectorIndex

```typescript
export interface VectorIndex {
  upsert(memoryId: string, vec: Float32Array): void;
  remove(memoryId: string): void;
  search(
    query: Float32Array,
    k: number,
    filter: { userId: string; scope: MemoryScope },
  ): Array<{ memoryId: string; score: number }>;
  size(): number;
}
```

`filter` 是**接口的一部分**，不是实现细节。BLOB 实现用 SQL `WHERE` 表达；未来若换 sqlite-vec，它会映射到 `partition key`。把它留在接口上，替换实现时上层无需改动。

`userId` 与 `scope` **都是必填**（§11 的理由）。`MemoryScope` 的判别联合直接透传——向量路不自己解释作用域。

#### 作用域只有一个实现点

两路必须用**同一个** `buildScopeClause(scope)` 生成过滤条件：

```typescript
function buildScopeClause(scope: MemoryScope): { sql: string; params: string[] } {
  return "conversationId" in scope
    ? { sql: "r.conversation_id = ?", params: [scope.conversationId] }
    : { sql: "1 = 1", params: [] };   // allConversations
}
```

**这不是为了少写代码，而是为了让「两条路的作用域一致」成为结构性事实而非纪律要求。** §13 的会话作用域测试专门断言 BM25 与向量路**都**生效——若两路各写一份过滤条件，这类不一致会反复出现，且只在跨项目场景下暴露。

#### BLOB 实现（`BlobVectorIndex`）

```sql
SELECT e.memory_id, e.vec, e.dim
FROM memory_embeddings e
JOIN memory_records r ON r.id = e.memory_id
WHERE r.user_id = ?
  AND r.conversation_id = ?      -- 由 buildScopeClause(scope) 生成
```

- **过滤在读取向量字节之前。** 实际载入的是本会话（或该用户全部）的若干条，不是全库。
- 读到的是 Node `Buffer`（V8 堆外），用 `new Float32Array(buf.buffer, buf.byteOffset, dim)` 建**零拷贝视图**，不复制。
- 点积为标量循环。因向量已归一化（§8.1），点积即余弦。

**索引注意：** §4.7 提到的 `idx_memory_conversation`（`schema.ts:21`）目前索引的是一个**恒为 NULL** 的列，因而从未被查询规划器用上。本设计让该列真正有值后，它才开始生效——**无需新建索引**。

**对齐注意：** `byteOffset` 必须 4 字节对齐，否则 `Float32Array` 构造抛错。实现需检查并在不对齐时回退到复制路径（`buf.buffer.slice(...)`）。这是防御性代码，正常路径不会触发。

**规模：** 会话作用域（§1.1）让候选集**进一步变小**——从「某用户的所有记忆」缩到「某个项目的记忆」。单会话记忆预期在数百到数千条量级，该规模下暴力扫描为微秒级。**会话作用域使暴力方案比原设计更安全，而不是更勉强。** 若未来单会话超过十万条，替换为 sqlite-vec 实现即可，接口不变。

**为什么不用 sqlite-vec：** `vec0` 至今仍是暴力精确 KNN（O(N) 全扫），`rescore` 索引也只是常数因子优化，没有 HNSW/IVF 那类亚线性结构。它相对 JS 暴力的唯一实质优势是 C 层 SIMD，而这个优势要到五万条以上才显现。为此引入平台原生二进制（含已知的静默加载失败模式）不划算。

### 8.5 RRF 融合

```typescript
function fuseRankedLists(
  lists: Array<Array<{ memoryId: string }>>,
  k = 60,
): Array<{ memoryId: string; score: number }> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      scores.set(item.memoryId, (scores.get(item.memoryId) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .map(([memoryId, score]) => ({ memoryId, score }))
    .sort((a, b) => b.score - a.score);
}
```

- `k = 60` 为 RRF 的通行取值，不做调参。RRF 的卖点正是不需要调参。
- 每路各取 top-50 作为融合输入，融合后取 `limit`。
- **只使用名次，不使用分数。** BM25 分数无上界（FTS5 的 `rank` 越小越相关），余弦在 `[-1,1]`，量纲不可比。用名次彻底绕开归一化问题。

#### 相关度下限（必须）

RRF 有个危险性质：**只要两路都返回了东西，它总能凑出 top-k——哪怕全是垃圾**（见 §7.5 的反例）。

因此：

- **向量路**：丢弃 `score < minSimilarity`（配置项，默认 `0.35`）的结果
- **BM25 路**：保留（BM25 有 IDF 自然过滤，且精确匹配往往分数高）
- 过滤后若两路皆空 → 返回 `[]`

`minSimilarity` 的**具体取值留给 Spec 2 用消融实验标定**，此处只确定机制与默认值。

### 8.6 写入路径与后台 Worker

#### 写入保持同步

`createMemory` 保持**同步**（无网络调用），仅在入参上新增必填的 `conversationId`（§11）。流程见 §6.1。

#### 待嵌入队列

见 §6.2。核心：**「待嵌入」= 没有对应向量行**，队列就是那个 LEFT JOIN。

#### Worker

```typescript
export function startEmbeddingWorker(opts: {
  provider: EmbeddingProvider;
  batchSize?: number;             // 默认 32
  intervalMs?: number;            // 默认 5000
  maxConcurrentBatches?: number;  // 默认 1
}): { stop(): void; runOnce(): Promise<{ processed: number; failed: number }> };
```

- 由 `apps/server/src/index.ts` 在启动时拉起，优雅关闭时 `stop()`
- 幂等：重复处理同一行只是重复 `INSERT OR REPLACE`
- 单批失败不中断循环，记录日志后下一轮重试
- `runOnce()` 导出供测试与一次性回填 CLI 使用
- 暴露 `pendingCount()` 供可观测性

### 8.7 触发时机修正

#### 单 agent 路径注入记忆

抽取一个共享 helper，供 orchestrator 与单 agent 两条路径使用：

```typescript
export async function buildMemoryContext(params: {
  userId: string;
  conversationId: string;   // 必填 —— 作用域（§1.1）
  query: string;
  tokenBudget?: number;     // 默认 800
}): Promise<string | undefined>;
```

- `executor.ts:135` 改为调用它（行为等价，消除重复）
- `messages.ts:673` 的单 agent 路径新增调用，注入到 `systemPrompt`

**注意 `buildMemoryContext` 不收 `agentId`**——按 §1.1，检索作用域是会话，`agentId` 降级为记忆的元数据。（`searchMemories` 本身仍保留可选的 `agentId`，供 Web UI 的「按 Agent 筛选」使用，见 §11。）

**两侧的 `conversationId` 都已可得，无需新增传参：**

| 调用点 | 来源 |
|---|---|
| `executor.ts:135` | `subtask.conversationId`（已存在，同函数内 `buildContext` 的 `listPinnedMessages(subtask.conversationId)` 与返回值都在用它） |
| `messages.ts:673` | 闭包内已有 `conv` / `conversationId` |

**这是一个行为变更**（单 agent 路径此前从不注入记忆），已确认是有意修正而非设计如此。见 §7.1。

#### 并发限流

`extractMemories` 目前每个子任务触发一次，无上限。新增一个进程内信号量，限制同时进行的提取数（默认 2）。超出的排队，不丢弃。

注意：SQLite 写是同步的，写事务本身不会真并发；需要限流的是 **LLM 调用**（provider 限流与成本）。

#### 按 token 预算而非条数

`limit: 5` 改为按 token 预算截断（默认 800 tokens）。5 条长记忆与 5 条短事实的开销差一个数量级。

---

## 9. 数据模型与迁移

### 9.1 新增表

```sql
CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id   TEXT PRIMARY KEY REFERENCES memory_records(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,       -- `${model}:${dim}:${mode}` —— 失效判据（§8.1、§6.2）
  model       TEXT NOT NULL,       -- 仅供展示与排障
  dim         INTEGER NOT NULL,
  vec         BLOB NOT NULL,       -- Float32Array 原始字节，已归一化
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- **失效判据是 `fingerprint`，不是 `model`。** 因为它必须同时覆盖维度与前缀模式的变化（§8.1）。`model` / `dim` 保留为独立列仅为了可读性与排障——**不要用它们做判据**，那是两处可能漂移的真相
- `ON DELETE CASCADE` + `db.ts` 已开的 `PRAGMA foreign_keys = ON` → 删除记忆时向量行自动清理，从根上杜绝孤儿向量（§7.4 场景四第 7 步）
- 无独立索引需求：查询按 `memory_id` 主键或经 JOIN 走 `memory_records` 的索引

### 9.2 `memory_records` 变更

新增两列：`content_seg TEXT`、`tags_seg TEXT`（均可空，迁移时回填）。

`conversation_id` 列**结构不变**（`TEXT`，可空），但**语义改变**：从「恒为 NULL 的死列」变为「检索作用域的唯一依据」（§4.7）。写入侧从此必须填值（§6.1）。

**不加 `NOT NULL` 约束。** 理由：`conversation_id IS NULL` 的行**必然存在**——历史数据无法回填（§9.6）；而 SQLite 加 `NOT NULL` 需要重建表，风险大于收益。改为在写入端用 TypeScript 类型强制（`CreateMemoryInput.conversationId: string` 必填），并在读取端显式排除 NULL 行。

同时**已有索引 `idx_memory_conversation` 无需新建或修改**——它此前索引一个恒为 NULL 的列，因此从未被查询规划器选上；现在该列有值了，它自动开始生效。

### 9.3 FTS5 虚表变更

```sql
CREATE VIRTUAL TABLE memory_fts USING fts5(
  content_seg, tags_seg,
  content='memory_records',
  content_rowid='rowid',
  tokenize='unicode61'
);
```

三个触发器（`ai` / `ad` / `au`）同步更新为写 `content_seg, tags_seg`。理由见 §8.3。

### 9.4 迁移机制

引入 `PRAGMA user_version` 版本号。`initSchema()` 改为按版本号顺序执行迁移：

```typescript
const MIGRATIONS: Array<{ version: number; up(db: Database): void }> = [
  {
    version: 1,
    up(db) {
      // 1. 加列 content_seg、tags_seg
      // 2. 建 memory_embeddings
      // 3. DROP 旧 memory_fts 与触发器，按新结构重建
      // （content_seg / tags_seg 回填与索引 rebuild 见下方「索引重建」）
    },
  },
];

export function initSchema(customDb?: Database): void;
```

现有库 `user_version = 0` → 自动执行迁移 1。每个迁移在事务内执行，失败整体回滚，`user_version` 不推进。

**为什么不用 `IF NOT EXISTS` 蒙过去：** 换分词器必须 `DROP` 虚表并 `rebuild`，`IF NOT EXISTS` 对已存在的表静默跳过——这会导致「以为修好了，实际中文仍查不到」，是最难排查的一类问题（§4.5）。

#### 索引重建：窗口来自迁移，不来自分词器

**这里有一个必须堵掉的静默失败。** 迁移的第 3 步 `DROP` 并重建了 `memory_fts`——此后索引是**空的**，而 `memory_records` 有数据。在这个窗口内，BM25 的 `MATCH` 会**静默返回 0 行**，RRF 把「索引故障」当作「没有匹配」。详见 §7.7。

**归因要准确：这个窗口来自迁移的 `DROP`/`CREATE`，与分词器的同步性无关。** 两个候选分词器（§8.2）在 Node 下都是同步的；即便不是，`reindex` 也可以 `await`。

因此拆成两个函数，区别在于**职责**而非同步性：

| 步骤 | 内容 |
|---|---|
| `initSchema()` | **纯 DDL**：加列、建 `memory_embeddings`、替换 FTS 虚表与触发器 |
| `reindexMemories(segmenter)` | **数据**：回填 `content_seg` / `tags_seg`，然后 `INSERT INTO memory_fts(memory_fts) VALUES('rebuild')` |

**拆开的理由是把 DDL 与数据回填分开**——前者是迁移，后者可能很慢且可重入，混在一起会让「迁移失败回滚」与「回填中断重试」纠缠。

#### 就绪标志：作为超时兜底，而非主路径

主路径是：**`reindexMemories` 在 `app.listen()` 之前 `await` 完成。** 这样窗口在服务开始接受请求之前就关闭了，`bm25Ready` 永远是 `true`，§7.7 不会发生。

但回填 + `rebuild` 的耗时正比于记忆条数，**在一个已有大量记忆的库上可能阻塞启动**。所以保留 `bm25Ready` 作为**有界超时**的兜底：

| 情形 | 行为 |
|---|---|
| `reindexMemories` 在 `REINDEX_TIMEOUT_MS`（默认 30000）内完成 | `bm25Ready = true`。**无窗口**，§7.7 不发生 |
| 超时或失败 | **记 ERROR 日志**，`bm25Ready = false`，后台继续重建；BM25 路跳过并每次打 warning，检索退化为纯向量路 |

**为什么不做成「重建失败就不启动」：** 记忆是辅助能力（§10.3），让整个 server（聊天、Agent 执行、所有 API）因为一个记忆索引重建失败而起不来，爆炸半径不成比例。**但「不阻止启动」不等于「静默降级」——超时兜底路径必须留下 ERROR 级日志与可观测的就绪标志**，这样故障不会被当成「没有匹配」吞掉（§7.7 的核心区分）。

注意这里与 §12「分词器初始化失败 → 启动即报错退出」的差别：**分词器不可用意味着 BM25 与向量路的关键前提都不成立**，那确实应该失败；而**索引重建慢是性能问题，不是能力缺失**。

### 9.5 `update` 修复

`packages/memory/src/repository.ts` 新增：

```typescript
export function updateMemory(
  id: string,
  patch: { type?: MemoryType; content?: string; tags?: string[]; importance?: number },
  customDb?: Database,
): MemoryRecord | null;
```

- 真正的 `UPDATE`，**保留 `id` 与 `created_at`**，仅刷新 `updated_at`
- 内容或 tags 变更时同步重算 `content_seg` / `tags_seg`（触发器会同步 FTS）
- 内容变更时**删除该 id 的向量行**（而非重算），使其重新进入待嵌入队列，由 worker 异步补齐。这样 `updateMemory` 保持同步，且复用同一套队列机制

`extractor.ts` 的 `update` 分支改用它，替换现有的 `delete + create`。见 §7.4 场景四。

### 9.6 无主记忆（`conversation_id IS NULL`）

**排他过滤有一个必然的代价，必须明说而不是让它静默发生。**

迁移前写入的**所有**记忆，`conversation_id` 都是 NULL（§4.7）。它们无法通过任何自动手段归属到某个会话——**产生它们的那次对话，其归属信息从未被记录过**。

在排他过滤下，这些行**永远不会被召回**。它们不是被删除，而是变成了不可达的数据。

#### 三个处理选项

| 选项 | 做法 | 评价 |
|---|---|---|
| **A. 一次性回填** | 用 `source_message_id` 反查业务库的 `Message.conversationId`，回填 `memory.db` | **能救回一部分。** 但 `memory_records.source_message_id` 本身也常为 NULL（`createMemory` 的调用方不一定传），且两个库是**独立的 SQLite 文件**（`agenthub.db` / `memory.db`，见 `CLAUDE.md`），**无法用 SQL JOIN**，只能写一个跨库的一次性脚本 |
| **B. 保持不可达，接受损失** | 不处理，在迁移日志里报告条数 | **推荐。** 该项目当前处于开发阶段，`memory.db` 里若有数据也只是本地调试产物；`git` 里也不含该文件（`.agenthub/` 已被忽略） |
| C. 兜底召回 NULL 行 | 让 NULL 行对所有会话可见 | **拒绝。** 这正好重新引入了 §7.1 反面场景要消除的跨项目污染，且污染源是**最老、最可能已过时**的记忆 |

**选定 B**，并附带两个必须做的事：

1. **迁移日志报告无主记忆条数**，让损失可见（`console.warn` + `/api/memory/list` 的响应里带上 `orphanCount`，与 §12 的 `pendingCount` 并列）。
2. **在 `.agenthub/memory.db` 有真实数据的部署上，改用 A**。判断依据就是第 1 点报告的条数：接近 0 就走 B，非 0 且有价值就走 A。

**为什么不做 C（兜底）：** 它看起来「更安全」（不丢数据），但把「旧记忆」提升为全局可见，等于用一个确定的功能缺陷（跨项目污染）换取一个不确定的收益（旧记忆恰好有用）。而且旧记忆通常是早期、未成熟阶段的结论，与当前项目状态矛盾的概率很高。

---

## 10. 配置

### 10.1 Embedding 模型选型

#### 选型标准（按重要性排序）

| 优先级 | 标准 | 理由 |
|---|---|---|
| 1 | **中文检索质量** | 本设计的出发点就是中文召回失效（§1） |
| 2 | **是否需要 query/passage 前缀** | 直接决定集成复杂度与踩坑面（§8.1）。不加前缀会**静默**掉一档召回 |
| 3 | **可达性** | 有没有 key、能不能自建。**这是真正的硬约束，见下方** |
| 4 | 维度 | 决定存储：`dim × 4` 字节/条。1024 维 ≈ 4KB/条 |
| 5 | 上下文长度 | 记忆是 LLM 提炼过的短句（§7.3），**8K 已远超需要，不是区分项** |
| 6 | 许可证与成本 | —— |

#### 候选

| 模型 | 维度 | 中文 | 前缀 | 可达方式 | 许可 |
|---|---|---|---|---|---|
| **`BAAI/bge-m3`** | 1024 | 强 | **不需要** | SiliconFlow / 自建（TEI、Ollama） | MIT |
| **`Qwen3-Embedding-0.6B`** | 1024 | **同尺寸强于 bge-m3** | 可选 instruction | DashScope / Ollama | 通义千问（非 MIT） |
| `Qwen3-Embedding-8B` | 4096 | **MTEB 中文第一** | 同上 | 需 GPU | 同上 |
| `BAAI/bge-large-zh-v1.5` | 1024 | 强（纯中文专用） | **查询侧必须加** | SiliconFlow / 自建 | MIT |
| `text-embedding-3-small` | 1536 | 中等，明显弱于 bge 系 | 不需要 | OpenAI | 闭源 |

来源见本文档末尾的「参考」。

#### 推荐：`BAAI/bge-m3`

理由，按上面的标准逐条对：

1. **中文**：多语言检索的第一梯队，「中文场景可以直接选它」是社区共识。
2. **不需要前缀**：这是它相对 bge-*-zh 系与 E5 系最大的工程优势——**少一个静默失效点**。非对称模型忘加前缀不会报错，只会安静地变差（§8.1）。
3. **1024 维**：单条 4KB，本设计的作用域是单会话（§1.1），量级在数百到数千条 → 数 MB 级，存储与暴力扫描都无压力（§8.4）。
4. **MIT 许可**，且是部署最广的开源 embedding 模型，Ollama / TEI / Xinference / vLLM 都直接支持。
5. 附带能力：它同时支持 dense / sparse / ColBERT 三种表示。**本设计只用 dense**——sparse 路与已有的 BM25 路职责重叠，引入它属于重复建设。

**`Qwen3-Embedding-0.6B` 是并列首选**：同尺寸中文更强，且支持 MRL 可调维度。**未选它的原因只有一条——多一个依赖**（需要一个 Ollama 实例或 DashScope 账号），而收益在当前规模下不明显。**若你已经有 Ollama 或 DashScope，选它。**

#### 具体落地路径：本地推理 vs 第三方托管

`bge-m3` **没有官方 API**——BAI 只发布权重（MIT），不提供托管服务。所以「用 bge-m3」必然意味着自己跑一个推理进程：

| 路径 | 要 key？ | 形态 | OpenAI 兼容 | 对 spec 的改动 |
|---|---|---|---|---|
| **Ollama** | **不要** | 本地单进程 | ✅ `/v1/embeddings` | **零代码改动** |
| LM Studio | 不要 | 本地 GUI | ✅ | 零代码改动 |
| TEI（HF 官方） | 不要 | Docker | ✅ | 零代码改动，但引入 Docker |
| SiliconFlow 等第三方 | **要** | 托管 | ✅ | 零代码改动 |
| 进程内 ONNX（`transformers.js`） | 不要 | npm 依赖 | ❌ 非 HTTP | **需写第二个 provider 实现** |

**推荐 Ollama，因为它是唯一同时满足「零 key、零代码改动、零容器」的选项：**

```bash
brew install ollama
ollama serve            # 默认监听 127.0.0.1:11434
ollama pull bge-m3      # 567M 参数，约 1.2GB，一次性
```

```
EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1
EMBEDDING_API_KEY=EMPTY      # Ollama 不校验，但 SDK/实现要求非空
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIM=1024           # bge-m3 原生宽度
EMBEDDING_MODE=symmetric
```

三个附带好处：

1. **`OpenAICompatibleEmbeddingProvider` 一行都不用改**——Ollama 的 `/v1/embeddings` 就是 OpenAI 格式。
2. **§6.4 的 100–300ms 网络延迟直接消失。** 本地推理是毫秒级，**这是本设计里 100–300ms 那个「唯一新增同步延迟」的实际解法**，不是理论解法。
3. **内存压力可忽略。** 567M 参数、1024 维、8192 上下文——在 M 系列的统一内存上是轻量负载。

#### `bge-m3` + Ollama 有一个已知缺陷，且正好命中本项目的文档类型

Ollama issue **#14657**：`bge-m3` 经 `/v1/embeddings` 对**某些技术文档**返回 **NaN 向量**（简单文本正常）。缓解办法是 `OLLAMA_FLASH_ATTENTION=false`。

**这条必须认真对待，原因有两点：**

1. **本项目存的正是技术文档**——错误码、文件路径、API 端点、配置片段（§7.2 场景二）。这恰好落在该缺陷的触发区间内。
2. **NaN 是最纯粹的静默失败。** NaN 不会让任何东西抛错：

| 环节 | NaN 的表现 |
|---|---|
| 写入 | BLOB 正常保存（NaN 也是合法的 float32 位模式） |
| 点积 | `NaN` 参与任何算术 → 结果是 `NaN` |
| 排序 | `sort((a,b) => b.score - a.score)` 在遇到 NaN 时**比较结果未定义** → 该条记忆的位次**任意**，不报错 |
| 表现 | 「偶尔有条记忆排得莫名其妙」，且不可复现（依赖排序实现的内部顺序） |

**因此 §8.1 增加了对 NaN / Inf 的校验**——这不是可选的健壮性加固，而是这个具体模型组合的前提条件。

#### 这个选择不能由本设计单独决定

**真正的约束是「你能访问哪个端点」。** 本仓库目前的 `.env` 只有一个 DeepSeek key，而 **DeepSeek 没有 embeddings 端点**（`api.deepseek.com/v1/embeddings` → 404）。因此：

> **向量路能否启用，取决于你是否愿意为 embedding 单独开一个 provider 账号或自建一个本地端点。这是一个部署决策，不是技术决策。**

本设计对此的态度是**显式失败而非静默降级**（§10.2）：没配就明确关掉向量路并打 warning，而不是悄悄用一个可能不可达的默认模型。

### 10.2 环境变量（根 `.env`）

| 变量 | 必填？ | 说明 |
|---|---|---|
| `EMBEDDING_BASE_URL` | 启用向量路则**必填** | OpenAI 兼容端点根，代码拼 `/embeddings`。**不能复用 `LLM_BASE_URL`** |
| `EMBEDDING_API_KEY` | 同上 | 独立于 `API_KEY` |
| `EMBEDDING_MODEL` | 同上 | **无默认值** |
| `EMBEDDING_DIM` | 同上 | **无默认值**；启动时会与端点实际响应校验（§8.1） |
| `EMBEDDING_MODE` | 否 | `symmetric`（默认）/ `asymmetric`，声明实现是否区分查询与文档 |
| `EMBEDDING_DIMENSIONS` | 否 | MRL 降维参数，仅部分模型支持（如 Qwen3 系）；不传则用模型原生维度 |

`MemoryConfig`（`packages/memory/src/types.ts`）新增 `embedding?: { baseUrl; apiKey; model; dim; mode?; dimensions? }`。

#### 不设 `model` / `dim` 的兜底默认值

**前四个变量缺任意一个 → 向量路关闭**（退化为纯 BM25 + 启动 warning），**不做部分兜底**。

理由就是 §4.9 那个**正在发生**的 bug：`.env` 写 `MODEL=deepseek-v4-flash`，代码读的是 `LLM_MODEL` → `undefined` → `?? "deepseek-chat"` 静默兜底 → **用户配置的模型从未生效，且没有任何人发现**。

如果 embedding 也配兜底，同一个剧本会重演：

| 配置错误 | 有兜底时 | 无兜底时（本设计） |
|---|---|---|
| `EMBEDDING_MODEL` 拼错一个字母 | 回落到 `bge-m3`。若端点不提供该模型 → 向量路整条 404；若碰巧提供 → 写入一个**与预期不同**的向量空间 | 启动即报错 |
| `EMBEDDING_DIM` 写错 | BLOB 静默截断（§8.1 的静默数据损坏） | 启动即报错 |
| 忘了配 `EMBEDDING_BASE_URL` | 若给个默认端点，会拿用户的 key 去请求一个陌生服务 | 明确关闭向量路 + warning |

**没有兜底时，「配置错误」等价于「启动失败」，这是唯一能保证配置被真正读取的机制。**

### 10.3 未配置时的行为

**必须明确选择其一，不能隐式。**

选定：**未配置完整的 embedding 配置时，系统退化为纯 BM25 模式**，启动时打印一条 warning，`/api/memory/search` 正常工作（只是没有语义召回）。

理由：记忆是辅助能力，不应因为缺少一个可选的 API key 而让整个记忆模块不可用。**这与「不设兜底」不矛盾**——前者说的是「不猜一个模型」，后者说的是「没有 embedding 也要能用」。**降级是显式的、有日志的、行为可预期的；兜底是隐式的、无日志的、行为不可预期的。**

---

## 11. 公开 API 变更

| 函数 | 变更 | 影响 |
|---|---|---|
| `searchMemories` | 返回类型 同步 → **`Promise<MemoryRecord[]>`**；**`userId` 由可选改必填**；**新增必填的 `scope`** | 3 个调用点均在 async 上下文，需加 `await` 并补参数 |
| `createMemory` | **`conversationId` 变为必填**（`CreateMemoryInput`）；**签名不变**（仍同步） | `extractor.ts` 的调用点需补参数 |
| `extractMemories` | **新增必填参数 `conversationId`** | `messages.ts:440`、`messages.ts:768` 两处需补参数 |
| `updateMemory` | **新增** | 无 |
| `buildMemoryContext` | **新增** | 无 |
| `initSchema` | 改为按 `user_version` 执行**纯 DDL** 迁移 | 调用点 2 处 |
| `reindexMemories` | **新增**：回填 `content_seg` / `tags_seg` + `rebuild` FTS 索引。**必须在 `listen()` 前 `await`**（超时兜底见 §9.4） | 无 |
| `isBm25Ready` | **新增**：暴露索引就绪状态，供 `/api/memory/list` 的可观测性使用（§12） | 无 |
| `startEmbeddingWorker` | **新增** | 无 |

#### `searchMemories` 新签名：作用域是必填的判别联合

```typescript
/** 检索作用域。必填，没有默认值。 */
export type MemoryScope =
  | { conversationId: string }    // 会话内 —— 自动检索链路（§1.1）
  | { allConversations: true };   // 全库 —— 仅 Web UI 手动搜索

export function searchMemories(options: {
  query: string;
  userId: string;          // 必填（原可选）—— 修复跨租户泄漏（§4.8）
  scope: MemoryScope;      // 必填（新增）—— 决定会话过滤（§1.1）
  agentId?: string;        // 保留，仅供 Web UI 按 Agent 筛选
  limit?: number;
  offset?: number;
}, customDb?: Database): Promise<MemoryRecord[]>;
```

**为什么用判别联合而不是 `conversationId?: string` 可选参数：**

可选参数有一个已知的失效方式，本仓库**已经发生过一次**——`userId` 是可选的，而唯一的两个自动化调用点都漏了它（§4.8），且单用户测试全绿。若 `conversationId` 也做成可选，`extractor.ts:141` 的去重检索会重蹈覆辙，后果是跨项目污染写入侧（§7.1 反面场景末段）。

判别联合让「跳过会话过滤」成为**必须显式写出**的决定：

| 调用点 | 写法 | 效果 |
|---|---|---|
| `executor.ts:135` / `buildMemoryContext` | `scope: { conversationId }` | 会话内 |
| `extractor.ts:141`（去重） | `scope: { conversationId }` | 会话内 |
| `routes/memory.ts:116`（UI 搜索） | `scope: { allConversations: true }` | 全库 |

漏写 `scope` 是**编译错误**；写错则需要主动打出 `allConversations: true`，无法因疏忽而跨会话。

`agentId` 之所以保留：`docs/architecture/long-term-memory.md:373` 的 MemoryPanel 有「Agent: [全部 ▼]」筛选器。它现在是**展示层筛选**，不再参与自动检索。

`searchMemories` 异步化的理由与流程影响见 §6.3。

#### `createMemory` 与 `extractMemories`

```typescript
export type CreateMemoryInput = {
  userId: string;
  conversationId: string;   // 必填（新增）—— 原调用方从不传（§4.7）
  agentId: string;
  type: MemoryType;
  content: string;
  tags: string[];
  importance: number;
  sourceMessageId?: string;
};

export function extractMemories(params: {
  userId: string;
  conversationId: string;   // 必填（新增）
  agentId: string;
  agentName: string;
  userMessage: string;
  agentResponse: string;
}, config?: { apiKey?: string; endpoint?: string; model?: string }): Promise<void>;
```

两处都用**必填**而非可选，理由同上：漏传的后果是记忆变成永不可达的孤儿（§9.6），而这个失败在本仓库已有的测试体系里**不会报错**（§13 末尾）。

---

## 12. 错误处理与降级

| 场景 | 处理 | 对应场景 |
|---|---|---|
| embedding 服务不可用 | 写入不受影响；检索退化为纯 BM25；worker 下轮重试 | §7.6 |
| 未配置 / 配置不完整的 embedding | 启动 warning；纯 BM25 模式；`searchMemories` 跳过向量路。**四个必填项缺任意一个都走这条，不做部分兜底** | §10.2、§10.3 |
| **`EMBEDDING_DIM` 与端点实际返回不符** | **首次响应即断言失败并抛错**（启动期失败）。否则 BLOB 静默截断 → 检索变差但**不报错** | §8.1 |
| **返回 `NaN` / `Inf` 向量**（`bge-m3` + Ollama 的已知缺陷） | 归一化前 `isFinite` 校验，**丢弃该条并计入失败**，不写库、下轮重试。表现为「该记忆暂时只在 BM25 榜单里」 | §8.1、§10.1 |
| **Ollama / 本地推理进程未启动** | 连接被拒 → 向量路抛错 → 退化为纯 BM25 + worker 自动重试。**响亮失败，符合预期** | §7.6 |
| **环境变量名不匹配** | 修掉（§4.9）；并去掉 `?? "deepseek-chat"` 兜底，使缺失变成显式失败 | §4.9 |
| 查询向量化失败 | 捕获，向量榜单视为空，RRF 用 BM25 单榜单 | §7.6 |
| 向量字节未对齐 | 回退到复制路径而非抛错 | §8.4 |
| 分词器初始化失败 | 启动即报错退出（BM25 是基础能力，不能静默降级） | —— |
| 单条记忆嵌入失败 | 记录日志，跳过该条，不影响同批其他条；下轮重试 | §6.2 |
| 迁移中断 | 每个迁移在事务内执行，失败整体回滚，`user_version` 不推进 | §9.4 |
| 索引未就绪（`bm25Ready === false`） | BM25 路跳过并 warning，退化为纯向量路；**不返回空榜单** | §7.7 |
| 本会话无记忆（冷启动） | 两路皆空 → 返回 `[]` → 不注入 | §7.5 |
| 提取并发超限 | 信号量排队，不丢弃 | §8.7 |
| **无主记忆**（`conversation_id IS NULL`） | 排他过滤下**不被召回**；迁移时统计条数并 warning。**不是错误，是已知且被接受的损失** | §9.6 |
| **会话被删除** | `memory_records.conversation_id` 无外键约束（跨库），记忆**不会**被级联删除。它们变为不可达的无主行，与上一条同类 | §9.6 |

**最后一条需要展开：** `memory_records` 在 `memory.db`（better-sqlite3），`Conversation` 在 `agenthub.db`（Prisma），**跨文件无法建外键**。删除会话时 `conversations.ts:204` 会删工作区目录，但**不会**通知记忆库。因此删会话会留下孤儿记忆行——它们占空间、且会让 §9.6 的 `orphanCount` 上升。

本份**不修**（需要一个跨库的清理钩子，属于新功能而非检索质量）。列入 §16 第 9 条。

**失败可见性：** `startEmbeddingWorker` 暴露 `pendingCount()`，`/api/memory/list` 的响应附带待嵌入计数与**无主记忆计数** `orphanCount`，使「向量路落后多少」与「有多少记忆已不可达」都可观测。

---

## 13. 测试策略

全部使用 `FakeSegmenter` 与 `FakeEmbeddingProvider`，**不依赖真实模型、不依赖 jieba 词典、不依赖网络**。

| 测试对象 | 覆盖点 |
|---|---|
| `schema` 迁移 | v0 库迁移后结构正确；已有数据保留；`user_version` 正确推进；迁移失败回滚且版本不推进 |
| 索引就绪标志 | 超时兜底路径下 `bm25Ready === false` 且 BM25 路被跳过（**不返回空榜单**）；`reindexMemories` 成功后置位且 BM25 恢复；**主路径（`reindex` 在 `listen()` 前 await 完成）下该标志恒为 `true`** |
| 迁移后索引窗口 | 断言 `initSchema` → `reindexMemories` → `listen` 的顺序被钉住（`reindex` 完成前不对外提供检索）；`reindex` 失败时 BM25 返回「不可用」而非空榜单（§9.4、§7.7） |
| **分词成词（防 §8.2 的空词典陷阱）** | 断言已知 2 字词切成**一个** token：`cut("缩进") === ["缩进"]`，**不是** `["缩","进"]`。**这是「静默劣化」类缺陷的直接防线**——segmenter 构造方式错误时全部汉字变单字，功能测试全绿而检索精度崩塌（§8.2 实测 0/5 成词） |
| `buildFtsQuery` | OR 语义；特殊字符（`-` `*` `"` `(`）被正确转义不报语法错；空查询返回 `null` |
| 预分词往返 | 中文 2 字词可召回（对应 §7.3）；中英混合；**分词错误但两端一致时仍能匹配** |
| tags 一致性 | 中文多字 tag（如 `代码风格`）可被同名查询召回——**验证写入与查询走同一套分词**（§8.3） |
| `BlobVectorIndex` | upsert/remove/search；`userId` / `MemoryScope` 过滤生效；`allConversations` 时不过滤会话；**归一化不变量（点积 == 余弦）**；未对齐字节回退 |
| `buildScopeClause` | `{conversationId}` → `conversation_id = ?`；`{allConversations:true}` → 恒真；**两路用的是同一个函数**（断言 BM25 SQL 与向量 SQL 的 scope 片段逐字相同） |
| `fuseRankedLists` | 两路都有 / 只有一路 / 都为空；名次计算；同 id 跨榜单累加；`minSimilarity` 过滤 |
| **会话作用域** | 两个会话各写入语义**极其相近但矛盾**的记忆（tab vs 2 空格），在其中一个会话检索时**只返回本会话的那条**（**BM25 路与向量路都要断言**——向量路若漏了过滤，两条都会返回且矛盾那条可能排第一）；写入侧的去重检索同样不跨会话（§7.1 反面场景） |
| **路径一致** | 拿同一个 `conversationId` 走 `buildMemoryContext` 与直接 `searchMemories`，结果一致——防止两条链路的作用域参数漏传其中一个 |
| **跨用户隔离** | 两个用户共享同一 `agentId`、各自有会话与记忆，A 的检索结果中**不包含** B 的记忆（§4.8 的回归测试） |
| **`conversationId` 端到端落库** | 走 `messages.ts` 的两条路径各发一轮消息，断言新记忆的 `conversation_id` **非 NULL 且等于该会话 id**——这是 §4.7「管道不存在」的直接回归测试 |
| **`EmbeddingProvider` 接口** | `embedQuery` / `embedDocuments` 走**不同的代码路径**（`asymmetric` 实现下断言查询侧确实带了前缀、文档侧没带）；`symmetric` 实现下两者等价；**向量长度与 `dim` 不符时抛错**（不是截断） |
| **NaN / Inf 拒绝** | `FakeEmbeddingProvider` 返回含 `NaN` 的向量 → 该条**不写库**、计入失败计数、**不影响同批其他条**；且断言检索结果里不含它（§8.1、§10.1 的 bge-m3 缺陷） |
| **`fingerprint`** | 同 `model` 但 `dim` 或 `mode` 变 → `fingerprint` 变 → 全量重新入队；三者都不变 → 不重新入队（幂等） |
| `embedding worker` | 待嵌入队列正确；幂等；单条失败不影响同批；`fingerprint` 变更触发重新入队；`runOnce` 可测 |
| `updateMemory` | `id` 与 `created_at` 保留；`updated_at` 刷新；`content_seg` 重算；向量行被删除（回到待嵌入） |
| 降级 | provider 抛错时 `searchMemories` 返回 BM25 结果而非抛错；未配置 provider 时走纯 BM25 |
| 触发 | **单 agent 路径确实注入了记忆**（回归测试，防再次漏接）；提取并发不超过上限 |
| 无主记忆 | `conversation_id IS NULL` 的行在带 `conversationId` 的检索中**不被返回**；`orphanCount` 统计正确（§9.6） |

**最重要的五个测试：**

1. **会话作用域**——这是本设计的核心决策（§1.1），且它的失效方式是**静默的错误答案**：不是报错，而是往提示词里注入另一个项目的矛盾约定，agent 会自信地照做。必须断言**两条路都生效**。
2. **`conversationId` 端到端落库**——这是 P0 的验收核心。§4.7 记录的缺陷之所以能长期存在，正是因为**没有任何测试观察过这一列**。
3. **归一化不变量**——若向量未归一化，余弦会被当成点积，结果排序错误但**不会报错**，属于静默错误。
4. **`fingerprint` 失效判据**——若只比 `model`，同模型不同维度的向量会混进同一个索引，点积照算不误，**结果错误且无任何异常**（§8.1）。
5. **单 agent 路径注入**——这是本次修复的缺口（§4.2），必须有测试钉住，否则容易被后续重构改回去。

**这五个测试防的是同一类东西：「不报错的错误」。** 这不是巧合——本仓库已经**四次**栽在这上面，每一次都是「配置/参数/约束存在，但没有任何东西观察它是否生效」：

| 编号 | 静默失效 | 掩盖机制 | 由谁发现 |
|---|---|---|---|
| §4.5 | `IF NOT EXISTS` 跳过结构变更 | 无报错 | 本设计 |
| §4.7 | `conversation_id` 恒为 NULL | 该列从未被任何测试或查询观察过 | 本设计 |
| §4.8 | `userId` 可选 → 两个调用点全漏传 | 单用户测试全绿 | 本设计 |
| §4.9 | 环境变量名不匹配（`MODEL` vs `LLM_MODEL`） | `?? "deepseek-chat"` 兜底，且端点兜底值恰好正确 | 本设计（做 embedding 选型时顺带） |

**四次里有四次都是「读代码」而不是「跑测试」发现的。** 这本身就是对本仓库测试策略的判断：现有测试**结构性地无法发现这类问题**——因为它们只断言「功能对不对」，从不断言「配置/参数是否被真正消费」。

**因此测试策略必须专门针对这一类，而不只是覆盖率。** 具体做法：对每一个新增的必填参数、每一个新增的配置项、每一个新引入的约束，都配一个**「缺失/错配时会失败」的测试**——而不是只测「给对了会成功」。

**P0 的验收就是前两个测试**（外加表内的 `buildScopeClause` 与跨用户隔离）。它们不需要向量、不需要分词、不需要迁移机制——**在混合检索动工之前就能全部跑绿**，这正是 P0 可以独立先行的依据（§14）。

---

## 14. 实施阶段

| 阶段 | 内容 | 出口标准 |
|---|---|---|
| **P0** | **边界正确性**（两块互相独立）：<br>① **会话作用域管道**——`conversationId` 贯穿 `CreateMemoryInput` / `extractMemories` / 两处 `messages.ts` 调用点；`searchMemories` 的 `userId` 改必填、新增必填的 `MemoryScope`；`buildScopeClause` 单一实现点<br>② **修 §4.9 的配置 bug**——统一环境变量名、去掉兜底、`extractor.ts` 改为接收解析后的 config | §13 的**会话作用域**、**`buildScopeClause`**、**跨用户隔离**、**`conversationId` 端到端落库**四个测试通过；§4.9 的模型配置被真正读取（有测试观察） |
| P1 | 迁移机制（`user_version`）+ `memory_embeddings` 表（含 `fingerprint`）+ `content_seg` 列 + 无主记忆统计 | 迁移测试通过；v0 库可升级；`orphanCount` 正确 |
| P2 | `Segmenter` 接口 + `JiebaWasmSegmenter` + `buildFtsQuery` + `reindexMemories`（含 `listen()` 前 `await` 与超时兜底）+ `bm25Ready` | §7.3 中文 2 字词、多词查询可召回（单元测试）；§13 的**分词成词**与**索引就绪**两个测试通过 |
| P3 | `EmbeddingProvider`（含 `embedQuery` / `embedDocuments` / `dim` 校验 / `fingerprint`）+ `OpenAICompatibleEmbeddingProvider` + `BlobVectorIndex` + 待嵌入队列 + worker + **§10.2 配置解析（无兜底）** | §6.2 队列/幂等/重试测试通过；§13 的**接口**与 **`fingerprint`** 两个测试通过 |
| P4 | `fuseRankedLists` + `minSimilarity` + `searchMemories` 变异步 | §8.5 融合与 §7.6 降级测试通过；3 个调用点改造完成 |
| P5 | `updateMemory` 修复 + `buildMemoryContext` + 单 agent 注入 + 并发限流 | §7.4 更新测试通过；§13 触发回归测试通过 |
| P6 | 集成测试 + 更新 `docs/architecture/long-term-memory.md`（§4.6 的漂移） | §7.1 端到端：消息 → 提取 → 存储 → 双路召回 → 注入 |

每阶段结束都应可运行、有测试。

#### 为什么 P0 单独先行

**会话作用域与混合检索是两件独立的事，后者不依赖前者。** 把它拆成第一个阶段有三个理由：

1. **它是唯一能立刻消除真实缺陷的阶段**（§4.8 的跨租户泄漏 + §1.1 的跨项目污染 + §4.9 的配置失效），不需要等任何其他部分。
2. **它是后续每个阶段的观测前提。** Spec 2 要评估检索质量，而「召回了一条本不该在的跨项目记忆」会污染所有指标。作用域没定，评测就没有基线。
3. **它让 P1–P5 都在正确的边界内构建**，避免最后一次性集成时才发现作用域漏传（这正是 §4.7 已经发生过一次的事）。

**各阶段完成后新增的能力：**

- **P0 完成后**：记忆不再跨项目、跨用户串味。检索质量仍是坏的（中文查不出、查询构造错、单 agent 不注入），但**边界是正确的**。
- **P0–P2 完成后**：中文检索可用（不依赖向量）。
- **P3–P4 完成后**：语义召回可用。
- **P5 完成后**：单 agent 路径才真正用上记忆。

---

## 15. 交付物

1. **边界正确性**（P0，两件互相独立的事）：
   - **会话作用域管道**：`conversationId` 写入链路 + `userId` 必填化 + `MemoryScope` 检索过滤 + `buildScopeClause` 单一实现点，含 §13 的四个 P0 验收测试（会话作用域、`buildScopeClause`、跨用户隔离、`conversationId` 端到端落库）。
   - **§4.9 的配置 bug 修复**：统一环境变量名、去掉 `?? "deepseek-chat"` 兜底、`extractor.ts` 改为接收解析后的 config 而非直读 `process.env`；同步更新 `.env.example`（把死键 `BASE_URL` / `MODEL` 改成 `LLM_BASE_URL` / `LLM_MODEL`）。
2. `packages/memory` 的混合检索实现（含单元测试），包括 `EmbeddingProvider` 的**不对称接口**（`embedQuery` / `embedDocuments`）与 `dim` 校验。
3. `apps/server` 的触发链路修正（单 agent 注入、并发限流、worker 启停）。
4. **一份 embedding 部署说明**：§10.1 的选型结论 + 你实际选了哪个端点/模型 + 为什么。**该文档必须写明「向量路是可选能力」**，以及未配置时的确切行为（§10.3）。
5. 更新后的 `docs/architecture/long-term-memory.md`（同步 §4.6 记录的漂移，并修正其对「跨会话」的描述——该文档 §3 的开篇语「让 AI Agent 能跨对话记住用户偏好」与本设计的作用域模型**相反**，必须改）。
6. 一个可运行的手动验证步骤说明，至少覆盖：
   - **作用域隔离**（P0 后即可验证）：两个会话各写一条矛盾的缩进约定，互换提问，断言返回各自的那条，且对方那条**不出现**。
   - **配置被真正读取**（P0 后即可验证）：改一次 `LLM_MODEL`，观察提取请求实际带的模型名随之改变——这是 §4.9 的验收方式，**不看日志看不出来**。
   - **双路各自生效**（配置 embedding 后）：按 §7.1 与 §7.2 验证语义路与 BM25 路的独立贡献。

---

## 16. 留给 Spec 2 的问题

本份刻意不做、但已记录的问题：

1. **`minSimilarity` 的具体取值**——需要消融实验标定，当前只是机制 + 默认值（§8.5）。**会话作用域让候选集变小，这个阈值可能需要比全库检索时更高**（§7.5 末段）——属于必须用数据定的参数。
2. **混合检索到底比纯 BM25 好多少**——需要 golden set 与消融实验。**§1 与 §7 里的所有判断目前都是基于推理，不是基于数据。**
3. **BM25 与向量的最佳配比**——RRF 的 `k` 值、是否给 `importance` / 新近度加权。
4. **写入质量**（提取的 precision / recall）——需要人工标注「这段对话应该提取出哪些记忆」。
5. **记忆衰减 / TTL**——需要评估数据支撑。
6. **跨会话记忆召回（「另做一路」）**——用户级偏好这类真正跨项目的知识，在 §1.1 的排他作用域下**永远召不回**。恢复它需要一次独立的、作用域为用户级的检索，并解决「项目约定与用户偏好冲突时谁优先」。**本份刻意不做**，因为它会削弱 §7.1 反面场景所保证的项目自洽性；要做也必须先有 Spec 2 的评测能力来判断它是否净收益为正。

   **这条与 §1.1 的关系需要说清：** §1.1 选择了排他，代价是明确接受的，**不是遗漏**。排他作用域同时保证了「项目记忆自洽」与「矛盾可解释」；混合作用域会让 agent 无法判断一条缩进约定来自哪个项目。**先做排他、待评测能力就位后再评估放宽**，是本设计对这条权衡的立场。
7. **`AddAgentView.tsx:50` 每次新建会话**（§4.7）——会持续制造孤儿记忆与重复会话。修法是客户端加先查后建，或服务端加幂等。**建议尽快修，因为它会让 P0 的作用域保证在实际使用中退化。**
8. **`history` 按条数截断（`limit: 50`）而非 token 预算**（§7.1 第 1 步、§7.5）——这是本次发现的**独立缺陷**，与记忆质量正交，但它是「记忆为什么必需」的量化依据。改成 token 预算能推迟那条缝的位置，不能消除它。
9. **删除会话不清理记忆**（§12）——跨库（`agenthub.db` ↔ `memory.db`）无法建外键，需要一个显式的清理钩子。当前后果是孤儿行累积，`orphanCount` 可观测。
10. **查询向量化的成本**（§6.4 的 100–300ms）——每轮对话一次调用。是否值得用一个更小/更快的模型、或对短查询跳过向量路，需要数据。
11. **embedding 模型到底选哪个**（§10.1）——本设计推荐 `bge-m3`（不需要前缀、MIT、部署广、**经 Ollama 本地跑零 key 零延迟**），并指出 `Qwen3-Embedding-0.6B` 在同尺寸下中文更强。**但「哪个模型在这个项目的记忆分布上召回更好」只能用 Spec 2 的 golden set 回答，社区榜单的 MTEB 分数不能替代。** 注意：换模型需要**全量重算向量**（§6.2 的 `fingerprint` 已自动处理入队，但重算是真实成本，不是免费的）。
12. **`bge-m3` + Ollama 的 NaN 缺陷**（§10.1）——issue #14657 对某些技术文档返回 NaN。本设计用 §8.1 的 `isFinite` 校验把它挡在库外，**但「挡得住」不等于「没有损失」**：那些记忆会永久停留在「只有 BM25 可召回」的状态。需要观察实际发生率（`pendingCount` 长期不降就是一个信号），再决定是否改用 `Qwen3-Embedding-0.6B` 或换推理后端。**这是选 Ollama + bge-m3 这个组合的具体代价，不是通用风险。**
13. **`reindexMemories` 的 30s 超时值**（§9.4）——当前是拍脑袋定的。它的作用是「不让索引重建无限期阻塞启动」，正确取值取决于记忆表规模与分词吞吐，需要真实数据。**超时太短会让服务带着不可用的 BM25 启动（§7.7 路径），太长则启动被拖住。**
14. **「配置是否被真正消费」的可观测性**（§13 末尾）——本仓库连续四次栽在「参数存在但没人观察它是否生效」上（§4.5、§4.7、§4.8、§4.9）。**修掉这四个具体实例是本设计能做的；建立一套能系统性发现这一类问题的机制，超出本份范围。** 值得作为独立的工程改进项评估（候选方向：启动时的配置自检、对每个必填参数做「缺失会失败」的契约测试、或在配置解析层做一次显式的 round-trip 断言）。
15. **`jieba-wasm` 的条件导出陷阱**（§8.2）——包内 `exports` 映射把 `"import"` 条件指向了**浏览器构建**（`pkg/web/`，异步初始化），而 `"node"` 指向 Node 构建（`pkg/nodejs/`，同步）。Node 的解析顺序里 `node` 优先，所以服务端安全；**但任何不设 `node` 条件的打包器都会静默拿到异步构建**，表现为「以前能跑，加了某个构建步骤后要 `await` 了」。`packages/memory` 是纯服务端的，**要确保它不被卷进 `apps/web` 的前端 bundle**——这值得在 P2 加一条构建期检查。

---

## 参考

§10.1 的选型判断依据以下来源（2026 年检索）：

- [Embedding API 向量化完全指南：RAG 开发必备的模型选型与实战（2026）](https://ofox.ai/zh/blog/embedding-api-rag-guide-2026/) — BGE-M3 与 Qwen3-Embedding 的对比、中文场景建议
- [Best Open-Weight Embedding Models 2026 | Presenc AI](https://presenc.ai/research/best-open-weight-embedding-models-2026) — 开源 embedding 模型横向对比
- [Best Ollama Embedding Models 2026: 7 Benchmarked by MTEB Score, VRAM, and Dimensions](https://www.morphllm.com/ollama-embedding-models) — 各模型的维度、显存、MTEB 分数；Ollama 的 OpenAI 兼容 `/v1/embeddings`
- [向量模型与向量库选型：2026年实战指南](https://gitcode.csdn.net/6a24bf1910ee7a33f278e1fd.html) — 中文场景选型
- [Qwen3-Embedding 技术报告（英中对照片）](https://www.52nlp.cn/wp-content/uploads/2025/06/Qwen3-Embedding%E6%8A%80%E6%9C%AF%E6%8A%A5%E5%91%8A%E8%8B%B1%E4%B8%AD%E5%AF%B9%E7%85%A7%E7%89%88.pdf) — MTEB 中文排名、MRL 可调维度

**注意：这些来源的结论是社区基准，不是本项目数据。** 最终选型应由 Spec 2 的评测决定（§16 第 11 条）。
