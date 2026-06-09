## 1. 前端标记解析器

- [x] 1.1 在 `apps/web/lib/` 下创建 `artifact-marker-parser.ts`，实现 `parseArtifactMarkers(content: string): ArtifactBlock[]`
- [x] 1.2 正则匹配 `~~~artifact:type:title~~~...~~~artifact:end:type~~~`，支持多 artifact 共存
- [x] 1.3 未闭合标记降级为普通文本处理

## 2. 前端分形式渲染组件

- [x] 2.1 在 `ChatPanel.tsx` 中创建 `renderArtifactBlocks()` 函数，按 `ArtifactBlock.type` 调度渲染
- [x] 2.2 `code` 类型 → `CodeBlock` 组件，含文件名标题
- [x] 2.3 `web_preview` 类型 → `<iframe sandbox="allow-scripts">`
- [x] 2.4 `diff` 类型 → `DiffCard` 组件
- [x] 2.5 `document` 类型 → `MarkdownRenderer`
- [x] 2.6 未知类型 → `<pre>` 纯文本 fallback
- [x] 2.7 纯文本块 → `MarkdownRenderer`（现有逻辑不变）
- [x] 2.8 `ArtifactCard` 组件保留，仅用于历史消息向后兼容（`message.type === "artifact"` 且无标记）

## 3. ChatPanel 消息渲染集成

- [x] 3.1 修改 `MessageContent` 函数：对 message.content 先调用 `parseArtifactMarkers()`，有 artifact 块则走分形式渲染，否则走旧渲染路径
- [x] 3.2 streamingMessages 渲染也接入标记解析，保证实时流中 artifact 正确渲染
- [x] 3.3 历史消息兼容：`message.type === "artifact"` 且内容无标记时，继续用旧 ArtifactCard

## 4. 后端接入 processChunk()

- [x] 4.1 在 `apps/server/src/routes/messages.ts` 的 `runAgentExecution()` 中，chunk 处理循环开头调用 `processChunk(chunk)`
- [x] 4.2 确认 `finalResponse` 正确累积含标记的文本
- [x] 4.3 确认 `pushChunk()` 用处理后的 chunk（非原始 chunk）

## 5. 移除 ChunkType.Artifact

- [x] 5.1 从 `packages/shared/src/enums/chunk.ts` 移除 `Artifact = "artifact"`
- [x] 5.2 搜索项目中所有引用 `ChunkType.Artifact` 的位置，清理或替换
- [x] 5.3 确认 `pushChunk()` 中移除 `case ChunkType.Artifact` 分支

## 6. 验证

- [ ] 6.1 Agent 写入文件时，前端实时显示 artifact 卡片（非纯文本）
- [ ] 6.2 HTML 文件用 iframe 渲染，代码文件语法高亮，diff 用对比视图
- [ ] 6.3 历史消息兼容：之前存为 `type="artifact"` 的消息正常展示
- [ ] 6.4 无 artifact 的普通消息不受影响
