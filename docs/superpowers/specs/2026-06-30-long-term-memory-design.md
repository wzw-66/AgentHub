# Long-Term Memory 模块设计

## 1. 概述

为 AgentHub 增加长期记忆能力，让 AI Agent 跨对话记住用户偏好、项目决策、技术上下文等信息。

**核心理念**：记忆独立于业务数据存储（SQLite），异步提取，首次 SubTask 注入一次以最大化 prefix caching 收益。

## 2. 存储方案

- **存储引擎**：SQLite + better-sqlite3（同步 API）
- **全文搜索**：FTS5（built-in，unix61 tokenizer）
- **数据隔离**：每个用户/Agent 组合独立记录，通过 `user_id` + `agent_id` 复合索引加速
- **路径**：默认 `~/.agenthub/memory.db`，可通过 `dbPath` 配置覆盖

**选型理由**：记忆写少读多、无事务强要求、FTS5 开箱即用全文搜索、故障隔离（不拖累 PostgreSQL）、零运维。

## 3. 数据模型

### 3.1 SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS memory_records (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'fact',
  content           TEXT NOT NULL,
  tags              TEXT NOT NULL DEFAULT '[]',  -- JSON array
  source_message_id TEXT,
  conversation_id   TEXT,
  importance        INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_memory_user_agent ON memory_records(user_id, agent_id);
CREATE INDEX idx_memory_user ON memory_records(user_id);
CREATE INDEX idx_memory_conversation ON memory_records(conversation_id);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  content, tags,
  content='memory_records',
  content_rowid='rowid',
  tokenize='unicode61'
);

-- Sync triggers
CREATE TRIGGER IF NOT EXISTS mem_fts_ai AFTER INSERT ON memory_records BEGIN
  INSERT INTO memory_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS mem_fts_ad AFTER DELETE ON memory_records BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS mem_fts_au AFTER UPDATE ON memory_records BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
  INSERT INTO memory_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;
```

### 3.2 TypeScript Types（新增到 `packages/shared`）

```typescript
// packages/shared/src/types/memory.ts
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
export type { MemoryRecord };

// packages/shared/src/enums/memory.ts — 使用文字联合类型（Const enum 不利于扩展）
export type MemoryType =
  | "fact"          // 客观事实
  | "preference"    // 用户偏好
  | "decision"      // 架构/技术决策
  | "error_pattern" // 错误模式
  | "context";      // 项目/技术栈上下文

// 非共享内部类型（仅 packages/memory 使用）
interface ExtractedMemory {
  action: "add" | "update" | "delete" | "noop";
  id?: string;
  type?: MemoryType;
  content?: string;
  tags?: string[];
  importance?: number;
  reason?: string;
}

interface CreateMemoryInput {
  userId: string;
  agentId: string;
  type: MemoryType;
  content: string;
  tags?: string[];
  sourceMessageId?: string;
  conversationId?: string;
  importance?: number;
}

interface MemoryConfig {
  dbPath?: string;    // 默认 ~/.agenthub/memory.db
  llm?: {
    apiKey?: string;
    endpoint?: string;
    model?: string;
  };
}
```

## 4. 包结构

```
packages/memory/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts              # 公开 API 导出
│   ├── db.ts                 # SQLite 连接管理（单例，懒初始化）
│   ├── schema.ts             # DDL 执行
│   ├── repository.ts         # CRUD（同步 API）
│   ├── search.ts             # FTS5 搜索（同步 API）
│   ├── extractor.ts          # LLM 记忆提取（异步，复用 config.llm）
│   ├── types.ts              # 内部类型
│   └── __tests__/
│       ├── setup.ts
│       ├── repository.test.ts
│       ├── search.test.ts
│       └── extractor.test.ts
```

### 4.1 依赖图

```
@agenthub/shared → @agenthub/memory
                     ├── better-sqlite3 (runtime)
                     └── @types/better-sqlite3 (dev)
```

消费者：`@agenthub/server` 引入 `@agenthub/memory`。

## 5. Public API

### 5.1 Repository（同步 API）

```typescript
function createMemory(input: CreateMemoryInput, db?: Database): MemoryRecord;
function getMemory(id: string, db?: Database): MemoryRecord | null;
function listMemories(
  params: { userId: string; agentId?: string; type?: MemoryType; limit?: number; offset?: number },
  db?: Database
): { data: MemoryRecord[]; total: number };
function deleteMemory(id: string, db?: Database): void;
function searchMemories(
  options: { query: string; userId?: string; agentId?: string; limit?: number; offset?: number },
  db?: Database
): MemoryRecord[];
```

### 5.2 Extractor（异步）

```typescript
async function extractMemories(
  params: {
    userId: string;
    agentId: string;
    agentName: string;
    userMessage: string;
    agentResponse: string;
  },
  llmConfig?: { apiKey?: string; endpoint?: string; model?: string }
): Promise<void>;
```

## 6. LLM 提取管道

### 6.1 触发时机

每次 Agent 执行完成并保存回复后，异步触发（不阻塞响应）：
- `runAgentExecution()` — 单 Agent 路径
- `runOrchestration()` — 群聊/Orchestrator 路径

### 6.2 流程

```
Agent 回复完成
       │
       ▼
searchMemories(query=userMessage, agentId, limit=5)  -- 检索已有相关记忆
       │
       ▼
