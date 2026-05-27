## Context

Orchestrator 是 AgentHub 多 Agent 协作的核心能力。当前系统已具备：
- `@agenthub/agent-core`：AgentAdapter 接口及 Claude/OpenCode/Custom 三种适配器实现
- `apps/server/src/realtime/`：ConnectionManager 管理 SSE 和 WebSocket 连接
- `@agenthub/db`：Conversation、Message、Agent 等 CRUD 操作
- 群聊会话和 @提及的基础数据结构

但缺少一个"大脑"来协调多 Agent 协作——当前每条消息只能由一个 Agent 响应，用户需要手动转发消息到不同 Agent。

本设计的核心挑战是如何让编排器本身对用户透明可见，让用户能看到"任务如何被拆解、谁在做什么、进度如何"。

## Goals / Non-Goals

**Goals:**
- 实现消息意图分析，将群聊消息拆解为多个子任务
- 实现 DAG 驱动的任务调度引擎（并行层 + 串行依赖链）
- 每个子任务拥有独立 SSE 流实时推送 Agent 输出
- 失败处理：自动重试一次，失败不阻塞其他并行任务
- 结果聚合：所有子任务完成后汇总并写入数据库
- 新增编排器 SSE 事件协议，让前端能实时展示编排流程

**Non-Goals:**
- 不引入独立部署的编排器服务（作为 server 模块而非独立进程）
- 不做 LLM 驱动的意图分析（Phase 1 用规则引擎，基于 @提及解析）
- 不处理跨会话编排（每个编排实例仅限单条消息）
- 不做调度算法的高级优化（Phase 1 用简单拓扑排序 + 按层调度）

## Decisions

### Decision 1: 编排器作为 `apps/server` 内部模块，非独立包

**Chosen**: 作为 `apps/server/src/orchestrator/` 模块

**Alternatives considered:**
- 独立 `packages/orchestrator` 包 — 解耦更好，但需要将 ConnectionManager 抽象为接口或回调，增加不必要的间接层
- 内嵌在 routes/messages 中 — 过于耦合，难以测试

**Why**: 编排器需要紧密集成 ConnectionManager（SSE 推流）和数据库 repositories。作为 server 内部模块，可直接调用这些依赖而不需要额外抽象接口。未来若需要独立部署，可将 orchestrator 的依赖抽象为接口后再提取。

### Decision 2: SSE 事件协议分两类——编排器事件和 Agent 输出事件

**Chosen**: 两套独立的事件命名空间

- `orchestrator:*` 事件：描述编排器自身状态（任务拆解、任务状态变更、聚合完成）
- `agent:*:chunk` 事件：描述 Agent 的具体输出内容

**Why**: 职责分离。编排器事件给前端用来渲染任务流程面板，Agent 事件给前端用来渲染消息列表。前端可以独立订阅和处理这两类事件。

### Decision 3: 意图分析 Phase 1 用规则引擎

**Chosen**: 基于 @提及的规则解析

**How it works:**
- 解析消息中的 `@AgentName` 模式，匹配到数据库中的 Agent 记录
- 按提及顺序和消息段落，将内容片段分配给对应 Agent
- 如果消息包含"先...再..."或"然后"等顺序词，自动建立依赖关系
- 否则所有提及的 Agent 视为并行任务

**Why**: 零外部依赖、可预测、低延迟。Phase 2 可升级为 LLM 驱动意图分析，此时编排器的事件协议不变，只需替换 intent-analyzer 的实现。

### Decision 4: 调度引擎采用"按层调度"模式

**Chosen**: 拓扑排序生成 `layers: string[][]`，每层并行执行，跨层串行

```
例子：
  T1 → T2 → T4
  T3 → T4

layers = [["T1","T3"], ["T2"], ["T4"]]
        └──── 第0层 ────  ── 第1层 ─  ── 第2层 ─
            全部并行         T2等T1       T4等T1/T2/T3
```

**Why**: 两层循环（外层串行遍历 layers，内层并行执行 layer 内任务）即可实现完整调度，实现简单，且 layers 结构可直达前端用于进度渲染。

### Decision 5: 失败处理用"重试一次 + 跳过"策略

**Chosen**: 每个子任务最多执行 2 次（初始 + 1 次重试），仍失败则标记 `failed` 并继续

**依赖方行为**：
- 如果下游任务的关键前置依赖失败 → 下游标记 `skipped`
- 如果下游任务可接受部分结果（如"有数据就用，没有也继续"）→ 下游正常执行，上游输出为空

**Why**: 简单可预测。不需要复杂的退避策略或补偿事务。

## Risks / Trade-offs

- [规则引擎的意图分析精度有限] → Phase 1 明确告知用户规则范围（基于 @提及），Phase 2 升级为 LLM 驱动。事件协议不变，替换实现即可。
- [大量 Agent 并行可能耗尽连接资源] → Phase 1 不设限。后续可加 `MAX_CONCURRENCY` 配置，超出的任务排队等待。
- [SSE 事件过多导致前端卡顿] → `orchestrator:*` 事件轻量（仅状态变更），`agent:*:chunk` 事件是 Agent 流式输出的正常体量。如果出现问题可对 chunk 事件做节流。
- [重试可能导致消息重复] → 每个子任务有唯一 `id`，前端通过 `subtaskId` 去重。数据库写入时用幂等设计。
- [编排器单点故障] → 编排器是 server 进程内的同步调度，如果进程崩溃，当前编排不保留状态。Phase 2 可引入持久化编排状态机。
