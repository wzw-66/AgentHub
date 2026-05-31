## Why

聊天面板中消息渲染存在两个问题：(1) Markdown 语法（如 `**bold**`、`` `code` ``、`# Header` 等）没有渲染，直接显示原始文本；(2) 用户消息和 AI 消息因为 DOM 结构问题全部左对齐，加上没有发送者标签，视觉上难以区分。

## What Changes

- **ChatPanel.tsx `MessageContent`**：替换纯文本输出为 `react-markdown` + `remark-gfm` 渲染，支持完整的 GFM markdown 语法（标题、列表、表格、代码、加粗等）
- **消息对齐修复**：修复 wrapper div 阻断 `alignSelf` 的问题，让用户消息右对齐、AI 消息左对齐
- **添加发送者标签**：在消息气泡上方显示 "你" 或 AI 名称，方便快速识别消息来源
- **增强 AI 气泡视觉对比**：让 AI 气泡背景色更不透明、或添加左侧强调线，与面板背景拉开层次

## Capabilities

### New Capabilities
- `markdown-rendering`: 在聊天消息中渲染 GFM markdown 语法，支持代码块、表格、列表、标题、内联格式等

### Modified Capabilities
- `chat-ui`: "消息气泡渲染"的需求变更——用户消息改为右对齐（当前实现），AI 消息改为左对齐并显示发送者名称；增加 Markdown 渲染需求；增强 AI 气泡可辨识性

## Impact

- **apps/web**: 新增 `react-markdown` + `remark-gfm` 依赖；修改 `ChatPanel.tsx` 的 `MessageContent` 函数；修复消息 wrapper 对齐逻辑；添加 sender label UI
- **packages/ui**: 可能微调 `MessageBubble` 组件的样式，增强 AI 气泡的视觉区分度
- **openspec/specs/chat-ui/spec.md**: 更新"消息气泡渲染"相关 Scenario 以反映新的对齐方向和发送者标签
