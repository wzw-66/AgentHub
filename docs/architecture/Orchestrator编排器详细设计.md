# Orchestrator 编排器详细设计文档

编排器（Orchestrator）位于 [apps/server/src/orchestrator](file:///d:/code/github/AgentHub/apps/server/src/orchestrator)，是 AgentHub 处理多智能体协作的核心引擎。它负责将用户的复杂指令拆解、分发、执行并汇总。

## 目录结构与功能说明

| 文件                                                                                                  | 功能描述                                                                                                                                                            |
| :---------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [types.ts](file:///d:/code/github/AgentHub/apps/server/src/orchestrator/types.ts)                     | **类型定义中心**。定义了 `SubTask`（子任务）、`TaskDecomposition`（任务拆解方案）和 `AggregatedResult`（汇总结果）等核心数据结构，以及用于实时通信的 SSE 事件类型。 |
| [intent-analyzer.ts](file:///d:/code/github/AgentHub/apps/server/src/orchestrator/intent-analyzer.ts) | **意图分析与拆解器**。通过正则表达式提取消息中的 `@提及`，识别“先、再、然后”等顺序词，将原始消息拆解为带有依赖关系的子任务列表。                                    |
| [task-graph.ts](file:///d:/code/github/AgentHub/apps/server/src/orchestrator/task-graph.ts)           | **任务图管理器**。构建任务间的有向无环图（DAG），负责检测循环依赖（防止死循环）并进行拓扑排序，将任务划分为可以并行执行的“层”。                                     |
| [executor.ts](file:///d:/code/github/AgentHub/apps/server/src/orchestrator/executor.ts)               | **子任务执行器**。负责单个子任务的具体落地。它会根据智能体配置创建适配器，构建上下文，并处理流式输出和失败重试逻辑。                                                |
| [dispatcher.ts](file:///d:/code/github/AgentHub/apps/server/src/orchestrator/dispatcher.ts)           | **任务调度引擎**。按照 `task-graph` 计算出的层级顺序，逐层执行任务。它负责层内的并行调度、层间的顺序等待，并实时推送任务状态给前端。                                |
| [aggregator.ts](file:///d:/code/github/AgentHub/apps/server/src/orchestrator/aggregator.ts)           | **结果汇总器**。在所有任务完成后，负责生成总结性消息，并将各智能体的详细产物（Artifact）持久化到数据库中，最后发送汇总完成的通知。                                  |
| [index.ts](file:///d:/code/github/AgentHub/apps/server/src/orchestrator/index.ts)                     | **模块公共入口**。统一导出上述功能模块，供 [routes/messages.ts](file:///d:/code/github/AgentHub/apps/server/src/routes/messages.ts) 调用。                          |

## 核心执行流程

1.  **拆解 (Decompose)**: `intent-analyzer` 扫描用户输入，识别出 `@Claude` 和 `@OpenCode`，并发现用户说了“先...再...”，从而创建两个有依赖关系的 `SubTask`。
2.  **建图 (Graph)**: `task-graph` 验证这些任务没有互相依赖形成死循环，并计算出：任务 1 在第 0 层，任务 2 在第 1 层。
3.  **调度 (Dispatch)**: `dispatcher` 启动。
    - 它先通知前端：“任务已拆解完成”。
    - 执行第 0 层任务：调用 `executor` 让 Claude 开始工作。
    - 收到 Claude 结果后，再执行第 1 层任务：让 OpenCode 开始审计。
4.  **汇总 (Aggregate)**: `aggregator` 接手，将 Claude 的代码和 OpenCode 的审计意见合并成一条系统消息，并生成一个包含详细信息的 **Artifact** 存储起来。

## 设计优势

- **高并发**：同一层级的任务（互不依赖）会自动并行执行，极大缩短响应时间。
- **容错性**：`executor` 内置了重试机制，单个任务失败不会轻易导致整个编排流程崩溃。
- **实时透明**：全流程通过 SSE 推送状态，用户可以清晰地看到“大脑”思考和分工的过程。
