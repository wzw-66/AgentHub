# AgentHarness 架构设计

AgentHarness 是 AI Agent 的**执行引擎**，负责管理 Agent 的整个生命周期 —— 从上下文准备、工具调用循环、中间件管道，到流式输出和异常处理。

## 一、架构概览

### 核心定位

AgentHarness 位于 `packages/agent-core/src/harness/`，是对 `AgentAdapter` 的增强封装：

```
                     ┌──────────────────────────────────────┐
                     │           apps/server                 │
                     │  routes/messages.ts                   │
                     │    runAgentExecution()                │
                     └──────────┬───────────────────────────┘
                                │  create + execute
                                ▼
            ┌──────────────────────────────────────────────────┐
            │              AgentHarness                          │
            │                                                    │
            │  ┌──────────────┐   ┌─────────────────────────┐   │
            │  │ Middleware    │   │  Tool Registry           │   │
            │  │ Pipeline      │──▶│  - execute_command       │   │
            │  │  - Blackboard │   │  - read_file             │   │
            │  │  - MicroCompact│  │  - write_file            │   │
            │  │  - AutoCompact │  │  - list_dir              │   │
            │  │  - Memory     │   │  - str_replace           │   │
            │  │  - LoopDetect │   └──────────┬──────────────┘   │
            │  │  - Subagent   │              │                   │
            │  │  - Sandbox    │              ▼                   │
            │  │  - Clarify    │      ┌──────────────┐           │
            │  │  - ViewImage  │      │   Sandbox    │           │
            │  │  - Title      │      │  (本地/远程)  │           │
            │  └──────┬───────┘      └──────────────┘           │
            │         ▼                                         │
            │  ┌────────────────────────────────────┐           │
            │  │      AgentAdapter (Claude/OpenCode)  │           │
            │  └────────────────────────────────────┘           │
            └──────────────────────────────────────────────────┘
                                │
                      AsyncIterable<Chunk>
                                ▼
                     ┌──────────────────────┐
                     │   SSE → Web UI       │
                     │   实时流式渲染         │
                     └──────────────────────┘
```

### 架构层次

| 层 | 组件 | 职责 |
|----|------|------|
| **执行循环** | AgentHarness | 多轮 agentic loop，工具调用编排 |
| **中间件管道** | MiddlewarePipeline | 注入式生命周期钩子 |
| **工具注册** | ToolRegistry | 工具注册、查找、沙箱绑定 |
| **执行者** | AgentAdapter | LLM 适配（Claude/OpenCode/Custom） |
| **沙箱** | Sandbox | 文件/命令的安全执行环境 |

---

## 二、核心执行循环

AgentHarness 的核心理念是 **agentic tool-use loop** —— 多轮问答，直到 Agent 不再调用工具。

### 执行流程

```
execute(context)
    │
    ▼
┌──────────────────────────────────────────┐
│  Turn 1                                   │
│  ┌─────────────┐                          │
│  │ beforeAgent  │  ← Middleware 准备上下文  │
│  │ 中间件管道    │                          │
│  └──────┬──────┘                          │
│         ▼                                 │
│  ┌─────────────┐                          │
│  │ adapter     │  ← AgentAdapter.execute()  │
│  │ execute()   │     实时 yield Text/Code   │
│  └──────┬──────┘                          │
│         ▼                                 │
│  ┌─────────────┐                          │
│  │ afterAgent   │  ← Middleware 后处理      │
│  └──────┬──────┘                          │
│         ▼                                 │
│  有 ToolCall?                              │
│    ├── 否 → yield Done → 结束              │
│    └── 是 → 注册工具处理 ──┐               │
│                            ▼               │
│  ┌──────────────────┐                      │
│  │ 处理每个 ToolCall  │ ← ToolRegistry      │
│  │ 写入 toolMessages │    或自定义 Handler   │
│  └────────┬─────────┘                      │
│           ▼                                 │
│  注入 toolMessages → 进入 Turn 2 ──────────►│
└──────────────────────────────────────────────┘
```

### 关键设计

