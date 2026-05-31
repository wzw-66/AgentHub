## Context

当前 `orchestrator/intent-analyzer.ts` 使用规则引擎（正则提取 @mention + 关键词检测串/并行）进行意图分析和任务分解。这种方式存在天生局限：无法理解自然语言的模糊指代，@ 匹配策略前后端不一致，且需要两套重复的提取逻辑。

同时，orchestrator 的 SSE 推送使用 `agent:${id}:chunk` 等带前缀的事件名，而前端 `useSSEStream` 只监听 `chunk`/`done`，导致群聊 agent 输出前端无法接收。`SubTaskExecutor` 也未向 adapter 传递 `cwd`，造成 workspace 缺失。

本次设计将规则引擎替换为 LLM 智能网关（调用 DeepSeek API），统一 SSE 事件协议，修复 workspace 传递和群成员过滤。

## Goals / Non-Goals

**Goals:**
- 用 LLM 替代规则引擎进行意图分析和任务分配，支持自然语言理解
- 修复 SSE 事件名不匹配问题，群聊 agent 输出前端可接收
- Executor 传递 workspace 路径给 adapter
- 群聊触发条件从 2+ mentions 改为 LLM 自主判断
- 群成员过滤使用 `conversation.contactIds`
- 保留 DAG 调度模式

**Non-Goals:**
- 不引入 Agent 间直接通信（不搞 Agent- Agent 对话循环）
- 不改动前端 SSE 监听逻辑
- 不改动单聊执行流程
- 不替换 `packages/agent-core` 层的 adapter 实现

## Decisions

### 1. LLM 调用方式：HTTP fetch（复用 CustomAgentAdapter 模式）

| 方案 | 结果 |
|------|------|
| 新建独立 HTTP 调用 | 采用 |
| 复用 `CustomAgentAdapter` | 否决——adapter 是为执行任务设计的，含 stream、abort、healthCheck，对 intent 分析太重 |

直接在 `intent-analyzer.ts` 中用 `fetch` 调用 DeepSeek API（OpenAI 兼容格式），非流式请求，解析 JSON 输出。

### 2. LLM 请求配置：从 .env 读取

```typescript
// config/env.ts 新增
llm: {
  apiKey: env["API_KEY"],
  baseUrl: env["LLM_BASE_URL"],    // https://api.deepseek.com
  model: env["LLM_MODEL"],          // deepseek-v4-flash
}
```

DeepSeek 是 OpenAI 兼容 API，endpoint 为 `{baseUrl}/v1/chat/completions`。

### 3. LLM 输出格式：JSON structured output

LLM 输出固定格式的 JSON，直接映射为 `TaskDecomposition`：

```typescript
interface LLMIntentResult {
  intent: string;                           // 意图简述
  assignedAgents: Array<{
    agentId: string;
    instruction: string;                     // 该 agent 的具体任务
  }>;
  order: "parallel" | "serial";
  summary?: string;                          // 聚合摘要模板
}
```

使用 `response_format: { type: "json_object" }` 约束 LLM 输出合法 JSON。

### 4. Prompt 设计：Three-part 结构

```
System:
  你是 AgentHub 的意图分析引擎。群里有以下 Agent：
  {agent list with name, id, systemPrompt}

  分析用户消息，返回 JSON：
  {
    "intent": "...",
    "assignedAgents": [{ agentId, instruction }],
    "order": "parallel | serial",
    "summary": "..."
  }

  规则：
  - 如果用户 @了某个 agent，@指代必须由你理解，消息中不保证有 @
  - 选择需要参与任务的 agent，排除无关的
  - instruction 要具体，描述该 agent 负责什么
  - order: 有先后依赖关系用 serial，否则 parallel
  - summary: 执行完毕后的聚合摘要
```

### 5. SSE 事件名统一

| 当前 (orchestrator) | 改为 |
|---------------------|------|
| `agent:${id}:chunk` | `chunk` (data 中含 agentId) |
| `agent:${id}:done` | `done` (data 中含 agentId) |
| `agent:${id}:artifact_status` | `artifact_status` |
| `agent:${id}:error` | `error` |
| `orchestrator:decomposition` | 保留 |
| `orchestrator:task-status` | 保留 |
| `orchestrator:aggregated` | 保留 |

与 `messages.ts` 中 `pushChunk()` 函数的格式保持一致。

### 6. workspace 传递

`SubTaskExecutor.createAdapterForAgent()` 增加 `cwd` 参数，从 `SubTask.conversationId` 查询 `conversation.workspacePath`：

```typescript
const conv = await getConversation(subtask.conversationId);
const cwd = conv?.workspacePath
  ? resolve(WORKSPACE_ROOT, conv.workspacePath)
  : undefined;
```

与单聊 `runAgentExecution()` 的逻辑一致。

### 7. 群成员过滤

`runOrchestration` 改为：

```typescript
const conv = await getConversation(conversationId);
const contactIds = conv?.contactIds ?? [];
const agents = await Promise.all(
  contactIds.map(id => getContact(id))
);
```

而非当前的 `listContacts(ownerId)` + `.includes()` 模糊匹配。

### 8. DAG 调度保留

拓扑排序和分层执行（`buildLayers`/`topSort`）保留不变。LLM 输出的 `order` 决定 subtask 间的 `dependsOn` 关系，`buildLayers` 将其转换为执行层级。

## Risks / Trade-offs

- **[LLM 调用延迟]** LLM 意图分析增加一次 API 调用，约几百 ms 到数秒 → 采用非流式短 prompt，模型使用 `deepseek-v4-flash`，响应应 < 1s
- **[LLM JSON 解析失败]** LLM 可能输出非标准 JSON → 设置 `response_format: { type: "json_object" }`，并增加 try/catch fallback 到规则引擎（保留现有 `decomposeMessage` 作为降级）
- **[API Key 泄露]** `.env` 中的 API_KEY 在代码中传递 → 仅服务器端使用，不暴露给前端
- **[Conversation 不存在]** workspacePath 读取时 conversation 可能已被删除 → 增加空值检查
