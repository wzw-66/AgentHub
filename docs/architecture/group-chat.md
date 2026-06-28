# 群聊对话架构设计

## 一、架构概览

AgentHub 群聊系统采用 **Orchestrator 驱动的多 Agent 协作架构**。用户以 IM 群聊的方式与多个 AI Agent 交互，系统负责意图理解、任务分解、调度执行和结果聚合。

### 核心架构图

```
                        ┌─────────────────────────────────────┐
                        │           apps/server               │
                        │  ┌──────────────────────────────┐   │
  ┌──────────┐          │  │        Orchestrator           │   │
  │  web     │  REST/SSE│  │  ┌──────┐ ┌──────┐ ┌──────┐  │   │ ┌──────────────┐
  │ (Next.js)│◄────────┼──┤  │Intent│→│Task  │→│Exec. │  │   │ │  agent-core  │
  └──────────┘    WS    │  │  │Analy.│ │Graph │ │utor  │  │───┼►│  (适配器层)   │
                         │  │  └──────┘ └──────┘ └──────┘  │   │ └──────┬───────┘
                         │  │         └──────┬──────┘       │   │        │
                         │  │          Aggregator           │   │  ┌─────┴─────┐
                         │  └──────────────────────────────┘   │  │ Claude    │
                         │           ┌──────────┐             │  │ OpenCode  │
                         │           │   DB     │             │  │ Custom LLM│
                         │           │(Prisma+PG)│             │  └───────────┘
                         └───────────┴──────────┘             └──────────────┘
```

### 架构层次

| 层 | 组件 | 职责 |
|----|------|------|
| **接入层** | Next.js Web App | 群聊 UI、多流渲染、SSE 消费 |
| **API 层** | Fastify REST + SSE/WS | 消息收发、实时推送、连接管理 |
| **编排层** | Orchestrator 模块 | 意图分析、任务图、调度、聚合 |
| **适配层** | agent-core | 统一 Agent 调用接口 |
| **存储层** | PostgreSQL + Prisma | 会话/消息/联系人持久化 |

---

## 二、数据模型架构

### 核心实体关系

群聊场景涉及的核心实体及关系：

```
User (平台用户)
  │
  ├── owns → Conversation (会话)
  │             ├── type: "single" | "group"  ← 区分单聊/群聊
  │             ├── contactIds[]              ← 参与者列表
  │             ├── isPinned / isArchived     ← 对话管理
  │             │
  │             └── contains → Message (消息)
  │                 ├── senderType / senderId ← 发送者身份
  │                 ├── parentId              ← 引用关系（自关联）
  │                 ├── isPinned              ← 重要消息标记
  │                 └── content               ← 含内联 Artifact 标记
  │
  └── links → Contact (联系人)
                └── references → Agent (Agent 定义)
                     └── contactType: "Agent" ← Agent = Contact
```

### 架构设计决策

| 决策 | 选型 | 理由 |
|------|------|------|
| **Agent = Contact** | 无独立 Agent 表 | Agent 就是联系人，统一联系人管理模型 |
| **群成员存储** | `contactIds[]` PostgreSQL 原生数组 | 避免多对多关联表，查询效率高 |
| **消息引用** | `parentId` 自关联 | 简单直接，支持嵌套引用 |
| **内联 Artifact** | `content` 中嵌入标记 | 无需独立表，SSE 和 DB 一致，刷新不丢失 |

---

## 三、编排器架构

### 模块职责

编排器是群聊的大脑，由 5 个模块组成管道：

```
用户输入
   │
   ▼
┌─────────────┐   分析意图，拆解任务
│ Intent      │   ├─ 规则引擎：正则提取 @mention + 关键词
│ Analyzer    │   └─ LLM 引擎：DeepSeek API，JSON 结构化输出
└─────┬───────┘
      │
      ▼
┌─────────────┐   构建 DAG，检测循环依赖
│ Task Graph  │   拓扑排序 → 分层（同一层可并行）
└─────┬───────┘
      │
      ▼
┌─────────────┐   按 agentId 将子任务路由到对应 Adapter
│ Dispatcher  │   单 Agent 失败不影响其他
└─────┬───────┘
      │
      ▼
┌─────────────┐   按层执行，每层 Promise.all 并行
│ Executor    │   串行依赖通过层间顺序保证
└─────┬───────┘
      │
      ▼
┌─────────────┐   合并多 Agent 输出为连贯回复
│ Aggregator  │   通过 SSE 推送汇总结果
└─────────────┘
```

