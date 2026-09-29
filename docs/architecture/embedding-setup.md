# Embedding 部署说明

长期记忆的**向量路是可选能力**。未配置时系统退化为纯 BM25 并打 warning ——
中文检索仍然可用（那是预分词带来的，不依赖向量），只是没有语义召回。

本文对应 spec §10.1 / §10.2 / §10.3，覆盖：选型结论、实际部署路径、未配置时的确切行为、
以及已知缺陷。可运行的手动验证步骤见 `long-term-memory.md` 的「手动验证步骤」第 3 段。

## 结论速览

| 问题 | 答案 |
|------|------|
| 向量路是必需的吗？ | **不是。** 未配置时退化为纯 BM25，`/api/memory/search` 照常工作 |
| 配什么？ | 任意 **OpenAI 兼容** 的 `/v1/embeddings` 端点 |
| 推荐什么？ | 本地 **Ollama + `bge-m3`**（零 key、零容器、零代码改动、毫秒级延迟） |
| 选型结论 | `bge-m3`：中文第一梯队、**不需要 query/passage 前缀**、1024 维、MIT |
| 未配置时会怎样？ | `config.embedding === undefined` → 不启动 worker → 启动打一条 warning → 纯 BM25 |
| 会静默兜底吗？ | **不会。** 缺失与非法同等对待，整条配置作废 —— 没有任何默认模型 |

## 为什么需要单独部署

- **`bge-m3` 没有官方 API。** BAI 只发布权重（MIT 许可），不提供托管服务。
  要用它必须自己跑一个推理进程。
- **现有的 LLM 配置复用不了。** 本仓库的 LLM 是 DeepSeek，而
  `api.deepseek.com/v1/embeddings` 返回 **404** —— DeepSeek 没有 embeddings 端点。
  所以 `EMBEDDING_BASE_URL` 与 `LLM_BASE_URL` 是**互相独立**的两个变量。

> **向量路能否启用，取决于你能访问哪个 embedding 端点。这是一个部署决策，不是技术决策。**

## 选型结论

按「中文检索质量 → 是否需要前缀 → 可达性 → 维度 → 上下文长度 → 许可」排序：

| 模型 | 维度 | 中文 | 前缀 | 可达方式 | 许可 |
|------|------|------|------|----------|------|
| **`BAAI/bge-m3`** | 1024 | 强 | **不需要** | SiliconFlow / 自建（TEI、Ollama） | MIT |
| `Qwen3-Embedding-0.6B` | 1024 | 同尺寸更强 | 可选 instruction | DashScope / Ollama | 通义千问（非 MIT） |
| `Qwen3-Embedding-8B` | 4096 | MTEB 中文第一 | 同上 | 需 GPU | 同上 |
| `BAAI/bge-large-zh-v1.5` | 1024 | 强（纯中文专用） | **查询侧必须加** | SiliconFlow / 自建 | MIT |
| `text-embedding-3-small` | 1536 | 中等，明显弱于 bge 系 | 不需要 | OpenAI | 闭源 |

**选 `bge-m3`**，理由：

1. **中文**：多语言检索第一梯队，「中文场景可以直接选它」是社区共识。
2. **不需要前缀**：这是它相对 `bge-*-zh` 系与 E5 系最大的工程优势 ——
   **少一个静默失效点**。非对称模型忘加前缀**不会报错**，只会安静地把召回率拉低一档。
3. **1024 维**：单条 4KB；本设计的作用域是单会话，量级在数百到数千条 →
   存储与暴力扫描都无压力。
4. **MIT 许可**，部署最广：Ollama / TEI / Xinference / vLLM 都直接支持。
5. 附带 dense / sparse / ColBERT 三种表示，**本设计只用 dense** ——
   sparse 路与已有的 BM25 路职责重叠，引入它属于重复建设。

**`Qwen3-Embedding-0.6B` 是并列首选**（同尺寸中文更强，支持 MRL 可调维度）。
未选它的原因只有一条 —— 多一个依赖。**若你已经有 Ollama 或 DashScope，选它。**

### 代码里没有任何硬编码的模型选择

`createOpenAICompatibleEmbeddingProvider` 的 `model` / `dim` / `mode` 全部来自
`EMBEDDING_*` 环境变量，端点由 `EMBEDDING_BASE_URL` 决定（代码只负责拼上 `/embeddings`）。
因此上表里任何一个 OpenAI 兼容端点都是**换配置，不是改代码**。

## 推荐路径：本地 Ollama

唯一同时满足「零 key、零代码改动、零容器」的选项。

