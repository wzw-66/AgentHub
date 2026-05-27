## 1. 编排器基础类型定义

- [x] 1.1 在 `apps/server/src/orchestrator/types.ts` 中定义 `SubTask`、`SubTaskStatus`、`TaskDecomposition`、`SubTaskResult`、`AggregatedResult` 接口
- [x] 1.2 在 `apps/server/src/realtime/types.ts` 中新增 `SSEOrchestratorEvent` 联合类型，包含 `orchestrator:decomposition`、`orchestrator:task-status`、`orchestrator:aggregated` 三种事件
- [x] 1.3 创建 `apps/server/src/orchestrator/index.ts`，统一导出所有模块

## 2. 消息意图分析器

- [x] 2.1 实现 `apps/server/src/orchestrator/intent-analyzer.ts`，基于 @提及解析将消息拆解为子任务
- [x] 2.2 实现顺序词检测（"先...再..."、"然后"、"接着"），自动建立串行依赖关系
- [x] 2.3 实现 `decomposeMessage()` 函数，输入消息内容和提及的 Agent 列表，输出 `TaskDecomposition`
- [x] 2.4 编写 `apps/server/src/orchestrator/__tests__/intent-analyzer.test.ts`，覆盖单 Agent/多 Agent/无提及/顺序词场景

## 3. 任务 DAG 构建引擎

- [x] 3.1 实现 `apps/server/src/orchestrator/task-graph.ts`，根据 `dependsOn` 构建 DAG
- [x] 3.2 实现拓扑排序算法，输出分层结构 `layers: string[][]`
- [x] 3.3 实现循环依赖检测，检测到循环时抛出明确错误
- [x] 3.4 编写 `apps/server/src/orchestrator/__tests__/task-graph.test.ts`，覆盖空图、单节点、线性链、并行 DAG、复杂菱形依赖、循环依赖

## 4. 单 Agent 执行器

- [x] 4.1 实现 `apps/server/src/orchestrator/executor.ts`，包装 AgentAdapter 执行单个子任务
- [x] 4.2 实现 `executeWithRetry()` 方法，失败时自动重试一次
- [x] 4.3 通过 ConnectionManager.pushToConversation() 将 Agent 输出的 Chunk 实时推为 `agent:<id>:chunk` SSE 事件
- [x] 4.4 子任务完成/失败时推送 `agent:<id>:done` / `agent:<id>:error` SSE 事件

## 5. 任务调度引擎

- [x] 5.1 实现 `apps/server/src/orchestrator/dispatcher.ts`，支持 `dispatchAll()` 入口方法整合全流程
- [x] 5.2 实现 `dispatchLayer()` 方法，使用 Promise.allSettled 并行执行同一层所有子任务
- [x] 5.3 实现层间串行调度，前一层全部完成后启动下一层，前置结果注入下游 context
- [x] 5.4 在调度过程中推送编排器状态事件：`orchestrator:decomposition`（任务拆解完成后）、`orchestrator:task-status`（每个任务状态变更时）
- [x] 5.5 编写 `apps/server/src/orchestrator/__tests__/dispatcher.test.ts`，覆盖空任务列表、全部成功、部分失败、全部失败、依赖链传递场景

## 6. 结果聚合器

- [x] 6.1 实现 `apps/server/src/orchestrator/aggregator.ts`，收集所有子任务结果生成聚合摘要
- [x] 6.2 实现 `aggregate()` 方法，将聚合结果作为消息写入数据库（使用 `@agenthub/db` 的 createMessage）
- [x] 6.3 推送 `orchestrator:aggregated` SSE 事件，包含总任务数、成功数、失败数、跳过数统计
- [x] 6.4 编写 `apps/server/src/orchestrator/__tests__/aggregator.test.ts`，覆盖全部成功、部分失败、空结果场景

## 7. 集成到消息路由

- [x] 7.1 在 `apps/server/src/routes/messages.ts` 中新增群聊消息检测：`type === "Group"` 且 `@提及 >= 2 个`
- [x] 7.2 满足条件时调用 Orchestrator 的编排流程，而非直接创建普通消息
- [x] 7.3 不满足条件时走原有消息处理逻辑（兼容单 Agent 和单人会话）
- [x] 7.4 编写集成测试覆盖群聊触发编排和单聊不触发编排两种路径

## 8. 验证

- [x] 8.1 执行 `pnpm --filter @agenthub/server test` 确认所有单元测试和集成测试通过（128 tests, 15 files all passed）
- [x] 8.2 执行 `pnpm lint` 确认无新增类型错误（仅剩 10 个预存错误）
