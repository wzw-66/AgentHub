## Why

当前群聊中的 multi-agent 协作存在三个核心问题：
1. **规则引擎局限**：@mention 匹配和意图分析靠正则 + 关键词，无法理解自然语言，导致路由不准、@逻辑僵硬
2. **群聊 agent 无法回复**：orchestrator 发出的 SSE 事件名前缀与前端监听不匹配，同时 workspace 路径未传给 executor，导致 agent 输出前端收不到、工作目录缺失
3. **群成员范围错误**：orchestrator 使用 `listContacts(ownerId)` 获取用户全部联系人而非仅群成员，匹配策略不一致

引入 LLM 智能网关 (Orchestrator_llm) 来解决，将规则引擎升级为 LLM 驱动的意图分析，同时修复上述 Bug，使群聊成为真正的 Multi-Agent 协作系统。

## What Changes

- **LLM 意图分析**：新增 `LLMIntentAnalyzer`，用 DeepSeek API 替代规则引擎，直接将用户消息 + 群成员信息交给 LLM，输出任务分配和执行顺序。@mention 无需正则提取，LLM 自主理解指代
- **SSE 事件名统一**：orchestrator 的 SSE 事件从 `agent:${id}:chunk` / `agent:${id}:done` 改为 `chunk` / `done`，与单聊路径一致，agentId 放在 data 中
- **Executor 传 cwd**：orchestrator 的 `SubTaskExecutor` 从 `conversation.workspacePath` 读取工作目录传给 adapter，与单聊保持一致
- **群成员过滤修复**：orchestrator 改为使用 `conversation.contactIds` 精确获取群成员，而非 `listContacts(ownerId)`
- **触发条件放宽**：群聊中任意 @ 或 LLM 自动识别均触发 orchestrator，不再要求 2+ mentions
- **去除冗余**：移除 `messages.ts` 和 `intent-analyzer.ts` 中重复的 `extractMentions` / `resolveMentions` 函数
- **拓扑排序保留**：DAG 调度模式保留，LLM 输出 `order` 字段控制串/并行，`buildLayers` 将依赖关系转为执行层级

## Capabilities

### New Capabilities
- `llm-intent-analyzer`: LLM 驱动的意图分析和任务分配，将用户消息分解为多 Agent 子任务，支持串行/并行执行顺序
- `multi-agent-execution`: Multi-Agent 执行引擎，包含 DAG 调度、SSE 推送、结果聚合、工作目录管理

### Modified Capabilities
<!-- No existing specs need requirement changes -->

## Impact

- **apps/server**:
  - `src/config/env.ts` — 新增 LLM 配置项 (`LLM_BASE_URL`, `LLM_MODEL`, `API_KEY`)
  - `src/orchestrator/intent-analyzer.ts` — 替换为 LLM 驱动实现
  - `src/orchestrator/executor.ts` — 新增 workspace 路径传递
  - `src/orchestrator/dispatcher.ts` — SSE 事件名统一
  - `src/routes/messages.ts` — 修复群成员过滤、触发条件、SSE 推送
- **packages/agent-core** — 无需改动
- **apps/web** — 无需改动（前端 SSE 监听 `chunk`/`done` 保持不变）
- **.env** — 读取已有 `LLM_BASE_URL`, `LLM_MODEL`, `API_KEY`