```bash
brew install ollama
ollama serve            # 默认监听 127.0.0.1:11434
ollama pull bge-m3      # 567M 参数，约 1.2GB；ollama list 能看到它才算就绪
```

然后在仓库根 `.env` 里（`.env.example` 有同款注释块，取消注释即可）：

```
EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1
EMBEDDING_API_KEY=EMPTY      # Ollama 不校验，但实现要求非空
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIM=1024           # 必须与端点实际返回的向量长度一致
# EMBEDDING_MODE=symmetric   # 可省略；默认 symmetric。bge-m3 是对称模型
```

重启 server（`dotenv` 只在进程启动时读一次 `.env`，热改文件无效）。

**这四个变量缺任意一个，向量路就整体关闭** —— 不会用默认模型兜底。
理由：本仓库曾经因为环境变量名不匹配（`.env` 写 `MODEL`，代码读 `LLM_MODEL`）
而静默回落到 `deepseek-chat`，用户配置的模型从未生效且无人发现。
配置缺失必须是显式失败，不能是猜测。

**本地推理的附带好处：** 查询向量化没有网络延迟（毫秒级而非 100–300ms），
且不需要任何 API key —— spec §6.4 里那 100–300ms 的「唯一新增同步延迟」就此消失。

### 可选变量

| 变量 | 用途 |
|------|------|
| `EMBEDDING_MODE` | `symmetric`（默认）/ `asymmetric`。**拼错会被拒绝**，不会退回默认 |
| `EMBEDDING_DIMENSIONS` | MRL 降维（如 `256`，仅 Qwen3 等部分模型支持）。**用了它就要把 `EMBEDDING_DIM` 也设成同一个值** —— 返回长度与 `EMBEDDING_DIM` 不符会让每个向量都被拒收 |
| `EMBEDDING_QUERY_PREFIX` / `EMBEDDING_DOCUMENT_PREFIX` | 非对称模型的查询/文档侧前缀。`bge-m3` **不需要**；`bge-large-zh-v1.5` 必须给查询侧前缀 |

## 未配置时的确切行为（spec §10.3）

**选定行为：未配置完整的 embedding 配置时，系统退化为纯 BM25 模式。**

具体到每一步：

| 环节 | 未配置时的行为 |
|------|----------------|
| 配置解析 | `config.embedding === undefined`（不是部分配置、不是默认值） |
| 启动 | **不启动**嵌入 worker（`startEmbeddingWorker` 根本不会被调用） |
| 启动日志 | 打一条 warning（原文见下），说清缺什么、后果是什么 |
| `configureSearch` | 只注入 `segmenter`，不注入 `vectorIndex` / `embeddingProvider` |
| 检索 | BM25 路照常；向量路返回空榜单 → RRF 自然退化为纯 BM25（**融合层没有降级分支**） |
| `/api/memory/search` | 正常工作，只是没有语义召回 |
| 写入 | 完全不受影响（写入路径本来就不碰 embedding 服务） |
| 待嵌入计数 | `/api/memory/list` 的 `globalPendingCount` 变成「从未算过向量的记忆条数」（**不是 0**） |

启动 warning 的原文（`apps/server/src/index.ts`）：

```
[memory] EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL / EMBEDDING_DIM
not all set to valid values (EMBEDDING_MODE must be symmetric or asymmetric when
set; EMBEDDING_DIM / EMBEDDING_DIMENSIONS must be positive integers) —
semantic recall is DISABLED, falling back to BM25 only.
```

**「配置错了」与「没有配置」走同一条路**（整条配置 undefined + 这条 warning）：
一个认不出的 `EMBEDDING_MODE`（`Asymmetric`、`symetric`、`"asymmetric "`）、
一个非正整数的 `EMBEDDING_DIM`（`1024abc`）或 `EMBEDDING_DIMENSIONS`，
都**不是**「用默认值继续」，而是「这个配置不可用」。措辞刻意覆盖了后者 ——
否则一个拼错的 `EMBEDDING_MODE` 会得到一句「变量没配全」的误导性提示（明明都配了）。

**为什么不做兜底：** 给 `EMBEDDING_MODEL` 兜底，一个拼错的模型名会静默换一个模型，
把**另一个向量空间**写进索引；给 `EMBEDDING_DIM` 兜底会造成 BLOB 静默截断。
**没有兜底时，「配置错误」等价于「向量路显式关闭」，这是唯一能保证配置被真正读取的机制。**
可选带默认值的契约是「省略 ⇒ 默认」，**不是「认不出 ⇒ 默认」**。

### 怎么确认向量路是开是关

启动日志里二选一，没有第三种：