LLM 调用（复用 config.llm）
  prompt: 分析对话 + 已有记忆 top 5 → 输出 JSON 操作列表
       │
       ▼
解析 LLM 输出 → 逐条执行 ADD / UPDATE / DELETE / NOOP
       │
       ▼
写入 SQLite + FTS5 同步更新（由触发器自动维护）
```

### 6.3 Extractor Prompt

```
你是一个 AI 记忆提取系统。分析以下对话，提取需要 Agent 长期记住的信息。

需要关注：
1. 用户偏好（技术栈、代码风格、沟通偏好）
2. 项目决策（架构选择、设计模式）
3. 关键事实（项目路径、API 端点、配置信息）
4. 错误模式（遇到的 bug 和修复方式）
5. 上下文信息（用户角色、技术栈、项目目标）

对每条候选记忆，与已有记忆对比后决定操作：

对话：
用户: {userMessage}
Agent ({agentName}): {agentResponse}

已有记忆（最近相关的 5 条）：
{existingMemoriesJson}

输出 JSON 数组，每项：
{
  "action": "add" | "update" | "delete" | "noop",
  "id": "已有记忆的 id（update/delete 时需要）",
  "type": "fact" | "preference" | "decision" | "error_pattern" | "context",
  "content": "记忆内容",
  "importance": 1-10,
  "reason": "操作原因说明"
}
```

## 7. Server 集成

### 7.1 新路由

在 `apps/server/src/routes/memory.ts`：

| 端点 | 方法 | 说明 |
|------|------|------|
| `POST /api/memory/create` | POST | 手动创建记忆（请求体 JSON） |
| `GET /api/memory/list` | GET | 分页列表（query: userId, agentId?, type?, limit?, offset?） |
| `GET /api/memory/search` | GET | 全文搜索（query: q, userId?, agentId?, limit?, offset?） |
| `DELETE /api/memory/delete` | DELETE | 删除单条（query: id） |

在 `app.ts` 的 protected routes 段中注册。

### 7.2 routes/messages.ts — Post-Execution Hook

在 `runAgentExecution()` 和 `runOrchestration()` 执行完成、回复保存后增加：

```typescript
if (fullResponse) {
  extractMemories({
    userId: request.userId!,
    agentId: agent.id,
    agentName: agent.name,
    userMessage: content,
    agentResponse: fullResponse,
  }).catch(err => {
    request.server.log.error({ err }, "Memory extraction failed");
  });
}
```

### 7.3 executor.ts — BuildContext 注入

设计决策：**仅首次 SubTask 注入一次记忆**，以最大化 Anthropic prefix caching 收益。

```typescript
class Executor {
  private _memoryInjected = false;

  private buildContext(subtask: SubTask): AgentContext {
    // ... 现有代码 ...

    if (!this._memoryInjected) {
      let memoriesContext: string | undefined;
      try {
        const memories = searchMemories({
          query: subtask.instruction,
          agentId: subtask.agentId,
          limit: 5,
        });
        if (memories.length > 0) {
          memoriesContext = memories.map(m => `[Memory - ${m.type}] ${m.content}`).join('\n\n');
        }
      } catch { /* non-blocking */ }

      this._memoryInjected = true;

      if (memoriesContext) {
        return {
          ...existingContext,
          systemPrompt: [existingPrompt, memoriesContext].filter(Boolean).join('\n\n'),
        };
      }
    }

    return existingContext;
  }
}
```

## 8. Web UI (P2)

`MemoryPanel` 组件 — 嵌入 Agent 详情页或对话侧边栏：

- Agent 下拉筛选（含"全部"选项）
- 类型筛选（fact / preference / decision / error_pattern / context）
- 全文搜索框（FTS5 实时搜索）
- 删除按钮
- 新建记忆按钮（弹窗表单）

## 9. Build Config

- `pnpm-workspace.yaml` — 已有 `packages/*`，自动覆盖
- `turbo.json` — 添加 `memory#build` 和 `memory#test` 任务定义
- `pnpm install` — 安装 better-sqlite3 等依赖

## 10. 实现阶段

### Phase 1: 存储引擎 (P1)
- 创建 `packages/memory/`（package.json, tsconfig, tsup.config）
- 实现 `db.ts` — SQLite 连接单例
- 实现 `schema.ts` — DDL + FTS5 + 触发器
- 实现 `repository.ts` — CRUD 操作
- 实现 `search.ts` — FTS5 搜索
- 单元测试

### Phase 2: LLM Extractor (P1)
- 实现 `extractor.ts` — LLM prompt + JSON 输出解析
- 复用现有 `config.llm`
- 单元测试

### Phase 3: Server API (P1)
- 创建 `routes/memory.ts` + JWT auth
- 注册到 `app.ts`

### Phase 4: Orchestrator 集成 (P1)
- `executor.ts` — `buildContext()` 记忆检索注入
- `routes/messages.ts` — post-execution 提取 hook

### Phase 5: Build Config & 依赖 (P1)
- `turbo.json` 更新
- `pnpm install`

### Phase 6: Web UI (P2)
- `MemoryPanel.tsx` 组件
- 集成到 Agent 详情页

### Phase 7: 集成测试 (P1)
- API 路由测试
- 端到端流程测试（消息 → 提取 → 存储 → 检索）
