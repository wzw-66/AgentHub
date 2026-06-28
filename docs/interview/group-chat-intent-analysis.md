# 群聊意图分析：规则引擎 vs LLM 引擎

> 来源：`docs/architecture/group-chat.md` 架构文档 + `apps/server/src/orchestrator/intent-analyzer.ts` 代码分析

## 整体定位

意图分析（Intent Analyzer）是 Orchestrator 的第一个模块，负责理解用户消息、拆解任务：

```
用户输入
   │
   ▼
┌─────────────┐   分析意图，拆解任务
│ Intent      │   ├─ LLM 引擎（主）：DeepSeek API，JSON 结构化输出
│ Analyzer    │   └─ 规则引擎（降级）：所有 Agent 并行分配
└─────┬───────┘
      │
      ▼
    后续：Task Graph → Dispatcher → Executor → Aggregator
```

---

## 一、LLM 引擎

### 工作原理

调用 DeepSeek API（兼容 OpenAI 接口格式），通过 `response_format: { type: "json_object" }` 强制输出 JSON。

```typescript
// 构造的 Prompt：
// 1. 列出当前会话中所有 Agent（ID + Name + Role）
// 2. 要求分析用户消息，输出谁做什么、串行还是并行
// 3. 规则：@mention 匹配 Agent ID；闲聊返回空数组；指令用中文
```

### 返回格式：LLMIntentResult

```typescript
interface LLMIntentResult {
  intent: string;                              // 意图描述
  assignedAgents: Array<{
    agentId: string;                           // Agent ID（必须匹配列表中的 exact ID）
    instruction: string;                       // 给该 Agent 的具体指令（中文）
  }>;
  order: "parallel" | "serial";               // 全局执行顺序
  summary: string;                             // 执行计划摘要
}
```

**实际例子**（来自测试代码）：

用户输入 `"@设计师 @前端开发 帮我设计一个登录页面"`

```json
{
  "intent": "开发一个登录页面",
  "assignedAgents": [
    { "agentId": "agent_2", "instruction": "设计登录页面UI" },
    { "agentId": "agent_3", "instruction": "实现登录页面" }
  ],
  "order": "serial",
  "summary": "设计师先设计，前端再实现"
}
```

**防御性解析**：代码兼容 `agentName` vs `agentId`、`executionOrder` vs `order` 等字段变体，过滤掉空的 entry。

**边缘情况**：
- LLM 返回空 `assignedAgents`（如用户说"大家好"）→ 返回 `null`，不触发编排
- LLM 返回不存在的 agentId → 跳过该分配
- LLM 重复返回同一个 Agent（@mention + 内容推断各一次）→ 去重

---

## 二、规则引擎（降级路径）

### 架构文档 vs 实际代码

架构文档描述的规则引擎是一个**理想化的阶段 1 设计**：

| 架构文档描述 | 实际代码实现 |
|---|---|
| 正则提取 @mention | 不做任何提取 |
| 关键词检测"同时"/"分别"判断串/并行 | **不检测关键词，永远 parallel** |
| 2+ mentions 触发群聊 | 所有 Agent 全分配 |
| 前后端两套提取逻辑 | **服务端统一**，只在后端处理 |

实际只有一行逻辑——**"LLM 挂了，所有 Agent 都上，原话当指令"**：

```typescript
private fallbackResult(content: string, agents: Agent[]): LLMIntentResult {
  return {
    intent: "fallback",
    assignedAgents: agents.map((a) => ({
      agentId: a.id,
      instruction: content,      // ← 原样复制用户消息，不做任何解析
    })),
    order: "parallel",           // ← 永远 parallel
    summary: "",
  };
}
```

### 触发条件

- **无 API Key** 配置（env 为空）
- **LLM API 超时**（默认 15s）
- **LLM 返回异常**（parse 失败、网络错误）
- **超出重试次数**（默认 1 次重试）

本质是保证系统在任何情况下都能正确分解意图，只是 LLM 保精确，规则引擎保可用。

---

## 三、从 LLM 输出到可执行的 SubTask

### assignedAgents 和 SubTask 的区别

一个高频疑惑：**已经有了 `assignedAgents`，为什么还要创建 `SubTask`？**

它们是**不同生命周期阶段的对象**：

| | `assignedAgents`（LLM 产出） | `SubTask`（编排器工作单元） |
|---|---|---|
| **阶段** | 意图分析完成 | 进入任务图/调度/执行 |
| **职责** | LLM 说"谁干什么" | 编排器说"怎么跟踪和执行" |
| **包含** | agentId + instruction | 执行元数据 + 运行时状态 |