1. **流式透传**：Text、Code、Error 类型的 Chunk 在产生时立即 `yield`，前端可实时显示（打字机效果）
2. **工具调用拦截**：ToolCall 类型的 Chunk 被拦截，不直达前端，而是处理后注入下一轮
3. **工具调用可见性**：ToolCall Chunk 在相同 Turn 的文本输出完成后 yield，用户可看到 Agent 在调用什么工具
4. **轮次上限**：默认最大 25 轮，超限后注入提示并停止

```typescript
// 核心循环伪代码
async function* execute(context) {
  for (let turn = 0; turn < maxTurns; turn++) {
    context = await pipeline.runBeforeAgent(context);
    for await (const chunk of adapter.execute(context)) {
      if (chunk.type === Text | Code | Error) yield chunk;  // 实时流式
      if (chunk.type === ToolCall) collect(chunk);           // 收集工具调用
      if (chunk.type === Done) break;                         // 本轮结束
    }
    await pipeline.runAfterAgent(context, turnChunks);

    if (noToolCalls) { yield Done; break; }

    const toolMessages = await processToolCalls(toolCalls);
    context = { ...context, toolMessages: [...existing, ...toolMessages] };
  }
}
```

---

## 三、中间件管道

### 架构

中间件采用**管道模式（Pipeline）**，按注册顺序依次执行。每个中间件实现 `AgentMiddleware` 接口的三个可选生命周期钩子：

```
                注册顺序
   Middleware A ──→ Middleware B ──→ Middleware C
        │                │                │
        ▼                ▼                ▼
   beforeAgent() → beforeAgent() → beforeAgent()  ← 依次执行，context 链式传递
                     Turn 执行
   afterAgent() ← afterAgent() ← afterAgent()    ← 后处理（反向顺序）
```

### AgentMiddleware 接口

```typescript
interface AgentMiddleware {
  name?: string;   // 唯一标识，支持按名替换/移除

  beforeAgent(context: AgentContext):
    AgentContext | Promise<AgentContext>;   // 可修改 context

  afterAgent(context: AgentContext, chunks: Chunk[]):
    void | Promise<void>;                   // 可读取本轮产出

  onError(error: Error):
    void | Promise<void>;                   // 错误处理
}
```

### MiddlewarePipeline 功能

| 方法 | 用途 |
|------|------|
| `use(mw)` | 注册中间件，同名自动替换 |
| `remove(name)` | 按名移除 |
| `list()` | 列出已注册中间件 |
| `runBeforeAgent(ctx)` | 链式执行所有 beforeAgent |
| `runAfterAgent(ctx, chunks)` | 链式执行所有 afterAgent |
| `runOnError(err)` | 执行所有 onError |
| `getSharedState()` | 获取中间件间共享状态 |

### 内置中间件

#### 1. BlackboardMiddleware

跨轮次、跨中间件共享状态的黑板：

```
Turn 1:  Blackboard.set("language", "TypeScript")
                │
                ▼
    beforeAgent: 注入到 system prompt ↓
    [Blackboard State]
    language: "TypeScript"

Turn 2:  Blackboard.get("language") → "TypeScript"
```

**适用场景：** 跟踪对话状态、计数器、用户偏好等需要在多轮间共享的信息。

#### 2. MicroCompactMiddleware（第 1 层压缩）

每轮执行前对上一轮的工具结果进行"零成本压缩"：

```
原始工具结果：
[Tool: read_file]
Input: {"path": "src/index.ts"}
Output: import { ... }  // 2000 字的文件内容

压缩后：
[Previous: used read_file → import { ... }... (2000 chars)]
```

**设计特性：**
- **场景感知压缩**：根据对话场景（code_writing / debugging / tech_consult / learning / general）自动调整策略
- **工具特定策略**：支持三种压缩策略 —— `always`（始终压缩）、`cautious`（大文件且旧时才压缩）、`never`（跳过）
- **错误保护**：调试场景下保留错误输出不压缩
- **保留最近 N 条**：确保模型能看到最近的工具执行细节

```typescript
// 场景感知策略示例
const sceneStrategies = {
  code_writing: { keepRecent: 5, preserveTools: ["read_file"], preserveErrors: false },
  debugging:    { keepRecent: 8, preserveTools: ["read_file", "bash"], preserveErrors: true },
  tech_consult: { keepRecent: 3, preserveTools: [], preserveErrors: false },
};
```

