# 场景：从群聊输入到多 Agent 协作交付

> 对应实现：`apps/web/lib/demo-data.ts`、`apps/web/lib/chat-context.tsx`、`apps/web/components/DAGIndicator.tsx`
> 对应脚本：Demo 视频脚本场景二（01:00 - 01:40）

---

## 4.1 用户画像

**目标用户：** 需要快速交付中小型网页项目的开发者、独立开发者、初创团队。

**核心痛点：**
- 传统 AI 对话只产出代码片段，不产出可交付的项目结构
- 单 Agent 能力有限，复杂任务需要多人多角色协作
- 多 Agent 协作过程不透明，用户不知道"AI 在做什么、做到哪一步了"
- Agent 遇到不确定决策时只能猜测，无法与用户实时沟通

**使用动机：** 用户想从"和 AI 聊天"升级为"和 AI 团队协作"，一个对话就是一个项目工作区。

---

## 4.2 场景：从任务输入到协作启动

用户在群聊中的起点不是选择工具或配置流程，而是直接描述任务目标。例如：

> "帮我写一个个人博客网站，包含首页、文章列表和关于页面"

输入发送后，系统自动将普通群聊升级为任务空间：

1. **Orchestrator 分析阶段（2s）** — 聊天区顶部出现 `🧠 Orchestrator 正在分析你的需求...` 过渡动画，同时 DAG 节点显示 `[● Orchestrator 分析中]`
2. **意图分析（3s）** — DAG 节点推进至 `意图分析`，表示系统正在理解用户需求
3. **任务分解（3s）** — DAG 节点推进至 `任务分解`，展示任务被拆解的过程
4. **Agent 启动** — DAG 展开全部节点，3 个 Agent 并行启动，每个 Agent 输出前有工具调用指示（`🤔 思考中` → `✏️ 写入文件`）

整个过程用户感知到一个聊天会话变成了一个正在工作的 AI 团队，DAG 可视化让每一步决策过程透明可见。

### DAG 渐进展示规则

| 阶段 | DAG 显示 | 可见节点数 |
|------|---------|-----------|
| analyzing | `[● Orchestrator 分析中]` | 1 |
| intro | `[✓ 分析中] → [● 意图分析]` | 2 |
| decompose | `[✓] → [✓ 意图分析] → [● 任务分解]` | 3 |
| agent_1+ | 全部 7 个节点展开 | 7 |

### DAG 节点过渡动画

节点状态流转：`pending`（灰色）→ `active`（紫色脉冲）→ `processing`（高强度紫色扩散缩放，700ms）→ `done`（绿色）

---

## 4.3 场景：多 Agent 并行协作与交互决策

### 并行输出

执行过程中 3 个 Agent 依次输出（每个间隔 3s 模拟反应时间），每个 Agent 的输出包含：

| Agent | 角色 | 产出文件 | 输出块数 |
|-------|------|---------|---------|
| Agent 1 | 首页开发 | `index.html`、`style.css`、`hero-animation.js` | 8 chunks（~7s） |
| Agent 2 | 文章列表 | `articles/index.html`、`articles/data.js` | 4 chunks（~3s） |
| Agent 3 | 关于页面 | `about/index.html` | 3 chunks（~2s） |

每个输出块间隔 1000ms，Agent 之间有 3s 停顿，模拟真实人类的阅读和思考节奏。

### 工具调用指示器

在 Agent 输出代码之前，聊天区 Agent 名称旁显示工具调用状态：

```
🤔 思考中    →    ✏️ 写入文件    →    （输出代码）
```

状态指示器通过定时器驱动，与代码块的输出时机对齐，让用户理解"Agent 正在做什么"。

### Orchestrator 任务总结（与用户交互前）

所有 Agent 完成后，Orchestrator 先输出一份结构化任务总结：

