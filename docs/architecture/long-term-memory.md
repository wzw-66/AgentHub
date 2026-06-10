# Long-Term Memory Module

为 AgentHub 增加长期记忆能力，让 AI Agent 能跨对话记住用户偏好、项目决策、技术上下文等信息。

## Status

- **Status:** Draft
- **Author:** CEO Review
- **Date:** 2026-06-05
- **Branch:** dev

## Core Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      @agenthub/memory                            │
│                                                                  │
│  ┌─────────────────────┐    ┌────────────────────────────────┐   │
│  │  Repository Layer    │    │  Extractor Layer               │   │
│  │  - createMemory()    │    │  - extractMemories()           │   │
│  │  - getMemory()       │    │  - LLM prompt: analyze +       │   │
│  │  - listMemories()    │    │    compare + decide            │   │
│  │  - deleteMemory()    │    │    ADD/UPDATE/DELETE/NOOP      │   │
│  │  - searchMemories()  │    │                                │   │
│  └──────────┬───────────┘    └──────────────┬─────────────────┘   │
│             │                               │                      │
│             └───────────┬───────────────────┘                      │
│                         │                                          │
│              ┌──────────▼──────────┐                               │
│              │  SQLite (better-    │                               │
│              │  sqlite3) + FTS5    │                               │
│              │  memory_records     │                               │
│              │  memory_fts (index) │                               │
│              └─────────────────────┘                               │
└──────────────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │ retrieve memories                  │ extract from completed
         │ in buildContext()                  │ conversations
         │                                    │
┌────────┴──────────────┐       ┌─────────────┴──────────────────┐
│  Orchestrator          │       │  Messages Handler              │
│  executor.ts           │       │  routes/messages.ts            │
│  pre-execution hook    │       │  post-execution hook           │
└───────────────────────┘       └────────────────────────────────┘
                                           ▲
                                           │
                                ┌──────────┴──────────┐
                                │  LLM (复用现有配置)    │
                                │  config.llm           │
                                └─────────────────────┘
```

## Data Model (SQLite FTS5)

### memory_records 表

```sql
CREATE TABLE IF NOT EXISTS memory_records (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,       -- 所属用户
  agent_id          TEXT NOT NULL,       -- 所属 Agent (Contact.id)
  type              TEXT NOT NULL DEFAULT 'fact',
  content           TEXT NOT NULL,       -- 记忆内容
  tags              TEXT NOT NULL DEFAULT '[]',  -- JSON array
  source_message_id TEXT,                -- 来源消息 ID
  conversation_id   TEXT,                -- 来源会话 ID
  importance        INTEGER NOT NULL DEFAULT 1,  -- 1-10
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- FTS5 full-text index on content + tags
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

### Types

```typescript
// @agenthub/shared 新增
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

type MemoryType =
  | "fact"          // 客观事实
  | "preference"    // 用户偏好
  | "decision"      // 架构/技术决策
  | "error_pattern" // 错误模式
  | "context";      // 项目/技术栈上下文

// LLM extractor 输出单元
interface ExtractedMemory {
  action: "add" | "update" | "delete" | "noop";
  id?: string;
  type?: MemoryType;
  content?: string;
  tags?: string[];
  importance?: number;
  reason?: string;
}
```

## Extraction Pipeline

### 触发时机

每次 Agent 执行完成并保存回复后，异步触发记忆提取：

```
Agent 回复完成 (runAgentExecution / runOrchestration)
       │
       ▼
extractMemories({
  userId,
  agentId,
  userMessage,
  agentResponse,
  agentName,
  existingMemoriesTop5
})
       │
       ▼
LLM 调用 (复用 config.llm 配置)
       │
       ▼
解析 LLM 输出 → 逐条执行 ADD/UPDATE/DELETE/NOOP
       │
       ▼
写入 SQLite + FTS5 同步更新
```

### Extractor Prompt

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
  "tags": ["标签1", "标签2"],
  "importance": 1-10,
  "reason": "操作原因说明"
}
```

## Package Structure

```
packages/memory/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts                  # 公开 API
│   ├── db.ts                     # SQLite 连接管理（单例）
│   ├── schema.ts                 # DDL 语句
│   ├── repository.ts             # CRUD 操作
│   ├── search.ts                 # FTS5 搜索
│   ├── extractor.ts              # LLM 记忆提取
│   ├── types.ts                  # 内部类型
│   └── __tests__/
│       ├── setup.ts
│       ├── repository.test.ts
│       ├── search.test.ts
│       └── extractor.test.ts
```

### Public API

```typescript
// === Repository API ===

async function createMemory(
  input: CreateMemoryInput,
  db?: Database
): Promise<MemoryRecord>;