**设计原理：** Agent 不需要完整的工具输出来知道"刚才做了什么"，一个简短的摘要足以维持上下文连贯性。每轮无条件执行，消除累积的冗余 token。

#### 3. AutoCompactMiddleware（第 2 层压缩）

当上下文总量超过阈值时，触发 LLM 摘要压缩：

```
Token 总量 < 50K → 不操作
Token 总量 > 50K → 触发 summarization → 历史压缩为摘要

[Previous conversation summary: 用户讨论了 React 18 的并发特性...
  然后请求实现一个自定义 hook 用于 debounce...]
```

**工作流程：**
1. 保存完整转录到线程目录（JSONL 格式，保留审计线索）
2. 调用 LLM 生成结构化摘要（已完成 / 当前状态 / 关键决策 / 继续上下文）
3. 替换消息历史为摘要 + 最近 N 条消息
4. LLM 失败时回退到简单截断

**与 MicroCompact 的区别：** MicroCompact 是每轮的轻量替换，AutoCompact 是超限时的重量级压缩。两者互补，共同构成分层压缩策略。

#### 4. CompactToolMiddleware（第 3 层压缩）

允许模型在觉得上下文过长时主动触发压缩：

```typescript
// 模型可调用的 compact 工具
tool compact(
  focus: "API design decisions" | "bug fixes" | "file structure" | "",
  priority: "aggressive" | "balanced" | "conservative"
): string
```

| 策略 | 保留消息数 | 保留工具 | 适用场景 |
|------|-----------|---------|---------|
| `aggressive` | 3 | 无 | 全新任务，彻底刷新上下文 |
| `balanced` | 10 | `read_file` | 默认推荐 |
| `conservative` | 20 | `read_file`, `bash` | 调试场景 |

#### 5. SandboxMiddleware

沙箱环境的懒加载管理：

```
beforeAgent:
  with lazy_init=false → 立即获取沙箱 ID（acquire）
  with lazy_init=true  → 首次工具调用时自动获取

关键设计：
- 同一线程内复用沙箱，避免重复创建销毁
- 惰性初始化（lazy_init=true）为默认，优化非工具密集型场景
- 沙箱在应用关闭时统一清理（SandboxProvider.shutdown()）
```

#### 6. MemoryMiddleware

桥接 MemoryStore 与 AgentHarness 生命周期：

```
beforeAgent: 从当前消息提取关键词 → 查询 MemoryStore
             → 将相关事实注入 system prompt
             → 混合检索：关键词 50% + 类别 30% + 衰减 20%

afterAgent: 从 Agent 输出中提取潜在事实
            → 过滤：只保留用户输入 + 最终助手回复（跳过工具调用）
            → 写入 MemoryUpdateQueue（带 debounce，默认 30s）
            → MemoryUpdater 异步调用 LLM 提取结构化事实
```

#### 7. LoopDetectionMiddleware

检测并打破重复的工具调用循环：

```typescript
// 配置参数
const config = {
  warnThreshold: 3,   // 重复 3 次 → 注入警告
  hardLimit: 5,       // 重复 5 次 → 强制停止
  windowSize: 20,     // 滑动窗口大小
};
```

**工作原理：**
1. 对每轮的工具调用（name + args）进行 MD5 哈希
2. 维护 per-thread 滑动窗口哈希历史
3. 重复次数超过 `warnThreshold` → 注入系统消息警告
4. 重复次数超过 `hardLimit` → 剥离 tool_calls，强制模型输出文本
5. 支持中英文自动检测

#### 8. SubagentLimitMiddleware

限制单轮中子代理工具调用的并发数量：

```typescript
// 限制每轮最多 3 个子代理并发执行
const MAX_CONCURRENT_SUBAGENTS = 3;
```

#### 9. ViewImageMiddleware

为多模态模型注入 Base64 编码的图像数据：

```
afterAgent: 检测消息中引用的图片路径
            → 读取图片文件 → Base64 编码
            → 注入到 system prompt 或消息中
```

#### 10. DanglingToolCallMiddleware

修复中断的工具调用：

```
beforeAgent: 检测上一轮是否有未完成的工具调用
            → 注入合成的 ToolMessage 标记（无需重试）
            → 避免模型重复调用已中断的工具
```

