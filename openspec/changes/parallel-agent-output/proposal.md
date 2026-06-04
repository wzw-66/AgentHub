## Why

群聊模式下 @ 多个 Agent 时，只有一个 Agent 能正常输出，另一个无响应。Agent 输出的 HTML 内容无法实时预览为 iframe，刷新页面后 Agent 回复丢失。根本原因是前端只有一个 streamingMessage 状态，且缺少实时 artifact 渲染机制。

## What Changes

- **并行多 Agent 输出**：前端将单一 `streamingMessage` 改为 `Map<agentId, StreamingMessage>`，支持多个 Agent 同时输出
- **内联 Artifact 标记系统**：引入 `~~~artifact:type:title~~~` / `~~~artifact:end~~~` 标记，嵌入 message content 中，前端解析标记将 HTML 等内容渲染为 iframe/卡片
- **内容嗅探检测**：不依赖工具名，通过 `sniffArtifactType()` 原生检测内容类型（HTML/diff/document）
- **Command 窗口闪烁修复**：在 `claude.adapter.ts` 和 `opencode.adapter.ts` 的 `spawn()` 调用中增加 `windowsHide: true`
- **messageId 持久化修复**：`dispatchAll` 中 await `onTaskCompleted` 拿到真实 messageId，在 `done` SSE 事件中传递

## Capabilities

### New Capabilities
- `parallel-agent-streaming`: 群聊模式下多个 Agent 并行输出，各自独立渲染消息气泡
- `inline-artifact-rendering`: 基于标记的 artifact 内联渲染，同时支持 SSE streaming 和 DB 持久化

### Modified Capabilities
- (无 spec 级别变更)

## Impact

- **packages/agent-core**: `claude.adapter.ts` / `opencode.adapter.ts` — spawn 增加 `windowsHide: true`
- **apps/server**: `messages.ts` — 修复 messageId 传递；`dispatcher.ts` — await onTaskCompleted
- **apps/web**: `chat-context.tsx` — 多 streaming message 状态；`useSSEStream.ts` — 支持 artifact 事件；`ChatPanel.tsx` — 多气泡渲染 + ArtifactCard 展示；`MarkdownRenderer.tsx` — 标记解析
- **packages/shared**: 无需变更（ChunkType 和 Message 类型已支持）
