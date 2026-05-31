## Context

当前聊天面板的消息渲染存在两个主要问题：

1. **Markdown 未渲染**：`ChatPanel.tsx` 中的 `MessageContent` 函数仅处理了纯文本和完整的 fenced code block，其他 markdown 语法（**bold**、*italic*、`code`、# Header、列表、表格等）全部以原始文本显示。

2. **消息难以区分**：由于每个消息外层的 `<div className="relative animate-fade-in-up message-bubble group">` wrapper 是 flex 容器的直接子项，但 wrapper 本身没有设置 `alignSelf`，导致 `MessageBubble` 内部的 `alignSelf` 不生效，所有消息都左对齐。也没有发送者名称标签。

## Goals / Non-Goals

**Goals:**
- 消息内容支持完整的 GFM markdown 渲染（标题、加粗、斜体、列表、表格、链接、内联代码、代码块等）
- 用户消息右对齐，AI 消息左对齐（与当前 `MessageBubble` 组件的设计一致）
- 每条消息显示发送者名称标签（"你" / AI 名称）
- 增强 AI 消息气泡的可辨识度，避免与背景融为一体

**Non-Goals:**
- 不改动服务端消息存储和返回格式
- 不改动 SSE 流式消息的处理逻辑
- 不引入富文本编辑器
- 不修改 UI 组件库（`@agenthub/ui`）的结构

## Decisions

### Decision 1: 使用 react-markdown + remark-gfm 渲染 Markdown

**选择**: `react-markdown` v9 + `remark-gfm`

**理由**:
- `react-markdown` 基于 React 组件渲染，天然支持自定义组件映射（如将 `code` 映射到已有的 `CodeBlock`）
- `remark-gfm` 提供 GFM 扩展（表格、删除线、任务列表等）
- 零运行时依赖、tree-shakable、安全（默认不渲染原始 HTML）
- 比 `marked` + `dangerouslySetInnerHTML` 更安全，比 `markdown-it` 更适合 React 生态

**替代方案考虑**:
- `marked`: 输出 HTML 字符串，需用 `dangerouslySetInnerHTML`，有 XSS 风险
- `markdown-it`: 功能全面但体积大，同样需 `dangerouslySetInnerHTML`
- 手写简单 parser: 不支持表格等复杂语法，维护成本高

### Decision 2: 修复消息对齐 — 在 wrapper 层设置 alignSelf

**问题**: Messages 列表结构如下：
```
<div class="flex flex-col gap-3">        ← flex 容器
  <div class="relative ...">             ← wrapper（flex 子项，占满整宽）
    <MessageBubble style={{ alignSelf }}>  ← ❌ 里面的 alignSelf 被 wrapper 隔离
```

**方案**: 直接在 wrapper 的 `style` 上设置 `alignSelf`，跳过笨拙的 DOM 层级：

```tsx
<div
  className="relative animate-fade-in-up message-bubble group"
  style={{ alignSelf: variant === "user" ? "flex-end" : "flex-start" }}
>
  <MessageBubble message={msg} variant={variant} ... />
</div>
```

同时移除 `MessageBubble` 外层的 `alignItems`，因为气泡内容不再需要自身对齐。

### Decision 3: 添加发送者标签

在消息气泡上方添加发送者名称：

```
  你                              Claude
┌──────────────┐          ┌──────────────────────────┐
│ 你好         │          │ 你好！有什么可以帮你？   │
└──────────────┘          └──────────────────────────┘
```

- 用户消息显示 "你"（或从 i18n 读取 `chat.you`）
- AI 消息显示对应的 contact name
- 标签使用小号字体（`--ui-font-xs`），文字颜色为 `--theme-text-muted`
- 内置于 `MessageBubble` 中或由 `ChatPanel` 在外层注入

**方案**: 由 `ChatPanel` 在消息气泡外部/内部渲染 sender label。由于 `MessageBubble` 接受 `children`，可以将标签放在气泡内容上方：

```tsx
<MessageBubble message={msg} variant={variant}>
  <div>
    <div className="sender-label">你</div>
    <MessageContent message={msg} />
  </div>
</MessageBubble>
```

### Decision 4: 增强 AI 气泡视觉对比

当前 AI 气泡背景 `rgba(12, 28, 12, 0.7)` 与面板背景 `rgba(8, 18, 8, 0.45)` 在视觉上过于接近。

**方案 A（推荐）**: 在 AI 气泡左侧添加 2px accent 色竖线（强调条），同时略微调亮背景

```
┌──────────────────────────────┐
│░ Claude                      │
│░ 你好！有什么可以帮助你的吗？│
│░                     10:30   │
└──────────────────────────────┘
```

**方案 B（备选）**: 提高 AI 气泡背景的不透明度到 0.85，并增加更明显的边框光晕

选 A 因为：视觉上更精致、不依赖具体颜色值、在全部四个主题下都有效。

#### 实现方式

通过 `MessageBubble` 的 `contentStyle` 左侧加一个 `borderLeft`：

```css
/* 在 contact variant 中 */
content: {
  borderLeft: "2px solid var(--ui-color-primary)",
  backgroundColor: "var(--ui-color-bg-contact)",   // 保持现有
  ...
}
```

同时将 UI 库的 `tokens.css` 中 AI 气泡背景色从 `rgba(12, 28, 12, 0.7)` 调整为 `rgba(12, 28, 12, 0.85)` 以略微提高可见度。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| react-markdown 增加约 15KB 打包体积 | 使用 dynamic import 或 code splitting；总体可接受 |
| 用户输入中含 markdown 特殊字符（如 `$var`）被误渲染 | react-markdown 不会将单个 `$` 解释为特殊语法，不会误伤 |
| 流式消息中 markdown 渲染闪烁 | 流式消息保持纯文本显示（streaming 状态），仅在最终消息落定时渲染 |
| 发送者标签在群聊中可能过长 | 截断显示，hover 时显示完整名称 |