```
[memory] embedding enabled: bge-m3 (1024d, symmetric)      # 开
[memory] ... semantic recall is DISABLED, falling back to BM25 only.   # 关（或配置非法）
```

端点本身是否可用，直接打一发（provider 上虽然有 `healthCheck()`，
但**服务端目前没有任何地方调用它** —— 不要指望启动时报出端点不可达）：

```bash
curl -s http://127.0.0.1:11434/v1/embeddings \
  -H 'Content-Type: application/json' \
  -d '{"model":"bge-m3","input":["健康检查"]}' | head -c 200
```

返回 `{"data":[{"embedding":[...]}]}` 即正常；`404` 说明模型没 pull，
`Connection refused` 说明 `ollama serve` 没跑。

## 已知问题：`bge-m3` 对某些技术文档返回 NaN

Ollama issue **#14657**：`bge-m3` 经 `/v1/embeddings` 对**某些技术文档**返回 NaN 向量
（简单文本正常）。而**本项目存的正是技术文档** —— 错误码、文件路径、API 端点、
配置片段，恰好落在触发区间内。

缓解办法：

```bash
OLLAMA_FLASH_ATTENTION=false ollama serve
```

本模块在写入前会做 `isFinite` 校验（`assertFiniteVector`，在 `normalize` **之前**），
NaN / Inf 向量会被**丢弃并重试**，不会进入索引。NaN 之所以必须挡在这里：
BLOB 里 NaN 也是合法的 float32 位模式，点积会传播为 NaN，`sort` 的比较返回 false ——
该条记忆的位次**任意且不抛错**。

**表现为「该条记忆暂时只在 BM25 榜单里」**（向量路没有它、BM25 路照常有它）。
worker 每轮重试，所以它不会永久丢失，但也可能一直失败。

**可观察信号：`/api/memory/list` 响应里的 `globalPendingCount` 长期不降。**
那说明这个缺陷在频繁触发 —— 应考虑换用 `Qwen3-Embedding-0.6B` 或换推理后端
（TEI / vLLM / SiliconFlow）。

> `globalPendingCount` 是 HTTP 响应字段名（进程级计数，刻意不按请求者过滤）；
> worker 实例上那个同名方法是 `startEmbeddingWorker(...).pendingCount()`。
> 两者判据相同（无指纹匹配的向量行），但**不是同一个东西**，别混。

## 换模型 / 换维度的代价

向量行的指纹是 **`${model}:${dim}:${mode}`**（`memory_embeddings.fingerprint`），
它同时是「待嵌入队列」的前进判据与失效判据 —— 两者是同一个值，不可能漂移。

| 改动 | 是否自动重算 |
|------|--------------|
| `EMBEDDING_MODEL` | 是（全部旧向量作废并重新入队） |
| `EMBEDDING_DIM`（含通过 `EMBEDDING_DIMENSIONS` 改变实际宽度） | 是 |
| `EMBEDDING_MODE` | 是 |
| `EMBEDDING_QUERY_PREFIX` / `EMBEDDING_DOCUMENT_PREFIX` | **不会** —— 前缀不进指纹 |

**重算是真实成本，不是免费的**：worker 默认每 5 秒一批 32 条，且**一轮没跑完会跳过
下一个 tick**（至多一轮在飞）。1 万条 = 313 轮；本地推理下每轮通常超过 5 秒，
所以「26 分钟」是**乐观下界**，真实耗时按每轮实测时长乘 313 估。大规模库上换模型前先评估。

**改了前缀必须手动作废旧向量**，否则新旧前缀的向量会混在同一个索引里，
而队列看起来是空的：

```bash
sqlite3 .agenthub/memory.db "DELETE FROM memory_embeddings;"
# 下次启动/下一轮 worker 会把全部记忆重新入队（LEFT JOIN 判据天然自愈）
```

## 与数据库的关系（两条硬约束）

- **库版本 `PRAGMA user_version = 3`**：v2 引入 `memory_embeddings` 表，
  v3 把 FTS 索引换到分词列。迁移是**只追加**的，`initSchema()` 每次启动跑一遍幂等。
- **两个 SQLite 文件必须分开**：`.agenthub/agenthub.db`（Prisma）与
  `.agenthub/memory.db`（better-sqlite3）。合并会丢 FTS5 影子表 ——
  `prisma db push` 不认识 `memory_fts_*`，会把它当 schema drift 删掉。
  删掉向量表（`memory_embeddings`）的后果是「全部记忆退回待嵌入」，可自愈；
  删掉 FTS 影子表的后果是中文检索静默失效且索引重建代价高。**别合并。**