`assignedAgents` 到 `SubTask` 的转化在 `decomposeMessage` 函数中完成：

```
LLMIntentResult            TaskDecomposition
┌────────────────┐        ┌─────────────────────────────┐
│ assignedAgents │ ──→    │ subtasks: SubTask[]          │
│  [{agentId,    │        │  ├─ id (生成: subtask_{msgId}_{agentId})
│    instruction}]│        │  ├─ parentMessageId ← 锚定用户消息
│                │        │  ├─ conversationId  ← 锚定会话
│                │        │  ├─ agentId, agentName
│ order          │ ──→    │  ├─ instruction
│                │        │  ├─ dependsOn ← 根据 order 构建依赖链
│                │        │  ├─ context ← 注入会话历史
│                │        │  ├─ status: "pending"
│                │        │  └─ retryCount: 0
│                │        │
│                │        │ layers: string[][] ← buildLayers()
│                │        │  ├─ parallel → [["A","B"]] (单层全部并行)
│                │        │  └─ serial   → [["A"],["B"]] (每层一个)
└────────────────┘        └─────────────────────────────┘
```

### parentMessageId 和 conversationId 如何锚定

这两个值**不是 LLM 产生的**，是调用方在触发编排时传进去的：

```
用户发消息 → POST /messages/create
                │
                ├─ 1. createMessage(content) → 写入 DB → 拿到 messageId
                │
                ├─ 2. 触发编排器 startOrchestration(conversationId, messageId)
                │
                ├─ 3. 调用 decomposeMessage({
                │        content,
                │        agents,                    ← 从 contactIds 查群成员
                │        conversationId,             ← 从路由上下文拿
                │        parentMessageId: messageId, ← ← 第 1 步写入 DB 的 ID
                │        history: [],
                │    })
                │
                └─ 4. decomposeMessage 直接抄进每个 SubTask

SubTask 执行完成后，回调保存结果时也用这两个值回写：
  createMessage({
    conversationId,             // ← 写回同一个会话
    parentId: parentMessageId,  // ← 挂在用户消息下方（消息树）
    ...
  })
```

**锚定的本质就是"抄进去"**——消息入库时就有了 DB ID，编排器拿着这个 ID 赋值给每个 SubTask，无论流转到哪一步都能原路定位。

---

## 四、关于并串行混合执行

### 当前现状

LLM 的 `order` 只有 `"serial"` 或 `"parallel"`，导致：

```
serial   → layers: [["A"], ["B"], ["C"]]    ← 每层一个，浪费并行
parallel → layers: [["A","B","C"]]           ← 所有 Agent 同时跑
```

串行模式产生的是**一条直链**——`subtask[i].dependsOn = [subtask[i-1].id]`，没有分支。

### 底层 DAG 引擎的能力

底层拓扑排序（Kahn 算法）**完全支持混合模式**。`buildLayers` 依赖 `dependsOn` 数组，每个 subtask 可以依赖任意数量的前置任务：

```
依赖关系：C 依赖 A 和 B
         A、B 无依赖

A ──┐
    ├──→ C      → layers: [["A","B"], ["C"]]
B ──┘

这才是真正的 DAG 混合模式：Layer 0 并行，Layer 1 串行等
```

**瓶颈不在基础设施，在 LLM Prompt**。当前 Prompt 只问了 "serial or parallel"，如果改成让 LLM 输出每个 subtask 自己的 `dependsOn`：

```json
{
  "assignedAgents": [
    { "agentId": "A", "instruction": "查 Git 历史", "dependsOn": [] },
    { "agentId": "B", "instruction": "检查 CI 状态", "dependsOn": [] },
    { "agentId": "C", "instruction": "写周报", "dependsOn": ["A", "B"] }
  ]
}
```

就能产生真正的 DAG 混合分层——这是明确的改进方向。

---

## 五、总结

| 维度 | LLM 引擎（主） | 规则引擎（降级） |
|------|---------------|-----------------|
| **触发** | 有 API Key、正常调用 | 无 Key / 超时 / 异常 |
| **本质** | DeepSeek 自然语言 → JSON | 所有 Agent + 原话 + parallel |
| **输出** | `LLMIntentResult`（意图明确） | `LLMIntentResult`（intent = "fallback"） |
| **精确度** | 高，能理解隐含意图 | 低，无脑全分配 |
| **延迟** | ~1-3s（API 调用） | 零延迟（纯内存） |
| **最终产出** | `TaskDecomposition`（SubTask[] + layers） | 同 |

**设计原则：LLM 保精确，规则引擎保鲁棒——两者皆有而非二选一，且底层 DAG 引擎留有向混合模式扩展的空间。**
