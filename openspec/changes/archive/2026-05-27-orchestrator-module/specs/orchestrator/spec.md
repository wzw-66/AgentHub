## ADDED Requirements

### Requirement: 消息意图分析
编排器 SHALL 分析群聊消息，将其拆解为针对不同 Agent 的独立子任务。

#### Scenario: 单 Agent 提及不触发编排
- **WHEN** 用户在群聊中发送一条消息，仅提及一个 Agent
- **THEN** 编排器 SHOULD NOT 介入，消息由该 Agent 直接处理

#### Scenario: 多 Agent 提及触发任务拆解
- **WHEN** 用户在群聊中发送一条消息，提及两个或更多 Agent
- **THEN** 编排器 SHALL 基于 @提及将消息内容拆解为对应数量的子任务

#### Scenario: 无 @提及不触发编排
- **WHEN** 用户在群聊中发送一条消息，未提及任何 Agent
- **THEN** 编排器 SHOULD NOT 介入，消息作为普通消息处理

#### Scenario: 顺序词触发依赖关系
- **WHEN** 消息中包含"先...再..."、"然后"、"接着"等顺序连接词
- **THEN** 编排器 SHALL 为涉及的子任务建立串行依赖关系

### Requirement: 任务 DAG 构建
编排器 SHALL 将子任务组织为有向无环图（DAG），支持拓扑排序和分层。

#### Scenario: 无依赖任务在同一层
- **WHEN** 两个或多个子任务之间没有依赖关系
- **THEN** 编排器 SHALL 将它们分配到同一层级，允许并行执行

#### Scenario: 依赖任务在不同层
- **WHEN** 子任务 B 依赖于子任务 A 的输出
- **THEN** 编排器 SHALL 将 A 分配到前一层，B 分配到后一层

#### Scenario: 循环依赖检测
- **WHEN** 子任务之间存在循环依赖
- **THEN** 编排器 SHALL 抛出明确错误并中止当前编排

### Requirement: 并行任务分发
编排器 SHALL 将同一层内的独立子任务并行分发给多个 Agent。

#### Scenario: 独立任务并行执行
- **WHEN** 两个或多个子任务位于同一层
- **THEN** 编排器 SHALL 通过 Promise.allSettled 同时启动所有任务

#### Scenario: 每个 Agent 拥有独立 SSE 通道
- **WHEN** 并行执行多个 Agent
- **THEN** 编排器 SHALL 为每个 Agent 使用独立的 SSE 事件频道（`agent:<id>:chunk`）

#### Scenario: 单个 Agent 失败不阻塞其他并行任务
- **WHEN** 同一层中某个 Agent 执行失败
- **THEN** 其他并行 Agent SHALL 不受影响继续执行

### Requirement: 串行任务分发
编排器 SHALL 按依赖链顺序执行跨层子任务。

#### Scenario: 依赖任务串行执行
- **WHEN** 子任务 B 依赖于子任务 A 的输出
- **THEN** 编排器 SHALL 等待 A 完成后再启动 B

#### Scenario: 依赖结果传递
- **WHEN** 子任务 B 依赖于子任务 A
- **THEN** 编排器 SHALL 将 A 的输出内容注入到 B 的 AgentContext.history 中

#### Scenario: 多层复杂依赖
- **WHEN** 存在三层或以上的依赖链（A → B → C）
- **THEN** 编排器 SHALL 按层顺序依次执行，前一层全部完成后再启动下一层

### Requirement: 失败处理
编排器 SHALL 优雅地处理 Agent 执行失败。

#### Scenario: Agent 失败触发自动重试
- **WHEN** Agent 执行期间抛出异常
- **THEN** 编排器 SHALL 在标记任务为失败前自动重试一次

#### Scenario: 重试成功恢复正常流程
- **WHEN** Agent 重试后成功完成
- **THEN** 编排器 SHALL 将该任务标记为 completed，下游任务正常执行

#### Scenario: 最终失败不阻塞其他并行任务
- **WHEN** 一个 Agent 经过重试后仍然失败
- **THEN** 同一层其他已成功的 Agent 不受影响

#### Scenario: 前置失败导致下游跳过
- **WHEN** 某个子任务最终失败，且下游任务依赖它的输出
- **THEN** 编排器 SHALL 将下游任务标记为 skipped

### Requirement: 结果聚合
编排器 SHALL 在全部子任务完成后生成聚合结果。

#### Scenario: 全部成功生成完整摘要
- **WHEN** 所有子任务成功完成
- **THEN** 编排器 SHALL 生成一条聚合消息写入数据库，包含各 Agent 输出摘要

#### Scenario: 部分失败生成部分摘要
- **WHEN** 部分子任务失败、部分成功
- **THEN** 编排器 SHALL 生成聚合消息，包含成功的 Agent 输出和失败的 Agent 错误信息

#### Scenario: 聚合结果包含进度统计
- **WHEN** 聚合结果生成
- **THEN** SHALL 包含总任务数、成功数、失败数、跳过数的统计

### Requirement: 编排器 SSE 事件推送
编排器 SHALL 通过 SSE 事件向前端推送编排过程状态。

#### Scenario: 任务拆解完成后推送分解事件
- **WHEN** 编排器完成消息意图分析和任务拆解
- **THEN** SHALL 推送 `orchestrator:decomposition` 事件，包含所有子任务信息和分层结构

#### Scenario: 任务状态变更时推送状态事件
- **WHEN** 任意子任务状态变更为 running/completed/failed
- **THEN** SHALL 推送 `orchestrator:task-status` 事件，包含 subtaskId、状态、Agent 名称、层级

#### Scenario: 聚合完成后推送汇总事件
- **WHEN** 所有子任务完成，聚合结果生成
- **THEN** SHALL 推送 `orchestrator:aggregated` 事件，包含进度统计和摘要