### 任务调度模型

群聊的任务调度遵循 **DAG（有向无环图）** 模型：

- **节点** = 子任务（分配给单个 Agent 的一项具体工作）
- **边** = 依赖关系（任务 B 依赖任务 A 先完成）
- **分层** = 拓扑排序后，同一层的任务互不依赖，可并行执行

```
示例：用户说 "查一下 Git 历史，然后帮我写一份周报"

SubTask 1: agent-A 查 Git 历史  ─────┐
                                      ├──→ Layer 1: [SubTask1, SubTask2] 并行
SubTask 2: agent-B 检查 CI 状态  ────┘
                                              │
                                              ▼ (SubTask1 && SubTask2 都完成后)
                                              │
SubTask 3: agent-C 根据历史写周报  ──────── Layer 2: [SubTask3]

依赖关系: SubTask3.dependsOn = ["SubTask1", "SubTask2"]
```

### 调度策略

| 策略 | 行为 | 适用场景 |
|------|------|----------|
| **并行调度** | 同层任务同时分派，各自 SSE 流式输出 | 独立子任务 |
| **串行调度** | 按依赖链逐层执行 | 有先后依赖的任务 |
| **失败降级** | 单个 Agent 失败 → 重试一次 → 仍失败则跳过 | 保证系统可用性 |
| **结果聚合** | 全部完成后合并多路输出 | 给用户统一的回复 |

### 意图分析演进

```
阶段 1（规则引擎）         →   阶段 2（LLM 引擎）
──────────────────────────────────────────────
正则提取 @mention          →   LLM 自然语言理解
关键词检测串/并行          →   JSON 结构化输出
2+ mentions 触发群聊      →   LLM 自主判断
前后端两套提取逻辑         →   服务端统一
```

**设计决策：** 保留规则引擎作为 LLM 的降级方案（fallback），提高系统鲁棒性。

### SS E 事件架构

```
┌─────────────────────────────────────────────┐
│            SSE Connection Manager           │
│                                             │
│  一条连接 / 每个用户                         │
│  ┌─────────────────────────────────────────┐│
│  │  Agent 1 ── chunk(chunk+agentId)       ││
│  │  Agent 2 ── chunk(chunk+agentId)       ││  ← 统一事件名
│  │  Orchestrator ── decomposition/task-status/aggregated │
│  │  System    ── replace/done/error       ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
         ▲              ▲
         │              │
    Web App A      Web App B
```

**关键设计决策：** 所有 Agent 使用统一事件名（`chunk`/`done`），通过 data 中的 `agentId` 区分来源，而非 `agent:${id}:chunk` 前缀。这使得前端监听逻辑与单聊一致。

---

## 四、实时通信架构

群聊系统采用**双通道实时架构**：

```
                  ┌────────────────┐
                  │   Client App   │
                  └───────┬────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
         SSE 连接                  WS 连接
      (单向流)                  (双向信令)
              │                       │
              ▼                       ▼
   ┌────────────────┐   ┌────────────────────┐
   │  Agent 流式输出 │   │  状态同步 / 信令    │
   │  - chunk       │   │  - typing indicator │
   │  - done        │   │  - online presence  │
   │  - error       │   │  - notification     │
   │  - replace     │   │  - ping/pong        │
   └────────────────┘   └────────────────────┘
```

| 通道 | 方向 | 协议 | 用途 | 可靠性要求 |
|------|------|------|------|-----------|
| SSE | 服务端 → 客户端 | HTTP 长连接 | Agent 流式输出 | 高（可断线重连） |
| WebSocket | 双向 | WS | 状态同步、信令 | 中（丢失可接受） |

