# 群聊 Demo 场景：多 Agent 编排与协作

> 对应脚本段落：场景二（01:00 - 01:40）
> 实现方式：方案 A — Mock 数据切入（代码内定时序列）

---

## 一、规则说明

### 触发条件

在群聊对话中（`isGroupChat === true`），输入以下**完全匹配**的消息：

```
帮我写一个个人博客网站，包含首页、文章列表和关于页面
```

### 前置要求

- 群聊中至少有 **3 个 Agent 成员**
- 按成员在群中的顺序分配角色：
  - 角色 0 → 写首页（HTML/CSS/JS 粒子动画）
  - 角色 1 → 写文章列表（HTML + 数据 JS）
  - 角色 2 → 写关于页面（个人简介卡片）
- 少于 3 个 Agent 时不会触发

### 演示流程时间线

| 时间（从触发起） | 事件 | DAG 阶段 | 文件树状态 |
|----------------|------|---------|-----------|
| t=0ms | 用户消息出现（立即清空旧消息） | — | 空 |
| t=600ms | DAG 指示器出现 | **意图分析**（紫色高亮） | 空 |
| t=1200ms | 意图分析完成 → | **任务分解** | 空 |
| t=2200ms | 任务分解完成 → Agent 1 开始流式输出 | **Agent: 首页**（3 块，每块间隔 350ms） | 空 |
| t=6000ms | Agent 1 完成 | ✓ Agent 1 变绿 | `index.html`, `style.css`, `hero-animation.js` |
| t=6200ms | Agent 2 开始流式输出 | **Agent: 文章列表**（2 块） | 同上 |
| t=9000ms | Agent 2 完成 | ✓ Agent 2 变绿 | + `articles/index.html`, `articles/data.js` |
| t=9200ms | Agent 3 开始流式输出 | **Agent: 关于页**（2 块） | 同上 |
| t=11500ms | Agent 3 完成 | ✓ Agent 3 变绿 | **完整项目**（5 个文件） |
| t=12500ms | 交互卡片弹出 | **等待用户** | 完整文件树 |
| 用户点击选项 | 用户回复消息 + 聚合开始 | **结果聚合**（3 块，每块 800ms） | 完整文件树 |
| 聚合完成 + 500ms | 演示结束 | DAG 消失 | 完整文件树 |

### 用户交互

Agent 弹出交互卡片，内容：
```
🎨 我想确认一下：你对博客的主色调偏好是什么？
```

选项：
1. **深色主题 (紫色调)** — 深色背景 + 紫色强调色
2. **浅色主题 (蓝色调)** — 浅色背景 + 蓝色强调色

用户点击任一选项后，聚合消息出现。点击「取消」也会跳过交互直接显示聚合。

---

## 二、完整台词与画面同步

### 画面 1：群聊界面

**画面：** 群聊顶部显示 3 个 Agent 头像列表，右侧面板显示群成员区域 + "暂无预览内容"

**旁白：**
> 在群聊中，一个对话里包含多个 Agent——每个 Agent 都有自己的角色定位和擅长领域。你可以像拉群一样组织它们。

### 画面 2：发送消息

**用户打字：**
```
帮我写一个个人博客网站，包含首页、文章列表和关于页面
```

**旁白：**
> 你只需要发一条消息，Orchestrator 会自动进行意图分析，将任务拆解成 DAG 并并行调度。

### 画面 3：DAG 编排动画

**画面：** 聊天区顶部出现 DAG 节点条 `意图分析 → 任务分解 → Agent:首页 → Agent:文章列表 → Agent:关于页 → 结果聚合`，节点依次变绿

**旁白：**
> 这里就是核心技术亮点——Orchestrator 编排引擎。它通过 LLM 自动分析意图，构建 DAG 任务图：没有依赖的任务并行执行。三个互不依赖的任务同时开工。

### 画面 4：Agent 1 输出首页

**旁白：**
> Claude 负责首页开发——包含 Canvas 粒子动画的 Hero 区域、导航栏，以及完善的 CSS 样式。与此同时，其他 Agent 也在并行工作。

**右侧面板：** 同步出现 `index.html`、`style.css`、`hero-animation.js`

### 画面 5：Agent 2 输出文章列表

**旁白：**
> Codex 构建了文章列表页——包含数据层和渲染逻辑。三篇文章覆盖技术、架构和 React 主题。

**右侧面板：** 文件树新增 `articles/` 目录

### 画面 6：Agent 3 输出关于页面

**旁白：**
> 自定义 Agent 负责关于页面，三个 Agent 同时在各自领域工作，互不干扰——这在传统开发流程中需要三个人串行完成。

**右侧面板：** 文件树新增 `about/` 目录，展示完整项目结构

### 画面 7：交互卡片

**旁白：**
> 但最有意思的是这个——Agent 执行过程中遇到不确定的决策点时，不是擅自猜测，而是主动向你提问。这不是单向指令，而是真正的双向对话。

