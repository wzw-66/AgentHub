# Orchestrator（多 Agent 任务编排器）架构与流程

## 概述

Orchestrator 是 AgentHub 多 Agent 协作的核心"大脑"。当用户在群聊中发送一条消息并 `@` 提及多个 Agent 时，编排器负责分析消息意图、拆解为子任务、构建 DAG、调度执行、处理失败并汇总结果。

### 核心能力

- **消息意图分析** — 基于 @提及 + 顺序词，将消息拆解为独立子任务
- **DAG 调度引擎** — 拓扑排序 → 分层并行 + 跨层串行的执行计划
- **并行任务分发** — 每个 Agent 拥有独立 SSE 流，实时推送输出
- **串行依赖链** — 下游任务自动消费上游结果，注入上下文
- **失败重试** — 自动重试一次，失败跳过不阻塞其他并行任务
- **结果聚合** — 写数据库 + SSE 事件推送，前端实时展示编排流程
- **编排器 SSE 事件协议** — 任务拆解/状态变更/聚合完成的事件推送

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                       apps/server                                    │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────────────────────────────┐  │
│  │  routes/      │    │              orchestrator/               │  │
│  │  messages.ts  │───▶│                                          │  │
│  │  (handleCreate│    │  ┌──────────────┐    ┌────────────────┐ │  │
│  │   + 检测群聊)  │    │  │intent-       │───▶│ task-graph.ts  │ │  │
│  └──────┬───────┘    │  │analyzer.ts   │    │ (DAG + 拓扑排序) │ │  │
│         │            │  └──────────────┘    └────────┬───────┘ │  │
│         │            │                              │          │  │
│         │            │  ┌───────────────────────────▼────────┐ │  │
│         │            │  │           dispatcher.ts            │ │  │
│         │            │  │  (按层调度: 并行 + 串行 + 结果注入)   │ │  │
│         │            │  └──────────┬─────────────────────────┘ │  │
│         │            │             │                           │  │
│         │            │  ┌──────────▼────────┐  ┌────────────┐ │  │
│         │            │  │  executor.ts      │  │aggregator  │ │  │
│         │            │  │  (AgentAdapter    │  │.ts         │ │  │
│         │            │  │  包装 + 重试 + SSE) │  │(持久化+SSE)│ │  │
│         │            │  └──────────────────┘  └────────────┘ │  │
│         │            └──────────────────────────────────────────┘  │
│         │                         │                                │
│         ▼                         ▼                                │
│  ┌──────────────┐    ┌───────────────────────┐                     │
│  │ realtime/    │    │  @agenthub/db         │                     │
│  │ Connection-  │    │  createMessage        │                     │
│  │ Manager      │    │  createArtifact       │                     │
│  │ (SSE推流)    │    │  listContacts         │                     │
│  └──────────────┘    └───────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  @agenthub/agent-core                                                │
│                                                                      │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐            │
│  │ClaudeAdapter│  │OpenCodeAdapter│  │CustomAgentAdapter│            │
│  └────────────┘  └──────────────┘  └──────────────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 模块职责

### 1. `types.ts` — 核心类型定义

```typescript
// 子任务
interface SubTask {
  id: string;                    // subtask_{msgId}_{agentId}
  parentMessageId: string;
  conversationId: string;
  agentId: string;               // 目标 Agent ID
  agentName: string;             // Agent 显示名称
  instruction: string;           // 分配给该 Agent 的指令片段
  dependsOn: string[];           // 依赖的其他子任务 ID
  context: { role: string; content: string }[];  // 消息上下文
  status: SubTaskStatus;         // pending → running → completed/failed/skipped
  retryCount: number;
}

// 任务拆解结果
interface TaskDecomposition {
  originalMessageId: string;
  conversationId: string;
  subtasks: SubTask[];
  layers: string[][];           // DAG 分层: 每层可并行执行
}

// 聚合结果
interface AggregatedResult {
  messageId: string;
  summary: string;
  taskResults: Array<{ agentId; agentName; success; preview; error }>;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  skippedTasks: number;
}
```