**为什么 SSE 是主通道而非 WS？**
- SSE 原生支持事件流，天然适合 Agent 逐字输出的场景
- 浏览器原生 EventSource API，自动重连
- SSE 经过反向代理时兼容性更好（Nginx 等对 WS 支持较晚才完善）

---

## 五、多 Agent 并行输出架构

### 核心问题

群聊与单聊的本质区别：**多个 Agent 同时在说话**。架构上需要解决：

```
单聊（1 Agent）：                                   群聊（N Agents）：

┌──────────────┐                              ┌──────────────┐
│  1 个 Agent  │                              │  Agent A     │ ←──┐
│  1 条 SSE    │                              │  Agent B     │ ←──┤  N 条并行流
│  1 个气泡    │                              │  Agent C     │ ←──┤  N 个独立气泡
│  线性更新    │                              │  ...         │ ←──┘
└──────────────┘                              └──────────────┘
```

### 前端架构

```
┌─────────────────────────────────────────────────────┐
│                  ChatPanel                           │
│                                                      │
│  SSE Stream ──→ ConnectionManager                    │
│                    │                                 │
│                    ▼                                 │
│  ┌──────────────────────────────────────────────┐   │
│  │         streamingMessages Map                 │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │   │
│  │  │ agent-A  │ │ agent-B  │ │ agent-C  │      │   │
│  │  │ content  │ │ content  │ │ content  │      │   │
│  │  └──────────┘ └──────────┘ └──────────┘      │   │
│  └──────────────────────────────────────────────┘   │
│                    │                                 │
│                    ▼                                 │
│  ┌──────────────────────────────────────────────┐   │
│  │  独立渲染每个 Agent 的气泡                     │   │
│  │  [Agent A 头像] [Agent A 内容...]            │   │
│  │  [Agent B 头像] [Agent B 内容...]            │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**架构决策：** `StreamingMessage` 状态从单体变为 `Map<agentId, StreamingMessage>`，每个 Agent 拥有独立的流状态，互不影响。

### SSE 与 DB 的一致性

群聊中一个关键的架构挑战：**SSE 流式内容与 DB 持久化内容必须一致**。

```
问题：SSE "done" 事件中 messageId 为空 → 前端无法将流关联到 DB 记录
     → 刷新后消息丢失，SSE 和 DB 出现不一致

解决：dispatcher await onTaskCompleted 拿到 DB 返回的真实 messageId
     → done 事件携带正确 messageId
     → 前端将 streaming 气泡替换为持久化消息
     → 刷新后从 DB 恢复，内容一致
```

### 内联 Artifact 架构

Agent 产出的富媒体内容（HTML 页面、代码片段、Diff 变更）需要在消息流中内联展示。

```
Agent 产出 ToolCall
      │
      ▼
┌─────────────┐    通道 1：文件扩展名
│  Detect     │    .html → web_preview
│  Artifact   │    .java → code
│  Type       │    .diff → diff
└──────┬──────┘    通道 2：内容嗅探（降级）
       │             <html 开头 → web_preview
       ▼
┌─────────────┐
│  Insert     │    content 中嵌入标记对
│  Marker     │    ~~~artifact:type:title~~~
└──────┬──────┘    ~~~content~~~
                   ~~~artifact:end:type~~~
       │
       ▼
┌─────────────────────────────────────────────┐
│  透传 content（SSE 流式推送 + DB 持久化）    │
│  前端解析标记 → 分段渲染                     │
│  - 文本段 → MarkdownRenderer                 │
│  - artifact 段 → iframe / CodeBlock / DiffCard │
└─────────────────────────────────────────────┘
```

**为什么用内容标记而非独立表？** 保证 SSE 和 DB 的一致性路径 —— content 既是流式传输的载体，也是 DB 持久化的存储，刷新后从 DB 恢复到前端的渲染结果与流式过程完全一致。

---

## 六、IM 增强功能架构

### 功能全景

```
Slice 1：消息交互                          Slice 2：产物展示
┌────────────────┐                       ┌────────────────┐
│ 回复/引用       │                       │ 内联预览        │
│ - parentId 自关联│                      │ - iframe srcdoc │
│ - QuoteBlock   │                       │                 │
│ - QuoteBar     │                       │ 全屏展开         │
├────────────────┤                       │ - RightPanel    │
│ 重新生成        │                       │                 │
│ - 单聊：全量替换 │                       │ Diff 应用        │
│ - 群聊：只替换该Agent│                   │ - 备份→写入      │
├────────────────┤                       └────────────────┘
│ Pin 消息        │
│ - 标记+列表      │                       Slice 3：对话管理
│ - 注入 Agent 上下文│                      ┌────────────────┐
└────────────────┘                       │ 置顶            │
                                         │ - isPinned 排序  │
                                         ├────────────────┤
                                         │ 归档            │
                                         │ - isArchived 过滤│
                                         └────────────────┘