### 画面 8：用户选择 + 聚合结果

**用户点击：** 「深色主题 (紫色调)」

**旁白：**
> 你选择主题偏好后，Agent 收到反馈继续执行。

**聚合消息出现：**
> ✅ 博客网站开发完成！已由 3 个 Agent 协作完成以下页面...
> ├── index.html, style.css, hero-animation.js
> ├── articles/index.html, articles/data.js
> └── about/index.html

---

## 三、消息内容结构

### Agent 1（角色 0）— 首页

3 个 chunk，内容含 artifact 标记：

1. 开场文字：`我来创建博客首页，包含 Hero 区域和粒子动画效果。`
2. `~~~artifact:code:index.html~~~` — 完整的 HTML（Hero + 导航 + 文章预览 + 页脚）
3. `~~~artifact:code:style.css~~~` — 全局样式（渐变背景、fadeUp 动画、响应式网格）
4. `~~~artifact:code:hero-animation.js~~~` — Canvas 粒子动画（60 个粒子随机运动）

### Agent 2（角色 1）— 文章列表

2 个 chunk：

1. 开场文字：`文章列表页已完成，包含数据定义和渲染逻辑。`
2. `~~~artifact:code:articles/index.html~~~` — 文章列表页 HTML
3. `~~~artifact:code:articles/data.js~~~` — 3 篇文章数据 + renderArticles 渲染函数

### Agent 3（角色 2）— 关于页面

2 个 chunk：

1. 开场文字：`关于页面已创建，包含个人简介卡片和社交链接。`
2. `~~~artifact:code:about/index.html~~~` — 个人简介卡片 + 社交链接

### 聚合消息（用户交互后）

3 个 chunk：

1. 汇总标题：`✅ 博客网站开发完成！\n\n已由 3 个 Agent 协作完成以下页面：`
2. Markdown 表格：页面 × 负责 Agent × 功能
3. 项目结构树 + 提示语

---

## 四、实现方式：代码结构

### 涉及的源文件

| 文件 | 作用 |
|------|------|
| `apps/web/lib/demo-data.ts` | 所有静态数据定义（消息内容、文件树、配置） |
| `apps/web/components/DAGIndicator.tsx` | DAG 编排器进度可视化组件 |
| `apps/web/lib/chat-context.tsx` | demo 状态管理（`demoMode`/`demoPhase`/`demoFileTree`）+ `startDemoSequence` + 交互处理 |
| `apps/web/components/ChatPanel.tsx` | 检测触发消息、渲染 DAGIndicator、显示"🎬 演示模式"标签 |
| `apps/web/components/FileExplorer.tsx` | demo 模式下从 context 读取文件树 |
| `apps/web/src/app/globals.css` | 添加 `pulse-glow` 关键帧动画 |

### 新增功能

#### Diff 一键应用（`DiffCard.tsx`）

纯前端实现，点击"应用 Diff"按钮后：

1. 按钮显示加载旋转动画（800ms）→ 切换为绿色"✓ 已应用"
2. 底部出现绿色横幅：`Diff 已成功应用到 {filename}`
3. 3 秒后自动复位

DiffCard 现在支持 `filename` prop，可从 artifact marker 的 title 字段自动提取。

#### 展开预览（`ExpandPreviewModal.tsx`）

Web Preview 类型的 artifact 现在右上角有「展开」按钮：

1. 点击后打开全屏模态框（90vh × 90vw）
2. 模态框中渲染完整尺寸的 iframe（sandbox with allow-scripts）
3. 点击背景或关闭按钮退出

ChatPanel 内通过 `expandPreview` 状态管理，传递给 `renderArtifactBlocks` 和 `MessageContent`。

### 状态流转

### 状态流转

```
用户发送触发消息
    ↓
ChatPanel.handleSend() 检测到 DEMO_TRIGGER + isGroupChat
    ↓
获取群聊中前 3 个 Agent → 调用 startDemoSequence(convId, agents)
    ↓
chat-context 内定时器链:
  setDemoPhase → appendMessageChunk → finalizeMessage → setDemoFileTree → setPendingInteraction
    ↓
用户通过 respondToInteraction 响应
    ↓
聚合消息 (appendMessageChunk → finalizeMessage) → setDemoPhase("done")
```

### 清理机制

- 切换对话时自动重置 demo 状态（`useEffect` 监听 `activeConversationId`）
- 组件卸载时清理所有计时器（`demoTimersRef` + `useEffect` cleanup）

---

## 五、录制注意事项

1. 使用一个新的群聊对话（无历史消息），避免 `setMessages([])` 清除时出现闪烁
2. 推荐先创建 3 个 Agent 并确认它们的名称和颜色在 UI 中醒目
3. 建议录制时在右侧面板保持展开状态，以便展示文件树逐步填充的效果
4. 每段旁白约 8-12 秒，配合画面中的流式输出效果，剪辑时可适当加速
5. 若需重录，切换一下对话再切回来即可重置 demo 状态