async function getMemory(
  id: string,
  db?: Database
): Promise<MemoryRecord | null>;

async function listMemories(params: {
  userId: string;
  agentId?: string;
  type?: MemoryType;
  limit?: number;
  offset?: number;
}, db?: Database): Promise<{ data: MemoryRecord[]; total: number }>;

async function deleteMemory(
  id: string,
  db?: Database
): Promise<void>;

async function searchMemories(options: {
  query: string;         // FTS5 MATCH query
  userId?: string;
  agentId?: string;
  limit?: number;
  offset?: number;
}, db?: Database): Promise<MemoryRecord[]>;

// === Extractor API ===

async function extractMemories(params: {
  userId: string;
  agentId: string;
  agentName: string;
  userMessage: string;
  agentResponse: string;
}, config?: {
  apiKey?: string;
  endpoint?: string;
  model?: string;
}): Promise<void>;

// === Config ===

interface MemoryConfig {
  dbPath?: string;    // default: ~/.agenthub/memory.db
  llm?: {
    apiKey?: string;
    endpoint?: string;
    model?: string;
  };
}
```

## Server Integration

### New Route: `/api/memory/*`

```
POST   /api/memory/create    → createMemory (手动创建)
GET    /api/memory/list      → listMemories (分页)
GET    /api/memory/search    → searchMemories (FTS5 搜索)
DELETE /api/memory/delete    → deleteMemory
```

### Modifications to `routes/messages.ts`

在 `runAgentExecution()` 和 `runOrchestration()` 完成后，增加异步提取步骤：

```typescript
// After agent execution completes:
if (fullResponse) {
  // 异步提取记忆，不阻塞响应
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

### Modifications to `executor.ts`

在 `buildContext()` 中增加记忆检索：

```typescript
private async buildContext(subtask: SubTask): Promise<AgentContext> {
  // ... 现有代码 ...

  // 新增：检索相关记忆
  let memoriesContext: string | undefined;
  try {
    const memories = await searchMemories({
      query: subtask.instruction,
      agentId: subtask.agentId,
      limit: 5,
    });
    if (memories.length > 0) {
      memoriesContext = memories
        .map(m => `[Memory] ${m.content}`)
        .join('\n');
    }
  } catch { /* non-blocking */ }

  return {
    ...existingContext,
    ...(memoriesContext ? {
      systemPrompt: [existingPrompt, memoriesContext].filter(Boolean).join('\n\n')
    } : {}),
  };
}
```

## Web UI

### MemoryPanel 组件

位置：`apps/web/src/components/MemoryPanel.tsx`

功能：
- 按 Agent 筛选显示记忆列表
- 全文搜索框
- 删除按钮
- 新建记忆按钮（modal 表单）

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
│ ├─────────────────────────────────┤ │
│ │ 📌 项目使用 PostgreSQL + Prisma  │ │
│ │    类型: context    重要性: 8    │ │
│ │    来自 2026-05-28 #技术选型     │ │
│ │                           [✕]  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Dependencies

```
@agenthub/shared → @agenthub/memory → @agenthub/server
                     │
                     ├── better-sqlite3 (runtime)
                     └── @types/better-sqlite3 (dev)
```

## Implementation Tasks

### Phase 1: Storage Engine (P1)

- [ ] Create `packages/memory/` with package.json, tsconfig, tsup.config
- [ ] Implement `db.ts` — SQLite connection singleton
- [ ] Implement `schema.ts` — DDL + FTS5 + triggers
- [ ] Implement `repository.ts` — CRUD operations
- [ ] Implement `search.ts` — FTS5 search methods
- [ ] Add tests for CRUD and search

### Phase 2: LLM Extractor (P1)

- [ ] Implement `extractor.ts` — LLM prompt + parsing
- [ ] Integrate with existing `config.llm` configuration
- [ ] Add extractor tests

### Phase 3: Server API (P1)

- [ ] Create `routes/memory.ts`
- [ ] Register in `app.ts` under `/api/memory`
- [ ] Add JWT auth middleware

### Phase 4: Orchestrator Integration (P1)

- [ ] Modify `executor.ts:buildContext()` — memory retrieval injection
- [ ] Modify `routes/messages.ts` — post-execution extraction hook

### Phase 5: Build Config (P1)

- [ ] Update `pnpm-workspace.yaml`
- [ ] Update `turbo.json`
- [ ] Run `pnpm install`

### Phase 6: Web UI (P2)

- [ ] Implement `MemoryPanel.tsx`
- [ ] Integrate into Agent detail page

### Phase 7: Integration Tests (P1)

- [ ] API route tests
- [ ] End-to-end flow (message → extract → store → retrieve)
