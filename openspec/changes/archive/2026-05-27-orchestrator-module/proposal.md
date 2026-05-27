## Why

AgentHub 的模块化拆解方案中将 Orchestrator 定义为第 8 模块，但目前仅有 spec 层面的需求描述，缺少可执行的设计方案和实现计划。Orchestrator 是整个平台的核心差异化能力——没有它，群聊中的多 Agent 协作只能靠用户手动转发消息。需要将这条最关键的"大脑"链路落地实现。

## What Changes

- 在 `apps/server` 中新增 `orchestrator/` 模块，实现多 Agent 任务编排
- 实现消息意图分析：将用户群聊消息拆解为针对不同 Agent 的子任务
- 实现任务 DAG 构建：根据子任务依赖关系生成可并行/串行执行的分层计划
- 实现并行调度引擎：同时向多个 Agent 分发独立子任务，每个 Agent 有独立 SSE 流
- 实现串行调度引擎：按依赖链顺序执行，下游任务可消费上游结果
- 实现失败处理机制：重试一次后跳过，失败不阻塞其他并行任务
- 实现结果聚合：所有任务完成后汇总各 Agent 输出，写入数据库
- 新增编排器 SSE 事件协议（`orchestrator:decomposition`、`orchestrator:task-status`、`orchestrator:aggregated`），让前端实时展示任务执行流程
- 修改已有消息路由：群聊消息含 `@` 提及且为 Group 类型时触发 Orchestrator

## Capabilities

### New Capabilities

- `orchestrator`: 多 Agent 任务编排器，包括消息意图分析、DAG 任务调度、并行/串行分发、失败重试、结果聚合

### Modified Capabilities

- `api-server`: 群聊消息发送路由需增加对 Orchestrator 的触发调用
- `real-time-communication`: SSE 事件协议需扩展 `orchestrator:*` 事件类型

## Impact

- 新增模块：`apps/server/src/orchestrator/`（约 6-8 个文件）
- 修改文件：`apps/server/src/realtime/types.ts`（新增 SSE 编排器事件类型）
- 修改文件：`apps/server/src/routes/messages.ts`（群聊消息触发编排器）
- 对外依赖：无新增依赖，复用 `@agenthub/agent-core`、`@agenthub/db`、`@agenthub/shared`
- 测试：新增 4 个测试文件覆盖意图分析、DAG 构建、调度、聚合四个核心模块