```
🧠 **Orchestrator 任务总结**

已由 3 个 Agent 协作完成静态博客网站：

| Agent | 负责模块 | 产出文件 |
|-------|---------|---------|
| **首页** | Hero 粒子动画 + 导航栏 + 文章预览 | index.html, style.css, hero-animation.js |
| **文章列表** | 数据驱动渲染 + 交互卡片 | articles/index.html, articles/data.js |
| **关于页面** | 个人简介 + 社交链接 | about/index.html |

📋 **项目结构**
├── index.html          (首页)
├── style.css           (全局样式)
├── hero-animation.js   (粒子动画)
├── articles/
│   ├── index.html      (文章列表)
│   └── data.js         (文章数据)
└── about/
    └── index.html      (关于页面)
```

### 交互决策

总结之后，Agent 不擅自猜测不确定的决策，而是主动向用户提问：

```
🎨 我想确认一下：你对博客的主色调偏好是什么？

[ 深色主题 (紫色调) ]   [ 浅色主题 (蓝色调) ]
```

用户选择后，Orchestrator 聚合确认：

```
🧠 **Orchestrator 任务总结**

✅ 博客网站开发完成！

已由 3 个 Agent 协作完成以下页面：
| 页面 | 负责 Agent | 功能 |
...

📋 **项目文件结构**
├── index.html, style.css, hero-animation.js
├── articles/index.html, articles/data.js
└── about/index.html

💡 如需进一步调整颜色、布局或添加新功能，请直接告诉我！
```

---

## 4.4 完整时间线

从用户输入到演示完成：

| 时间点 | 事件 | 用户感知 |
|--------|------|---------|
| t=0 | 发送消息 | `🧠 Orchestrator 正在分析你的需求...` |
| t=2s | 意图分析 | DAG: `[✓ 分析中] → [● 意图分析]` |
| t=5s | 任务分解 | DAG: `[✓] → [✓ 意图分析] → [● 任务分解]` |
| t=8s | Agent 1 启动 | DAG 展开全部节点，首页代码逐块输出（8块 × 1000ms） |
| t=17s | Agent 2 启动 | 文章列表代码逐块输出（4块 × 1000ms） |
| t=24.5s | Agent 3 启动 | 关于页面代码逐块输出（3块 × 1000ms） |
| t=31s | Orchestrator 总结 | `🧠 Orchestrator 任务总结` + 项目结构 |
| t=~34s | 交互卡片 | `🎨 颜色偏好？` 两个选项 |
| 用户响应 | 聚合确认 | `✅ 博客网站开发完成！` + 文件树 |
| 确认后 | Done | DAG 消失，演示结束 |

---

## 4.5 实现要点

### 状态驱动

演示流程完全由 `demoPhase` 状态驱动，类型定义：

```typescript
type DemoPhase =
  | null          // 非 demo 模式
  | "analyzing"   // Orchestrator 分析中
  | "intro"       // 意图分析
  | "decompose"   // 任务分解
  | "agent_1"     // Agent 1 输出
  | "agent_2"     // Agent 2 输出
  | "agent_3"     // Agent 3 输出
  | "interact"    // 等待用户交互
  | "aggregate"   // 聚合确认
  | "done";       // 演示完成
```

### DAG 组件

- `DAGIndicator.tsx` — 水平节点链组件，支持 4 种节点状态（pending/active/processing/done）
- 节点渐进展示：分析/分解阶段只显示当前及之前的节点，进入 Agent 阶段后展开全部
- 阶段过渡时触发 700ms `processing-pulse` 动画（高强度紫色扩散 + 缩放）

### 定时器链

`startDemoSequence` 通过 `setTimeout` 链驱动整个流程：

1. 所有定时器存储在 `demoTimersRef` 中，组件卸载时统一清理
2. 切换对话时自动重置 demo 状态（`useEffect` 监听 `activeConversationId`）
3. 工具调用指示器通过独立的 `setTimeout` 与代码块输出时机对齐

### 数据内容与修改

所有演示内容（消息文本、代码、文件树、时间配置）集中在 `demo-data.ts`：
- 修改消息内容 → 编辑对应 `AGENT_N_CHUNKS` 数组
- 调整节奏 → 修改 `DEMO_TIMING` 常量
- 增加/移除 Agent → 更新 `DAG_NODES` 和 `DEMO_TIMING`