### 2. `intent-analyzer.ts` — 消息意图分析

**职责**：将群聊消息拆解为针对不同 Agent 的子任务。

**Phase 1 实现（规则引擎）**：

```
输入: "@产品经理 @设计师 @前端开发 帮我设计一个登录页面"
输出: TaskDecomposition {
  subtasks: [
    { agentId: "agent_1", agentName: "产品经理", instruction: "帮我设计一个登录页面", dependsOn: [] },
    { agentId: "agent_2", agentName: "设计师", instruction: "帮我设计一个登录页面", dependsOn: [] },
    { agentId: "agent_3", agentName: "前端开发", instruction: "帮我设计一个登录页面", dependsOn: [] },
  ],
  layers: [["agent_1", "agent_2", "agent_3"]]  // 并行
}

输入: "先让 @产品经理 分析需求，再让 @设计师 设计方案"
输出: TaskDecomposition {
  subtasks: [
    { agentId: "agent_1", agentName: "产品经理", instruction: "分析需求", dependsOn: [] },
    { agentId: "agent_2", agentName: "设计师", instruction: "设计方案", dependsOn: ["subtask_msg1_agent_1"] },
  ],
  layers: [["agent_1"], ["agent_2"]]  // 串行
}
```

**关键函数**：

| 函数 | 说明 |
|------|------|
| `extractMentions(content)` | 正则提取 @提及，去重保序 |
| `resolveMentions(mentions, agents)` | 名称 → Agent 记录（大小写不敏感） |
| `assignInstructions(content, agents)` | 按 @提及位置分割消息指令片段 |
| `decomposeMessage(params)` | 入口函数：完整拆解流程 |
| `detectExecutionOrder(content, agents)` | 检测"先/再/然后"等顺序词 |

**顺序词检测**：如果消息包含"先/再/然后/接着/之后/first/then/next/after that"，则判定为串行模式，否则所有 Agent 并行。

### 3. `task-graph.ts` — DAG 构建引擎

**职责**：根据 `dependsOn` 构建有向无环图，拓扑排序生成分层执行计划。

**算法（Kahn's algorithm）**：

```
输入: subtasks with dependsOn
  T1: []       → 入度 0
  T2: ["T1"]   → 入度 1
  T3: ["T1"]   → 入度 1
  T4: ["T2","T3"] → 入度 2

Step 1: 入度 0 → [T1]    → Layer 0: [T1]
Step 2: T1 完成后，T2、T3 入度归零 → [T2, T3] → Layer 1: [T2, T3]
Step 3: T2、T3 完成后，T4 入度归零 → [T4] → Layer 2: [T4]

结果: layers = [["T1"], ["T2","T3"], ["T4"]]
```

**功能**：
- `buildDAG(subtasks)` — 构建邻接表
- `detectCycle(subtasks)` — DFS 检测循环依赖，返回首个环或 null
- `topSort(subtasks)` — Kahn 算法拓扑排序，抛出 `CycleDetectedError`
- `buildLayers(subtasks)` — topSort 的别名

### 4. `executor.ts` — 单 Agent 执行器

**职责**：包装 AgentAdapter，执行单个子任务，处理重试，推送 SSE。

```
execute(subtask, agent, onChunk)
    │
    ├── attempt 0:
    │     ├── createAdapter(agent.provider)
    │     ├── buildContext(subtask) → AgentContext
    │     ├── adapter.execute(context)
    │     │     └── for await (chunk) → onChunk(chunk)
    │     │           ├── Text/Code/ToolCall → agent:<id>:chunk
    │     │           ├── Artifact → agent:<id>:artifact_status
    │     │           ├── Done → agent:<id>:done
    │     │           └── Error → agent:<id>:error
    │     └── success → return SubTaskResult
    │
    ├── attempt 1 (如果 attempt 0 失败):
    │     ├── adapter.abort()
    │     ├── createAdapter(agent.provider)  ← 重新创建
    │     └── ... 重试执行
    │
    └── 最终失败 → return { success: false, error }
```