#### 11. ClarificationMiddleware

拦截 `ask_clarification` 工具调用，始终最后执行：

```
优先级：ClarificationMiddleware 注册在管道末尾
拦截条件：检测到模型输出 ask_clarification 工具调用
处理方式：回复给用户等待澄清，不进入工具执行循环
```

#### 12. TitleMiddleware

首次对话交换后自动生成线程标题：

```
afterAgent: 检测是否为第一轮对话
            → 使用 LLM 生成本轮简短短语作为标题
            → 异步保存到数据库
```

#### 13. ThreadDataMiddleware

线程工作目录的惰性路径计算：

```
beforeAgent: 计算线程路径（仅计算，不创建目录）
            → 将路径注入 ThreadState
            → 供文件工具和沙箱使用
```

#### 14. UploadsMiddleware

将上传的文件注入到最后一条用户消息中：

```
beforeAgent: 检测用户是否上传了新文件
            → 将文件路径/内容附加到最后一条 HumanMessage
            → 使模型可感知新上传的上下文
```

### 中间件注册顺序

完整的中间件注册顺序（共 14 层）：

| 顺序 | 中间件 | 职责 |
|------|--------|------|
| 1 | ThreadDataMiddleware | 线程路径惰性计算 |
| 2 | UploadsMiddleware | 上传文件注入 |
| 3 | SandboxMiddleware | 沙箱懒获取 |
| 4 | DanglingToolCallMiddleware | 修复中断工具调用 |
| 5 | MicroCompactMiddleware | 第 1 层压缩（每轮静默） |
| 6 | AutoCompactMiddleware | 第 2 层压缩（阈值摘要） |
| 7 | CompactToolMiddleware | 第 3 层压缩（模型发起） |
| 8 | TodoListMiddleware | 计划模式（可选） |
| 9 | TitleMiddleware | 自动生成标题 |
| 10 | MemoryMiddleware | 记忆提取与注入 |
| 11 | ViewImageMiddleware | 图像 Base64 注入 |
| 12 | SubagentLimitMiddleware | 子代理并发限制 |
| 13 | LoopDetectionMiddleware | 循环检测与打断 |
| 14 | ClarificationMiddleware | 询问澄清拦截（始终最后） |

---

## 四、三层压缩体系

AgentHarness 实现渐进式三层上下文压缩，在不同粒度上协同工作：

```
上下文总量增长
     │
     ├── 每轮自动压缩 ──────────────────→ MicroCompact  (第 1 层)
     │    替换旧工具结果为简短占位符       零成本，全覆盖
     │
     ├── 超限时 LLM 摘要 ───────────────→ AutoCompact   (第 2 层)
     │    保存完整转录 + 结构化摘要       50K token 阈值触发
     │
     └── 模型主动请求压缩 ──────────────→ CompactTool   (第 3 层)
          三种优先级策略                  模型感知到上下文过长时调用
```

| 特性 | MicroCompact | AutoCompact | CompactTool |
|------|-------------|-------------|-------------|
| 触发方式 | 自动，每轮 | 自动，Token > 50K | 模型主动调用 |
| 压缩粒度 | 单个 ToolMessage | 完整对话历史 | 可配置策略 |
| 信息损失 | 低（保留工具调用轨迹） | 高（汇总为目标摘要） | 中（取决于策略） |
| 典型压缩率 | 30-60% | 70-90% | 50-80% |
| 执行位置 | 模型调用前 | 模型调用前 | 模型调用中 |

---

## 五、子代理编排

### 架构

AgentHarness 支持通过 `task` 工具将子任务委托给子代理执行：

```
主 Agent ──→ task 工具调用
                │
                ▼
         ┌──────────────────┐
         │ SubagentExecutor  │
         │                   │
         │  ┌─────────────┐  │
         │  │ 调度器线程池  │  │  ← ThreadPoolExecutor(3 workers)
         │  │ (scheduler)  │  │
         │  └──────┬──────┘  │
         │         ▼         │
         │  ┌─────────────┐  │
         │  │ 执行器线程池  │  │  ← ThreadPoolExecutor(3 workers)
         │  │ (executor)   │  │
         │  └─────────────┘  │
         └──────────────────┘
                │
                ▼
         ┌──────────────────┐
         │  SubAgent 实例    │
         │  - 隔离上下文      │
         │  - 共享父级沙箱 ID │
         │  - 最小中间件      │
         │  - 可配超时(15min) │
         └──────────────────┘
```

