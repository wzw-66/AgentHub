## Context

当前 Agent 输出流经过 `runAgentExecution()` 时，ToolCall chunk 被直接推为 `tool_status` 事件，不修改内容。`artifact-detector.ts` 中的 `processChunk()` 函数已实现将 ToolCall 转换为 `~~~artifact` 标记文本的逻辑，但**未被接入执行流水线**。

前端方面，`ChatPanel.tsx` 的 `MessageContent` 组件按 `message.type` 字段分路渲染（Text→MarkdownRenderer, Artifact→ArtifactCard），但**没有解析 `~~~artifact` 标记的代码**，且 stream 阶段没有区分 artifact 的能力。

DB 的 Artifact 模型（`messageId, type, content, url, previewUrl, status`）内容与 Message 冗余，渲染路径不依赖它。

## Goals / Non-Goals

**Goals:**
- ToolCall 写入文件时自动检测并嵌入 artifact 标记，走统一 Text 流输出
- 前端解析 `~~~artifact:type:title~~~` 标记，按类型分形式渲染
- 移除 `ChunkType.Artifact`，简化 chunk 协议
- DB Artifact 模型从渲染路径中剥离（保留仅用于可选的历史查询）

**Non-Goals:**
- 不改变现有的 SSE/WS 推送机制
- 不改变 ToolCall 的 `tool_status` 事件（前端仍可显示处理中状态）
- 不引入新的外部依赖
- 不涉及 Artifact 权限管理

## Decisions

### Decision 1: 标记格式复用现有方案

`~~~artifact:type:title~~~` / `~~~artifact:end:type~~~` 格式已由 `insertArtifactMarker()` 实现，直接沿用。标记语法解析通过正则完成，无需新增序列化层。

- 格式：`~~~artifact:${type}:${title}~~~` + 内容 + `~~~artifact:end:${type}~~~`
- 用正则 `/~~~artifact:(\w+):(.+?)~~~([\s\S]*?)~~~artifact:end:\w+~~~/g` 提取

**Alternatives considered:**
- JSON 包裹标记（如 `{"type":"code","content":"..."}`）→ 混合文本流中 JSON 边界不清晰，正则不如定界符可靠
- 独立 chunk 类型 → 正是我们要移除的方案，增加协议复杂度

### Decision 2: processChunk() 在 pushChunk 前调用

在 `runAgentExecution()` 的 chunk 处理循环中，对每个 chunk 先调用 `processChunk()`，再送入 `pushChunk()`。非 ToolCall chunk 直接透传。

```typescript
for await (const chunk of harness.execute(context)) {
  const processed = processChunk(chunk);  // 新增
  // ... 累积 finalResponse ...
  pushChunk(cm, conversationId, processed, agentId);
}
```

### Decision 3: 前端标记解析在渲染层，不在 stream 层

stream 层（`useSSEStream`）只负责 append 文本。标记解析发生在 `MessageContent` 渲染阶段，对单条消息的 content 做一次解析：

```typescript
function MessageContent({ message }) {
  const blocks = parseArtifactMarkers(message.content);
  return blocks.map(block =>
    block.type === 'text' ? <MarkdownRenderer /> :
    block.type === 'web_preview' ? <iframe /> :
    block.type === 'code' ? <CodeBlock /> : ...
  );
}
```

**Alternative considered:** stream 层边收边解析 → 实现复杂，跨 chunk 边界可能出现标记截断，不值得。

### Decision 4: DB Artifact 模型保留但渲染不依赖

为兼容现有的 `/artifacts/:id/detail` 和 `/artifacts/:id/preview` 端点，DB 模型不删除。但渲染路径完全走 content + 标记，不查询 Artifact 表。

### Decision 5: 移除 ChunkType.Artifact

`packages/shared/src/enums/chunk.ts` 中移除 `Artifact = "artifact"`，所有引用处统一改为直接发送 Text chunk（含标记）。

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 标记内容跨多个 chunk 边界（如大型文件） | 标记头尾在同一 chunk 内才解析；跨 chunk 的情况暂不支持，等 stream 层积累完整后再解析 |
| 历史消息中已有 `~~~artifact` 文本被误解析 | 仅在新增流中生效，历史消息的 message.type 依然保留，走旧渲染路径。可加前后版本兼容判断 |
| ToolCall 没有产出内容（非文件操作） | `processChunk()` 返回原始 chunk，`detectArtifact()` 返回 null 时透传 |

## Migration Plan

1. 前端先合并 `parseArtifactMarkers()` 和分形式渲染代码，确保解析器就绪
2. 后端接入 `processChunk()` 到 `runAgentExecution()`
3. 移除 `ChunkType.Artifact` 及关联代码
4. 验证流式渲染正常，历史消息兼容

## Open Questions

- 消息保存到 DB 时，content 中保留标记还是剥离标记？目前设计保留（保持自描述），但未来可考虑分离存储。