**重试策略**：最多执行 2 次（初始 + 1 次自动重试），重试前 abort 旧 adapter 并重新创建。

### 5. `dispatcher.ts` — 任务调度引擎

**职责**：编排器核心，协调整个编排流程。

**执行流程**：

```
dispatchAll(decomposition, agents, pushSSE)
    │
    ├── 1. 推 decomposition SSE 事件
    │     └── orchestrator:decomposition { subtasks[], layers[] }
    │
    ├── 2. 对每层 (按 layers 顺序):
    │     ├── 推 task-status: running (每个子任务)
    │     ├── Promise.allSettled(本层所有子任务)
    │     │     ├── fulfilled → 推 task-status: completed
    │     │     └── rejected → 推 task-status: failed
    │     └── injectResultsToNextLayer()  ← 将本层结果注入下层
    │
    ├── 3. markSkippedTasks()  ← 标记依赖失败的为 skipped
    │
    └── 4. aggregate()  ← 汇总: total/completed/failed/skipped
```

**结果注入**：串行模式下，上游 Agent 的输出自动追加到下游任务的 `context` 中，作为 `assistant` 角色的历史消息，让下游 Agent 能感知上游结果。

### 6. `aggregator.ts` — 结果聚合器

**职责**：将编排结果持久化到数据库并推送 SSE 完成事件。

```
persist(aggregatedResult, conversationId, parentMessageId, pushSSE)
    │
    ├── 1. createMessage()  ← 写入系统消息
    │     senderType: "System", type: "Text"
    │     content: "AgentA completed; AgentB failed..."
    │
    ├── 2. createArtifact()  ← 写入详细结果
    │     type: "Document"
    │     content: JSON.stringify({ summary, details, stats })
    │     status: "Completed" | "Failed"
    │
    └── 3. pushSSE("orchestrator:aggregated", { summary, stats })
```

---

## SSE 事件协议

编排器定义了 3 种新 SSE 事件类型，供前端实时渲染任务执行流程：

| 事件 | 时机 | 关键数据 |
|------|------|----------|
| `orchestrator:decomposition` | 任务拆解完成 | `subtasks[]`（id/agentId/agentName/instruction/dependsOn）、`layers[][]` |
| `orchestrator:task-status` | 每个子任务状态变更 | `subtaskId`、`status`（running/completed/failed）、`layer`、`error?` |
| `orchestrator:aggregated` | 全部完成 | `summary`、`totalTasks`、`completedTasks`、`failedTasks`、`skippedTasks` |

此外，每个 Agent 的流式输出通过独立 SSE 事件推送：

| 事件 | 说明 |
|------|------|
| `agent:{agentId}:chunk` | Agent 输出片段（Text/Code/ToolCall） |
| `agent:{agentId}:done` | Agent 执行完成 |
| `agent:{agentId}:error` | Agent 执行错误 |
| `agent:{agentId}:artifact_status` | Agent 产物状态变更 |

---

## 完整执行流程（端到端）

