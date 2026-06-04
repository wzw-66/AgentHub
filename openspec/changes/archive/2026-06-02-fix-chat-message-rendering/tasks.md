## 1. 安装依赖

- [x] 1.1 在 `apps/web` 安装 `react-markdown` 和 `remark-gfm`

## 2. 添加 Markdown 渲染组件

- [x] 2.1 在 `apps/web/components/` 下创建 `MarkdownRenderer` 组件，封装 `react-markdown` + `remark-gfm`，并将 fenced code block 映射到现有的 `CodeBlock` 组件
- [x] 2.2 为 `MarkdownRenderer` 添加内联代码样式（等宽字体、高亮背景）和表格样式
- [x] 2.3 将 `ChatPanel.tsx` 中的 `MessageContent` 函数替换为使用 `MarkdownRenderer`（流式消息保持纯文本）

## 3. 修复消息对齐

- [x] 3.1 在 `ChatPanel.tsx` 中给消息 wrapper div 添加 `style={{ alignSelf: ... }}`，用户消息 `flex-end`，AI 消息 `flex-start`

## 4. 添加发送者标签

- [x] 4.1 在 `ChatPanel.tsx` 的消息渲染逻辑中，在气泡内容上方添加发送者名称标签（用户显示 "你"，AI 显示 contact name），使用小号字体和 muted 颜色

## 5. 增强 AI 气泡视觉对比

- [x] 5.1 在 `packages/ui/src/components/MessageBubble/MessageBubble.tsx` 的 contact variant 中添加左侧 `borderLeft: "2px solid var(--ui-color-primary)"` 强调线
- [x] 5.2 在 `packages/ui/src/styles/tokens.css` 中适当提高 AI 气泡背景色不透明度（如 0.7 → 0.85）
