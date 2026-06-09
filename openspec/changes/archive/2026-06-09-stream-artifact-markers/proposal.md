## Why

当前 Artifact 渲染架构存在三个断层：(1) DB 有独立的 Artifact 模型但实际渲染用不上；(2) ToolCall 的 artifact 检测（`processChunk` + `~~~artifact` 标记）已实现但未接入执行流水线；(3) 前端没有标记解析器，收到标记内容直接当文本渲染。导致 Artifact 卡片只能靠手动设 `message.type` 触发，没有自动化路径。

## What Changes

- **BREAKING**: 移除 `ChunkType.Artifact` — 不再作为独立的 chunk 类型输出，统一走 Text + 标记
- **接入 `processChunk()`**: 在 `runAgentExecution()` 中对 ToolCall chunk 调用 `processChunk()`，自动检测并嵌入 `~~~artifact:type:title~~~` 标记
- **前端标记解析器**: 新增 `parseArtifactMarkers()`，将 stream 内容按标记分割为普通文本块和 artifact 块
- **分形式渲染**: 前端根据 artifact type 差异化渲染（html→iframe、code→语法高亮、diff→对比视图）
- **简化 DB 模型**: Artifact DB 模型不再作为渲染路径依赖，保留仅用于可选的持久化/预览查询

## Capabilities

### New Capabilities
- `artifact-marker-parser`: 前端标记解析与分形式渲染引擎
- `artifact-stream-pipeline`: 后端 ToolCall→标记转换的流式处理管线

### Modified Capabilities
- `chat-ui`: 消息渲染逻辑变更 — 新增 artifact 标记解析后的分形式渲染

## Impact

- `apps/server/src/routes/messages.ts`: `runAgentExecution()` 中接入 `processChunk()`
- `apps/server/src/orchestrator/artifact-detector.ts`: 确认检测逻辑无误，可能微调
- `apps/web/components/ChatPanel.tsx`: 消息内容渲染改为先解析标记再分段渲染
- `apps/web/components/ArtifactCard.tsx`: 增强为按 type 分形式渲染
- `apps/web/components/RightPanel.tsx`: 对齐标记解析后的渲染逻辑
- `packages/shared/src/enums/chunk.ts`: 移除 `Artifact` 枚举值
- 其他引用 `ChunkType.Artifact` 的地方同步清理
