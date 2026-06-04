## Context

当前群聊模式存在三个核心问题：

1. **单流状态**：前端 `chat-context.tsx` 只有一个 `streamingMessage` 状态，多个 Agent 并行输出时内容互相覆盖，最终只显示最后一个 Agent 的回复
2. **HTML 无法预览**：Agent 产出的 HTML 内容以纯文本形式存储在 message content 中，前端通过 MarkdownRenderer（react-markdown）渲染为代码块，而非 iframe 预览
3. **messageId 断裂**：dispatcher 的 `dispatchAll` 在 `onTaskCompleted` 保存消息后，发送的 `done` SSE 事件中 `messageId` 为空串，导致前端无法将 streaming 消息关联到后端的真实消息 ID，刷新后消息"丢失"

此外，Windows 平台上 `child_process.spawn` 默认会弹出控制台窗口。

## Goals / Non-Goals

**Goals:**
- 群聊模式下多个 Agent 的 streaming 输出可以在前端同时独立渲染
- Agent 产出的 HTML 内容自动识别并渲染为 iframe 预览卡片
- SSE streaming 和 DB 刷新后的渲染结果一致，无需额外 API
- messageId 在 done 事件中正确传递，刷新后消息不丢失
- 修复 Windows 命令行闪烁

**Non-Goals:**
- 不做 artifact 独立表存储（content 字符串本身承载标记）
- 不做 position 字段追踪（标记嵌入 content 天然定位）
- 不引入外部依赖检测库
- 不修改现有 DB schema

## Decisions

### 1. 标记格式：`~~~artifact:type:title~~~`

选择 `~~~artifact:type:title~~~` 作为标记格式，而不是 HTML 注释或 JSON 嵌入。

**原因：**
- 使用 `~~~` 三波浪线，与 markdown 代码块 ` ``` ` 区分，不会被 react-markdown 误解析
- `type` 决定渲染方式（`web_preview` → iframe, `code` → 代码卡片, `diff` → diff 视图, `document` → 文本卡片）
- `title` 作为卡片标题（code 类型时可以是文件名）
- 在 content 字符串中可读性强，debug 方便

**标记对：**

```
~~~artifact:web_preview:待办列表~~~
<html><body>...</body></html>
~~~artifact:end:web_preview~~~

~~~artifact:code:Main.java~~~
public class Main { ... }
~~~artifact:end:code~~~
```

结尾标记 `~~~artifact:end:type~~~` 带 type 字段与开头配对，防止嵌套或不匹配时解析歧义。

前端渲染时，按标记分割 content，标记之间的内容作为 artifact content 渲染为卡片。

### 2. 双通道内容检测：`detectArtifact()`

采用双通道检测策略，不依赖工具名。

**通道 1 — 文件扩展名（优先）：**
ToolCall 的 input 中如果包含 `file`/`filename`/`path` 字段，提取扩展名直接确定语言：

```
.html, .htm       → { type: "web_preview", language: "html" }
.java             → { type: "code", language: "java" }
.c                → { type: "code", language: "c" }
.cpp, .cc, .cxx   → { type: "code", language: "cpp" }
.json             → { type: "code", language: "json" }
.py               → { type: "code", language: "python" }
.ts, .js          → { type: "code", language: "javascript" }
.css              → { type: "code", language: "css" }
.md               → { type: "document", language: "markdown" }
.diff, .patch     → { type: "diff", language: "diff" }
```

**通道 2 — 内容嗅探（降级）：**
无文件扩展名时，通过内容特征判断：

```
<html / <!DOCTYPE 开头       → { type: "web_preview", language: "html" }
diff --git / --- a/ 开头      → { type: "diff", language: "diff" }
{" 或 [{ 开头 (JSON)          → { type: "code", language: "json" }
public class / interface 开头 → { type: "code", language: "java" }
#include / int main 开头      → { type: "code", language: "c" }
```

**返回值结构：**

```typescript
type ArtifactDetectionResult = {
  type: "web_preview" | "code" | "diff" | "document";
  language?: string;     // 具体语言（用于 code 类型的语法高亮）
} | null;                 // 非 artifact 内容
```

### 3. 前端多流状态：`Map<agentId, StreamingMessage>`

将单一 `streamingMessage: StreamingMessage | null` 改为 `streamingMessages: Map<string, StreamingMessage>`。

`appendMessageChunk(chunkText, agentId)` 按 `agentId` 路由到对应的 streaming message，不存在则创建新条目。

`finalizeMessage(messageId, agentId)` 只 finalize 指定 agent 的流，不影响其他仍在输出的 agent。

### 4. messageId 传递修复

在 `dispatcher.ts` 中，`onTaskCompleted` 回调改为返回 `Promise<string | undefined>`（即 DB 保存后返回的 `saved.id`），`dispatchAll` 循环中 await 后再发送 `done` 事件。

### 5. ToolCall → artifact 转换时机

在 `messages.ts` 的 `pushChunk()` 和 dispatcher 的 `pushAgentChunk()` 中，拦截 `ChunkType.ToolCall` 类型 chunk：

1. 从 `chunk.metadata?.toolInput` 提取 tool 的输入内容（JSON 字符串）
2. 调用 `sniffArtifactType()` 判断内容类型
3. 匹配则构造 artifact 标记插入 content
4. 不匹配则按原逻辑追加 `chunk.content`

### 6. Command 窗口闪烁

`claude.adapter.ts` 和 `opencode.adapter.ts` 中 `spawn()` 第三个参数增加 `windowsHide: true`。

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| 内容嗅探误判 | 普通文本被误认为是 HTML | 使用多条件复合判断（同时检查开标签和闭标签） |
| 标记在 content 中可见 | 用户搜索时看到 artifact 标记 | 前端渲染时彻底过滤标记；保存前也做一次清洗（可选） |
| 并行 agent 大量输出 | 前端渲染性能下降 | Map 中每个条目独立渲染，React 只 diff 变化的部分 |
| ToolCall input 中 content 嵌套深 | 提取 HTML 内容逻辑复杂 | `extractContent()` 优先取 `content`/`html`/`body` 等常见字段，兜底返回整个 input 的 JSON |