```

### 重新生成的群聊语义

单聊和群聊的 Regenerate 在架构上需要不同处理：

| 场景 | 架构行为 | 影响范围 |
|------|----------|----------|
| **单聊** | 找到用户原消息 → 重新执行 Agent → 替换消息内容 | 仅 1 条消息 |
| **群聊** | 找到用户原消息 → 只重新执行指定 Agent → 只替换该 Agent 的消息 | 其他 Agent 回复不受影响 |

**实现方式：** SSE `replace` 事件，前端收到后用新内容原地替换旧消息，而非删除重建。

### Pin 消息的上下文注入架构

```
群聊中 Pin 的消息 → Agent 执行时注入到上下文
                    ↓
┌──────────────────────────────────────────┐
│            Agent 执行流程                  │
│                                          │
│  1. 查询该对话下 isPinned=true 的消息     │
│  2. 格式化为 "[Pinned Context] ..."      │
│  3. 追加到 Agent 的 system prompt 中     │
│                                          │
│  约束：上限 10 条，避免上下文超限          │
└──────────────────────────────────────────┘
```

---

## 七、架构原则

### 1. Agent = Contact

Agent 没有独立的数据表。一个 Agent 本质上就是一个 Contact，通过 `contactType === "Agent"` 区分。这意味着：
- 联系人管理功能（置顶、标签、自定义名称）天然适用于 Agent
- 群聊的参与者统一用 `contactIds` 管理，无需区分用户和 Agent

### 2. SSE 为主、WS 为辅

- **SSE**：承载核心业务数据（Agent 流式输出），单向，服务端→客户端
- **WS**：承载辅助信令（typing、presence、notification），双向

### 3. DAG 任务调度

Orchestrator 将用户意图建模为有向无环图，通过拓扑排序确定执行顺序：
- 同层并行 → 多个 Agent 同时输出
- 层间串行 → 依赖任务按序执行

### 4. 前端多流独立

每个 Agent 拥有独立的 streaming 状态，渲染为独立的气泡，互不影响。

### 5. SSE 与 DB 同源

消息内容在 SSE 和 DB 中使用同一份 `content`，保证流式过程和刷新恢复的结果一致。Artifact 采用内联标记而非独立表，确保一致性路径最短。

### 6. 统一事件协议

所有 Agent 的 SSE 事件名统一（`chunk`/`done`/`error`），通过 data 中的 `agentId` 区分来源，避免前端为每个 Agent 注册独立监听。

---

## 八、架构决策记录

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 群成员存储 | 关联表 vs 数组字段 | 数组字段 | 查询简单，无 JOIN，适合群聊固定场景 |
| 意图分析 | 规则引擎 vs LLM | 两者皆有（LLM 为主，规则降级） | 精确性和鲁棒性兼顾 |
| SSE 事件命名 | 统一事件名 vs Agent 前缀 | 统一事件名 + data.agentId | 前端监听逻辑简单，与单聊一致 |
| Artifact 存储 | 独立表 vs 内联标记 | 内联标记 | SSE 与 DB 一致性，无需额外查询 |
| Streaming 状态 | 单对象 vs Map | Map<agentId, StreamingMessage> | 多 Agent 独立渲染 |
| Regenerate | 删除重建 vs 原地替换 | SSE replace 事件替换 | 保留消息 ID，群聊不干扰其他 Agent |
| Workspace 传递 | 独立配置 vs 取自 Conversation | 取自 Conversation.workspacePath | 单聊群聊一致，无需额外配置 |