### 关键设计

| 设计 | 说明 |
|------|------|
| **双线程池** | 调度器池（3 workers）+ 执行器池（3 workers），避免调度阻塞执行 |
| **超时控制** | 默认 900 秒（15 分钟），超时自动标记为 TIMED_OUT |
| **工具过滤** | 根据子代理配置（allowlist/denylist）自动过滤可用工具 |
| **模型继承** | 子代理可以 `inherit` 父级模型名 |
| **沙箱共享** | 子代理复用父级沙箱 ID，避免重复创建 |
| **实时流式** | 通过 `agent.stream()` 实时捕获 AI 消息，支持进度推送 |
| **事件通知** | 事件类型：task_started, task_running, task_completed, task_failed, task_timed_out |

### SubagentResult

```typescript
interface SubagentResult {
  taskId: string;          // 唯一任务标识
  traceId: string;         // 分布式追踪 ID（链接父代理和子代理日志）
  status: SubagentStatus;  // pending | running | completed | failed | timed_out
  result: string | null;   // 最终结果
  error: string | null;    // 错误信息
  startedAt: Date;
  completedAt: Date;
  aiMessages: object[];    // 执行过程中生成的全部 AI 消息
}
```

### 内置子代理

| 名称 | 可用工具 | 适用场景 |
|------|---------|---------|
| `general-purpose` | 全部工具（除 task, ask_clarification, present_files） | 通用编码任务 |
| `bash` | 仅 bash, ls, read_file, write_file, str_replace | 纯命令行操作 |

---

## 六、事件系统

AgentHarness 在执行过程中发出生命周期事件，供外部监听：

```typescript
interface HarnessEvent {
  type: "before_turn" | "after_turn" | "tool_start" | "tool_end" | "done" | "error"
      | "subagent_start" | "subagent_end" | "compact";
  turn: number;
  data?: unknown;
}
```

| 事件 | 时机 | data 内容 |
|------|------|-----------|
| `before_turn` | 每轮开始前 | `{ turn }` |
| `after_turn` | 每轮结束后 | `{ turn, toolCallCount }` |
| `tool_start` | 工具调用开始 | `{ toolName, args }` |
| `tool_end` | 工具调用完成 | `{ toolName, result }` |
| `subagent_start` | 子代理开始执行 | `{ taskId, config }` |
| `subagent_end` | 子代理执行完成 | `{ taskId, status, result }` |
| `compact` | 压缩触发 | `{ layer, beforeTokens, afterTokens }` |
| `done` | 全部执行完成 | `{ totalTurns }` |
| `error` | 执行出错 | Error 对象 |

**用途：** 监控、日志、前端进度指示（如"Agent 正在调用工具..."）。

---

## 七、Server 集成

### 接线方式

在 `apps/server/src/routes/messages.ts` 中，`runAgentExecution()` 的接线方式：

```typescript
// 1. 创建 Adapter
const adapter = createAdapter(agent.provider, { apiKey, model });

// 2. 创建 Harness（包装 Adapter）
const harness = new AgentHarness(adapter, { maxTurns: 25 });

// 3. 配置 Sandbox + 工具
const sandbox = new LocalSandbox(workspacePath);
const toolRegistry = new ToolRegistry(sandbox);
harness.setToolRegistry(toolRegistry);
harness.setSandbox(sandbox);

// 4. 注册中间件（按顺序）
harness.use(new ThreadDataMiddleware());
harness.use(new SandboxMiddleware());
harness.use(new MicroCompactMiddleware());
harness.use(new AutoCompactMiddleware());
harness.use(new MemoryMiddleware());
harness.use(new LoopDetectionMiddleware());
harness.use(new ClarificationMiddleware());

// 5. 注册事件监听
harness.on("compact", (event) => {
  logger.info(`Compact: ${event.layer}, saved ${event.savedTokens} tokens`);
});
harness.on("subagent_start", (event) => {
  sseConnections[userId].write({ type: "subagent_start", taskId: event.taskId });
});

// 6. 执行并实时流式输出
for await (const chunk of harness.execute(context)) {
  // 经由 SSE 推送到前端
  sseConnections[userId].write(chunk);
}
```