```
用户发送群聊消息 @AgentA @AgentB @AgentC
    │
    ▼
POST /api/conversations/:id/messages/create  (handleCreate)
    │
    ├── 1. 创建用户消息 → 写入 DB
    ├── 2. WebSocket broadcast notification
    │
    ├── if (conv.type === "Group" && @mentions >= 2):
    │     │
    │     ▼  后台异步执行
    │   runOrchestration()
    │     │
    │     ├── 1. getConversation() + listContacts()
    │     │      → 获取群聊所有 Agent 记录
    │     │
    │     ├── 2. decomposeMessage(content, agents)
    │     │      → TaskDecomposition { subtasks, layers }
    │     │      → SSE: orchestrator:decomposition
    │     │
    │     ├── 3. dispatcher.dispatchAll(decomposition, agents, pushSSE)
    │     │     │
    │     │     ├── Layer 0: [AgentA, AgentB]    ← 并行
    │     │     │     ├── SSE: orchestrator:task-status (running)
    │     │     │     ├── SSE: agent:AgentA:chunk (流式输出)
    │     │     │     ├── SSE: agent:AgentB:chunk (流式输出)
    │     │     │     ├── SSE: orchestrator:task-status (completed)
    │     │     │     └── 注入 AgentA/B 结果到下层 context
    │     │     │
    │     │     ├── Layer 1: [AgentC]            ← 串行（依赖上轮）
    │     │     │     ├── SSE: orchestrator:task-status (running)
    │     │     │     ├── SSE: agent:AgentC:chunk (流式输出)
    │     │     │     └── SSE: orchestrator:task-status (completed)
    │     │     │
    │     │     └── markSkippedTasks() + aggregate()
    │     │           → AggregatedResult { total, completed, failed, skipped }
    │     │
    │     ├── 4. aggregator.persist(result, convId, msgId, pushSSE)
    │     │     ├── createMessage()  ← 写入摘要到 DB
    │     │     ├── createArtifact() ← 写入详情到 DB
    │     │     └── SSE: orchestrator:aggregated { summary, stats }
    │     │
    │     └── 完成
    │
    └── else (单聊或单 Agent):
          → 走原有消息处理逻辑（不触发编排器）
```

---

## 触发条件

| 条件 | 行为 |
|------|------|
| 群聊 `+ @2 个以上 Agent` | ✅ 触发编排器 |
| 群聊 `+ @0-1 个 Agent` | ❌ 不触发，走原有逻辑 |
| 单人会话 | ❌ 不触发，走原有逻辑 |
| 普通消息无提及 | ❌ 不触发 |

---

## 前端渲染建议

基于 SSE 事件协议，前端可以实现如下任务流程面板：

```
┌──────────────────────────────────────────────────┐
│  📋 任务拆解: 3 个子任务                             │
│                                                    │
│  第 0 层 (并行):                                    │
│  ✅ AgentA: 分析需求                                │
│  ✅ AgentB: 竞品调研                                │
│                                                    │
│  第 1 层 (等待上下游):                               │
│  ⏳ AgentC: 设计方案                                │
│      └── 🎨 正在输出...                             │
│                                                    │
│  [████████░░] 2/3 任务完成                          │
└──────────────────────────────────────────────────┘
```

---

## 文件清单

```
apps/server/src/orchestrator/
├── index.ts                  # 统一导出入口
├── types.ts                  # SubTask、TaskDecomposition 等核心类型
├── intent-analyzer.ts        # @提及解析 + 顺序词检测 → 任务拆解
├── task-graph.ts             # DAG 构建 + 拓扑排序 (Kahn) + 循环检测
├── executor.ts               # AgentAdapter 包装 + 重试 + SSE 推流
├── dispatcher.ts             # 按层调度引擎 (并行层内 + 串行层间)
├── aggregator.ts             # 结果聚合 + DB 持久化 + SSE 完成事件
└── __tests__/
    ├── intent-analyzer.test.ts   # 13 tests
    ├── task-graph.test.ts        # 15 tests
    ├── dispatcher.test.ts        # 8 tests
    └── aggregator.test.ts        # 4 tests

修改的文件:
apps/server/src/realtime/types.ts           # +SSE orchestrator 事件类型
apps/server/src/routes/messages.ts          # +群聊消息检测 + 编排器触发
apps/server/vitest.config.ts                 # +orchestrator 测试路径
```

---

## 测试覆盖

| 测试组 | 数量 | 覆盖场景 |
|--------|------|----------|
| intent-analyzer | 13 | @提及提取、名称解析、消息拆解、单/多 Agent、顺序词 |
| task-graph | 15 | DAG 构建、空图、单节点、线性链、并行 DAG、菱形依赖、循环检测 |
| dispatcher | 8 | 空分解、SSE 事件推送、结果注入、跳过机制、聚合统计 |
| aggregator | 4 | 全成功、部分失败、SSE 事件、空结果 |

**总计 40 个单元测试**，全部通过。