### 运行模式

| 模式 | Harness 使用 | 说明 |
|------|-------------|------|
| **单 Agent 执行** | `runAgentExecution()` | 直接创建 Harness，执行 Agent |
| **多 Agent 编排** | `runOrchestration()` | Orchestrator 为每个子任务分别创建 Harness |

---

## 八、模块文件结构

```
packages/agent-core/src/harness/
├── agent-harness.ts              # 主类，执行循环
├── types.ts                      # 公开类型定义
├── middleware/
│   ├── types.ts                  # AgentMiddleware 接口
│   ├── pipeline.ts               # MiddlewarePipeline
│   ├── blackboard.ts             # BlackboardMiddleware
│   ├── sandbox-middleware.ts     # SandboxMiddleware（沙箱懒获取）
│   ├── thread-data-middleware.ts # ThreadDataMiddleware（路径计算）
│   ├── title-middleware.ts       # TitleMiddleware（标题生成）
│   ├── uploads-middleware.ts     # UploadsMiddleware（文件注入）
│   ├── dangling-tool-call.ts     # DanglingToolCallMiddleware（中断修复）
│   ├── view-image-middleware.ts  # ViewImageMiddleware（图片注入）
│   └── subagent-limit.ts         # SubagentLimitMiddleware（并发控制）
├── tools/
│   ├── types.ts                  # Tool / ToolHandlerFn
│   └── registry.ts               # ToolRegistry + 内置工具
├── sandbox/
│   ├── types.ts                  # Sandbox / SandboxProvider 接口
│   ├── local-sandbox.ts          # LocalSandbox 实现
│   └── sandbox-provider.ts       # SandboxManager
├── memory/
│   ├── types.ts                  # MemoryFact / MemoryConfig
│   ├── store.ts                  # MemoryStore（艾宾浩斯衰减）
│   ├── retrieval.ts              # 混合检索（关键词+类别+衰减）
│   └── memory-middleware.ts      # MemoryMiddleware
├── compression/
│   ├── micro-compact.ts          # MicroCompactMiddleware（第 1 层）
│   ├── auto-compact.ts           # AutoCompactMiddleware（第 2 层）
│   └── compact-tool.ts           # CompactToolMiddleware（第 3 层）
├── subagents/
│   ├── config.ts                 # SubagentConfig
│   ├── executor.ts               # SubagentExecutor（线程池管理）
│   └── registry.ts               # Subagent 注册与查找
└── detection/
    └── loop-detection.ts         # LoopDetectionMiddleware
```

---

## 九、架构决策记录

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| **工具调用模型** | ReAct vs Function Calling | Agentic loop（多轮 ToolCall） | 与 Claude/OpenCode 原生 tool-use 一致 |
| **流式方式** | 全部收集再返回 vs 即时 yield | 即时 yield Text/Code，收集 ToolCall | 前端打字机效果 + 工具调用不中断 UI |
| **中间件执行顺序** | before 正向，after 反向 vs 全部正向 | 全部正向 | 简化心智模型，顺序清晰 |
| **工具注册** | 统一注册 vs 分散 Handler | 双通道（自定义 Handler + Registry） | 灵活：核心工具用 Registry，业务逻辑用 Handler |
| **上下文压缩** | 仅 LLM 压缩 vs 层级压缩 | 三层渐进式（Micro + Auto + Tool） | 零成本压缩全覆盖，重量压缩兜底，模型主动可触发 |
| **子代理模型** | 同步阻塞 vs 异步线程池 | 双线程池 + 超时控制 | 并发执行 + 隔离性 + 可取消 |
| **循环检测** | 简单计数 vs 滑动窗口哈希 | 滑动窗口 MD5 哈希检测 | 精确识别重复模式，避免误判 |
| **沙箱生命周期** | 每次创建 vs 按需复用 | SandboxMiddleware 惰性获取 + 复用 | 减少开销，适配不同执行场景 |
| **记忆检索** | 仅关键词 vs 混合检索 | 关键词 50% + 类别 30% + 衰减 20% | 多维度评分，更精准的事实检索 |
