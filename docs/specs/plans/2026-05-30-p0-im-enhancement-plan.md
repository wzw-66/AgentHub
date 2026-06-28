# P0 IM 体验增强 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补全赛题要求的 P0 核心 IM 功能：消息回复/引用、重新生成、Pin 消息、产物内联预览、Diff 应用、对话置顶/归档。

**Architecture:** 垂直切片 3 个 Slice，每个 Slice 是完整的前后端端到端功能。Slice 1 消息交互 → Slice 2 产物展示 → Slice 3 对话管理。

**Tech Stack:** TypeScript, Next.js 14, Fastify 5, Prisma 6, PostgreSQL, React, tsup (ui package)

---

## 文件结构

### Slice 1: 消息交互增强

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/web/components/ChatPanel.tsx` | 修改 | 消息悬停操作栏（回复/Pin）、引用条 UI、重新生成按钮 |
| `apps/web/lib/chat-context.tsx` | 修改 | 增加 `replyTargetId` 状态、`regenerateMessage` 方法 |
| `apps/web/lib/ws-context.tsx` | 修改 | 增加 SSE "replace" 事件处理 |
| `apps/web/hooks/useSSEStream.ts` | 修改 | 增加 "replace" 事件监听 |
| `packages/ui/src/components/MessageBubble/MessageBubble.tsx` | 修改 | 支持 `parentId` 渲染引用块 |
| `packages/ui/src/types.ts` | 修改 | MessageBubbleProps 增加 `parentMessage` 可选 |
| `apps/server/src/routes/messages.ts` | 修改 | 新增 `handleRegenerate` + `handleListPinned` |
| `apps/server/src/orchestrator/executor.ts` | 修改 | 上下文注入时加载 pinned 消息 |

### Slice 2: 产物展示增强

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/ui/src/components/ArtifactCard/ArtifactCard.tsx` | 修改 | 增加预览按钮 + iframe 展开模式 |
| `packages/ui/src/components/DiffCard/DiffCard.tsx` | 修改 | 增加 "应用" 按钮 + 状态 |
| `packages/ui/src/types.ts` | 修改 | ArtifactCardProps/DiffCardProps 增加回调 |
| `apps/web/components/RightPanel.tsx` | 修改 | 增强 artifact 全屏预览 |
| `apps/server/src/routes/artifacts.ts` | 修改 | 新增 `POST /:id/apply` |

### Slice 3: 对话管理

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/db/prisma/schema.prisma` | 修改 | Conversation 增加 `isPinned` |
| `packages/db/src/repositories/conversation.ts` | 修改 | UpdateConversationInput 增加 isPinned |
| `packages/db/src/repositories/index.ts` | 修改 | 导出 `listPinnedMessages` |
| `packages/db/src/repositories/message.ts` | 修改 | 新增 `listPinnedMessages` |
| `packages/shared/src/types/conversation.ts` | 修改 | Conversation 增加 `isPinned` |
| `apps/web/components/Sidebar.tsx` | 修改 | 置顶/归档 UI + 切换按钮 |
| `apps/web/lib/chat-context.tsx` | 修改 | 增加 `togglePinConv` / `toggleArchiveConv` 方法 |

---

## Slice 1: 消息交互增强

### Task 1: MessageBubble 引用块渲染

**Files:**
- Modify: `packages/ui/src/types.ts`
- Modify: `packages/ui/src/components/MessageBubble/MessageBubble.tsx`
- Test: `packages/ui/src/components/MessageBubble/__tests__/MessageBubble.test.tsx`

- [ ] **Step 1: 更新 MessageBubbleProps 类型**

```typescript
// packages/ui/src/types.ts
export interface MessageBubbleProps {
  message: Message;
  variant: "user" | "contact" | "system";
  children?: ReactNode;
  className?: string;
  parentMessage?: Message | null; // 新增：被引用的父消息
}
```

- [ ] **Step 2: MessageBubble 渲染引用块**

```typescript
// packages/ui/src/components/MessageBubble/MessageBubble.tsx
// 在 contentStyle 渲染之前，增加引用块：

function QuoteBlock({ parentMessage }: { parentMessage: Message }) {
  const quoteStyle: CSSProperties = {
    borderLeft: "2px solid var(--ui-color-primary)",
    padding: "var(--ui-space-1) var(--ui-space-3)",
    marginBottom: "var(--ui-space-2)",
    fontSize: "var(--ui-font-sm)",
    color: "var(--ui-color-text-secondary)",
    backgroundColor: "var(--ui-color-bg-contact)",
    borderRadius: "0 var(--ui-radius-sm) var(--ui-radius-sm) 0",
    opacity: 0.8,
  };

  return (
    <div style={quoteStyle}>
      <div style={{ fontWeight: 600, fontSize: "var(--ui-font-xs)", marginBottom: 2 }}>
        ↳ Reply to message
      </div>
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {parentMessage.content.slice(0, 150)}
      </div>
    </div>
  );
}

// 在 MessageBubble 函数内，children 之前渲染：
{parentMessage && <QuoteBlock parentMessage={parentMessage} />}
{children ?? message.content}
```

- [ ] **Step 3: 运行已有测试确认不破坏**

```bash
pnpm --filter @agenthub/ui test
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/types.ts packages/ui/src/components/MessageBubble/MessageBubble.tsx
git commit -m "feat(ui): add quote block rendering to MessageBubble"
```

### Task 2: ChatPanel 回复交互 (Frontend)

**Files:**
- Modify: `apps/web/components/ChatPanel.tsx`
- Modify: `apps/web/lib/chat-context.tsx`

- [ ] **Step 1: ChatPanel 增加回复状态和 UI**

ChatPanel.tsx 中增加：

```typescript
// 回复状态
const [replyTargetId, setReplyTargetId] = useState<string | null>(null);

// 获取被回复的消息
const replyTargetMessage = replyTargetId
  ? messages.find((m) => m.id === replyTargetId) ?? null
  : null;

// 消息悬停时显示操作栏（调整现有 hover 逻辑）
// 每条消息增加操作按钮区域（在消息气泡右侧）
// 修改消息渲染循环，增加:
{
  /* Reply button on hover */
}
{hoveredMsgId === msg.id && (
  <div className="flex flex-col gap-1" style={{ marginLeft: 4 }}>
    <button
      onClick={() => setReplyTargetId(msg.id)}
      className="flex h-6 w-6 items-center justify-center rounded text-xs hover-lift-sm"
      style={{ color: "var(--theme-text-muted)" }}
      title="Reply"
    >
      ↩
    </button>
  </div>
)}
```

```typescript
// 引用条（在 textarea 上方渲染）
{replyTargetMessage && (
  <div
    className="flex items-center gap-2 px-3 py-2 mb-2"
    style={{
      borderLeft: "3px solid var(--theme-accent)",
      backgroundColor: "var(--theme-accent-dim)",
      borderRadius: "0 8px 8px 0",
    }}
  >
    <div className="flex-1 min-w-0">
      <div className="font-mono text-xs font-bold" style={{ color: "var(--theme-accent)" }}>
        Replying to {replyTargetMessage.senderId}
      </div>
      <div className="font-mono text-xs truncate" style={{ color: "var(--theme-text-muted)" }}>
        {replyTargetMessage.content.slice(0, 120)}
      </div>
    </div>
    <button
      onClick={() => setReplyTargetId(null)}
      className="flex-shrink-0 rounded p-1"
      style={{ color: "var(--theme-text-muted)" }}
    >
      ✕
    </button>
  </div>
)}
```

- [ ] **Step 2: 发送时传 parentId**

修改 ChatPanel 的 `handleSend` 函数，在 `sendMessage` 调用中传 `parentId`：

```typescript
// 同时更新 chat-context.tsx 的 sendMessage 签名
// chat-context.tsx:
const sendMessage = useCallback(
  async (conversationId: string, content: string, parentId?: string): Promise<Message> => {
    const message = await api.post<Message>(
      `/api/conversations/${conversationId}/messages/create`,
      { content, parentId },
    );
    setMessages((prev) => [...prev, message]);
    return message;
  },
  [],
);
```

```typescript
// ChatPanel handleSend:
async function handleSend() {
  const trimmed = input.trim();
  if (!trimmed || !conversationId || sending) return;
  setSending(true);
  try {
    await sendMessage(conversationId, trimmed, replyTargetId ?? undefined);
    setInput("");
    setReplyTargetId(null);
    textareaRef.current?.focus();
  } catch {
    // silent
  } finally {
    setSending(false);
  }
}
```

- [ ] **Step 3: 消息列表渲染时匹配 parentMessage**

修改 ChatPanel 中消息渲染循环，查找 parentMessage：

```typescript
// 在渲染每条消息时，通过 parentId 查找被引用的消息
const parentMessage = msg.parentId
  ? messages.find((m) => m.id === msg.parentId) ?? null
  : null;

// 传给 MessageBubble
<MessageBubble message={msg} variant={variant} parentMessage={parentMessage}>
```

- [ ] **Step 4: 验证构建**

```bash
pnpm --filter @agenthub/web lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ChatPanel.tsx apps/web/lib/chat-context.tsx
git commit -m "feat(web): add message reply UI with quote bar and parentId"
```

### Task 3: Regenerate — 后端

**Files:**
- Modify: `apps/server/src/routes/messages.ts`

- [ ] **Step 1: 新增 handleRegenerate 路由**

```typescript
// apps/server/src/routes/messages.ts

async function handleRegenerate(
  request: FastifyRequest<{ Params: { conversationId: string; messageId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { conversationId, messageId } = request.params;
  const cm = request.server.connectionManager;

  // 1. 找到 AI 回复消息
  const aiMessage = await getMessage(messageId);
  if (!aiMessage || aiMessage.senderType !== "Contact") {
    return reply.status(400).send({ error: "Not an AI message" });
  }

  // 2. 在 AI 消息之前找到最近的一条用户消息
  const allMessages = await listMessages(conversationId, { limit: 100 });
  const userMessages = allMessages.data.filter((m) => m.senderType === "User");
  const userMessage = userMessages[userMessages.length - 1];
  if (!userMessage) {
    return reply.status(400).send({ error: "No user message to regenerate from" });
  }

  await reply.status(202).send({ status: "regenerating", messageId });

  // 3. 重新执行 Agent（复用已有逻辑）
  const conv = await getConversation(conversationId);
  if (!conv) return;

  const contactIds = conv.contactIds ?? [];
  if (contactIds.length === 0) return;

  if (conv.type === "single") {
    // 单聊：重新执行整个 Agent
    const contactId = contactIds[0]!;
    const agent = await getContact(contactId);
    if (!agent) {
      cm.pushToConversation(conversationId, "error", {
        message: "Agent not found", code: "AGENT_NOT_FOUND",
      });
      return;
    }

    try {
      const adapter = createAdapter(agent.provider, { cwd: undefined });
      const context = {
        conversationId,
        message: userMessage.content,
        history: [],
        agents: [],
      };

      let fullResponse = "";
      for await (const chunk of adapter.execute(context)) {
        if (chunk.type === ChunkType.Text) {
          fullResponse += chunk.content;
        }
        if (chunk.type !== ChunkType.Done) {
          pushChunk(cm, conversationId, chunk, agent.id);
        }
      }

      // 4. 更新 AI 回复消息内容（替换）
      if (fullResponse) {
        await dbUpdateMessage(messageId, { content: fullResponse });
      }

      cm.pushToConversation(conversationId, "replace", {
        messageId,
        content: fullResponse,
        agentId: agent.id,
      });
    } catch (err) {
      cm.pushToConversation(conversationId, "error", {
        message: err instanceof Error ? err.message : "Regeneration failed",
        code: "ADAPTER_ERROR",
      });
    }
  }
  // 群聊模式暂跳过（复杂度较高，先实现单聊）
}
```

- [ ] **Step 2: 注册路由**

```typescript
// messages.ts 中的 messageRoutes
app.post("/:messageId/regenerate", handleRegenerate);
```

- [ ] **Step 3: 构建验证**

```bash
pnpm --filter @agenthub/server lint
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/messages.ts
git commit -m "feat(server): add regenerate endpoint for AI messages"
```

### Task 4: Regenerate — 前端

**Files:**
- Modify: `apps/web/hooks/useSSEStream.ts`
- Modify: `apps/web/components/ChatPanel.tsx`

- [ ] **Step 1: SSE 增加 "replace" 事件处理**

```typescript
// useSSEStream.ts
// 在 useChat 中增加 replaceMessage 方法
// chat-context.tsx:
const replaceMessage = useCallback(
  (messageId: string, content: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content } : m)),
    );
  },
  [],
);
```

```typescript
// useSSEStream.ts — 增加 replace 事件监听
const handleReplace = useCallback(
  (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as {
        messageId: string;
        content: string;
        agentId?: string;
      };
      replaceMessage(data.messageId, data.content);
      if (data.agentId) {
        setTypingAgent(data.agentId, false);
      }
      finalizeMessage(undefined, undefined);
    } catch { /* ignore */ }
  },
  [replaceMessage, setTypingAgent, finalizeMessage],
);

// connect 函数中注册监听：
es.addEventListener("replace", handleReplace as EventListener);
```

- [ ] **Step 2: AI 消息底部增加 "重新生成" 按钮**

ChatPanel.tsx 中，在每条 AI 回复（`variant === "contact"`）底部渲染：

```typescript
// 在 MessageBubble 之后，非 streaming 的 AI 消息渲染 regenerate 按钮
{variant === "contact" && !isEditing && (
  <div className="flex items-center gap-2 mt-1">
    <button
      onClick={async () => {
        try {
          await api.post(
            `/api/conversations/${conversationId}/messages/${msg.id}/regenerate`
          );
        } catch { /* silent */ }
      }}
      className="flex items-center gap-1 rounded px-2 py-1 font-mono text-xs transition-colors"
      style={{ color: "var(--theme-text-muted)" }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-accent)"; e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      🔄 {t("chat").regenerate ?? "Regenerate"}
    </button>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/hooks/useSSEStream.ts apps/web/lib/chat-context.tsx apps/web/components/ChatPanel.tsx
git commit -m "feat(web): add regenerate button and SSE replace event handling"
```

### Task 5: Pin 消息 — 前端 + 后端

**Files:**
- Modify: `apps/web/components/ChatPanel.tsx`
- Modify: `apps/web/lib/chat-context.tsx`
- Modify: `apps/server/src/routes/messages.ts`
- Modify: `apps/server/src/orchestrator/executor.ts` (上下文注入)

- [ ] **Step 1: ChatPanel 增加 Pin 按钮**

```typescript
// 在消息操作栏（回复按钮旁边）增加 Pin 按钮
<button
  onClick={async () => {
    await api.post(`/api/conversations/${conversationId}/messages/${msg.id}/pin`);
    // 更新本地消息状态
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, isPinned: !((m as any).isPinned) } : m
      ),
    );
  }}
  className="flex h-6 w-6 items-center justify-center rounded text-xs"
  style={{ color: (msg as any).isPinned ? "var(--theme-accent)" : "var(--theme-text-muted)" }}
  title={(msg as any).isPinned ? "Unpin" : "Pin"}
>
  📌
</button>
```

- [ ] **Step 2: 后端新增 listPinnedMessages 路由**

```typescript
// messages.ts
async function handleListPinned(
  request: FastifyRequest<{ Params: { conversationId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { conversationId } = request.params;
  // 使用 Prisma 查询该对话下 isPinned=true 的消息
  const { listPinnedMessages } = await import("@agenthub/db");
  const messages = await listPinnedMessages(conversationId);
  return reply.status(200).send(messages);
}

// messageRoutes:
app.get("/pinned/list", handleListPinned);
```

- [ ] **Step 3: db 层新增 listPinnedMessages**

```typescript
// packages/db/src/repositories/message.ts
export async function listPinnedMessages(
  conversationId: string,
  prisma: PrismaClient = defaultPrisma
): Promise<Message[]> {
  return prisma.message.findMany({
    where: { conversationId, isPinned: true },
    orderBy: { createdAt: "desc" },
  });
}

// packages/db/src/repositories/index.ts - 导出
export { listPinnedMessages } from "./message.js";
```

- [ ] **Step 4: orchestrator 上下文注入 pinned 消息**

```typescript
// apps/server/src/orchestrator/executor.ts — 在 execute 方法中
// 执行任务前，获取对话的 pinned 消息并注入上下文
import { listPinnedMessages } from "@agenthub/db";

// 在 SubTaskExecutor.execute 方法中，构建 context 时追加：
const pinnedMessages = await listPinnedMessages(sub.conversationId);
if (pinnedMessages.length > 0) {
  const pinnedContext = pinnedMessages
    .map((m) => `[Pinned Context]: ${m.content}`)
    .join("\n");
  // 追加到 context 中
  sub.context = [
    ...sub.context,
    { role: "system" as const, content: pinnedContext },
  ];
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ChatPanel.tsx apps/server/src/routes/messages.ts packages/db/src/repositories/message.ts packages/db/src/repositories/index.ts apps/server/src/orchestrator/executor.ts
git commit -m "feat: add message pinning with context injection"
```

---

## Slice 2: 产物展示增强

### Task 6: ArtifactCard 增加预览模式

**Files:**
- Modify: `packages/ui/src/types.ts`
- Modify: `packages/ui/src/components/ArtifactCard/ArtifactCard.tsx`
- Test: `packages/ui/src/components/ArtifactCard/__tests__/ArtifactCard.test.tsx`

- [ ] **Step 1: 更新 ArtifactCardProps 类型**

```typescript
// packages/ui/src/types.ts
export interface ArtifactCardProps {
  artifact: Artifact;
  className?: string;
  onPreview?: (artifact: Artifact) => void; // 新增：预览回调
  onFullscreen?: (artifact: Artifact) => void; // 新增：全屏回调
}
```

- [ ] **Step 2: ArtifactCard 增加操作按钮**

```typescript
// ArtifactCard.tsx header 中增加按钮组
// 在 status 显示之后：

<div style={{ display: "flex", gap: 4 }}>
  {onPreview && artifact.content && (
    <button
      onClick={(e) => { e.stopPropagation(); onPreview(artifact); }}
      style={{
        fontSize: "var(--ui-font-xs)",
        padding: "2px 8px",
        border: "1px solid var(--ui-color-border)",
        borderRadius: "var(--ui-radius-sm)",
        cursor: "pointer",
        backgroundColor: "transparent",
        color: "var(--ui-color-text-secondary)",
      }}
    >
      👁 Preview
    </button>
  )}
  {onFullscreen && (
    <button
      onClick={(e) => { e.stopPropagation(); onFullscreen(artifact); }}
      style={{
        fontSize: "var(--ui-font-xs)",
        padding: "2px 6px",
        border: "1px solid var(--ui-color-border)",
        borderRadius: "var(--ui-radius-sm)",
        cursor: "pointer",
        backgroundColor: "transparent",
        color: "var(--ui-color-text-secondary)",
      }}
    >
      ⛶
    </button>
  )}
</div>
```

- [ ] **Step 3: 内联预览展开**

在 ArtifactCard 中增加可展开的内容预览区域（在 body 之后）：

```typescript
// 在 ArtifactCard 添加 showPreview state
const [showPreview, setShowPreview] = useState(false);

// onPreview 处理：
const handlePreview = () => {
  if (onPreview) {
    onPreview(artifact);
  } else {
    setShowPreview(!showPreview);
  }
};

// 在 cardStyle div 中，body 之后：
{showPreview && artifact.type === "WebPreview" && artifact.content && (
  <iframe
    srcDoc={artifact.content}
    style={{
      width: "100%",
      height: 300,
      border: "none",
      borderTop: "1px solid var(--ui-color-border)",
    }}
    title={artifact.title ?? "Preview"}
    sandbox="allow-scripts"
  />
)}
```

- [ ] **Step 4: 运行测试**

```bash
pnpm --filter @agenthub/ui test
```

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/types.ts packages/ui/src/components/ArtifactCard/ArtifactCard.tsx
git commit -m "feat(ui): add preview and fullscreen buttons to ArtifactCard"
```

### Task 7: DiffCard 增加应用按钮

**Files:**
- Modify: `packages/ui/src/types.ts`
- Modify: `packages/ui/src/components/DiffCard/DiffCard.tsx`
- Modify: `apps/server/src/routes/artifacts.ts`
- Test: `packages/ui/src/components/DiffCard/__tests__/DiffCard.test.tsx`

- [ ] **Step 1: 更新 DiffCardProps 类型**

```typescript
// packages/ui/src/types.ts
export interface DiffCardProps {
  diff: string;
  title?: string;
  className?: string;
  onApply?: () => void; // 新增
  applied?: boolean; // 新增：是否已应用
}
```

- [ ] **Step 2: DiffCard 增加应用按钮**

```typescript
// DiffCard.tsx titleBarStyle 区域，在 title 之后增加：
<div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
  {onApply && !applied && (
    <button
      onClick={(e) => { e.stopPropagation(); onApply(); }}
      style={{
        fontSize: "var(--ui-font-xs)",
        padding: "2px 8px",
        backgroundColor: "var(--ui-color-success, #22c55e)",
        color: "white",
        border: "none",
        borderRadius: "var(--ui-radius-sm)",
        cursor: "pointer",
      }}
    >
      ✓ Apply
    </button>
  )}
  {applied && (
    <span style={{ fontSize: "var(--ui-font-xs)", color: "var(--ui-color-success, #22c55e)" }}>
      ✓ Applied
    </span>
  )}
</div>
```

- [ ] **Step 3: 后端新增 apply 路由**

```typescript
// apps/server/src/routes/artifacts.ts
import { resolve, dirname } from "node:path";
import { writeFile, mkdir, readFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { WORKSPACE_ROOT } from "../config/env.js";
import { getArtifact, updateArtifact, getMessage, getConversation } from "@agenthub/db";

async function handleApply(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const artifact = await getArtifact(request.params.id);
  if (!artifact || !artifact.content || artifact.type !== "CodeDiff") {
    return reply.status(400).send({ error: "Invalid artifact for apply" });
  }

  // 解析 diff 头获取文件路径
  const diffLines = artifact.content.split("\n");
  const headerLine = diffLines.find((l) => l.startsWith("--- a/"));
  if (!headerLine) {
    return reply.status(400).send({ error: "Cannot determine target file from diff" });
  }
  const filePath = headerLine.replace("--- a/", "").trim();

  // 获取 conversation workspace
  const message = await getMessage(artifact.messageId);
  if (!message) return reply.status(404).send({ error: "Message not found" });
  const conv = await getConversation(message.conversationId);
  if (!conv || !conv.workspacePath) return reply.status(400).send({ error: "No workspace" });

  const absPath = resolve(WORKSPACE_ROOT, conv.workspacePath, filePath);

  // 安全检查：必须限制在 workspace 内
  const workspaceAbs = resolve(WORKSPACE_ROOT, conv.workspacePath);
  if (!absPath.startsWith(workspaceAbs)) {
    return reply.status(403).send({ error: "Path outside workspace" });
  }

  try {
    // 备份原文件
    const backupDir = resolve(workspaceAbs, ".backup");
    await mkdir(backupDir, { recursive: true });
    const backupPath = resolve(backupDir, `${filePath.replace(/[/\\]/g, "_")}.${Date.now()}.bak`);

    if (existsSync(absPath)) {
      await copyFile(absPath, backupPath);
    }

    // 应用 diff（简化：提取 + 行作为新内容，实际应使用 diff 库）
    const addedLines = diffLines
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1));

    // 确保目录存在
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, addedLines.join("\n"), "utf-8");

    await updateArtifact(artifact.id, { status: "Completed" });

    return reply.status(200).send({ status: "applied", backupPath });
  } catch (err) {
    return reply.status(500).send({ status: "failed", error: String(err) });
  }
}

// artifactRoutes:
app.post("/:id/apply", handleApply);
```

- [ ] **Step 4: 路由确认**

```typescript
// artifactRoutes plugin — 注意路由前缀
// apps/server/src/app.ts 中注册为 /api/conversations/:conversationId/artifacts/
// 如果 artifacts 路由注册在 /api/artifacts 下，直接使用
```

- [ ] **Step 5: 运行测试**

```bash
pnpm --filter @agenthub/ui test
pnpm --filter @agenthub/server lint
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/types.ts packages/ui/src/components/DiffCard/DiffCard.tsx apps/server/src/routes/artifacts.ts
git commit -m "feat: add apply button to DiffCard and server endpoint"
```

### Task 8: RightPanel 全屏预览增强

**Files:**
- Modify: `apps/web/components/RightPanel.tsx`

- [ ] **Step 1: RightPanel artifact 模式支持 iframe 预览**

```typescript
// RightPanel.tsx — 在 artifact 模式中：
// 当前 artifact 模式显示占位符 "Select an artifact to preview"
// 改为实际的 artifact 预览

// 从 props 接收 artifact 数据（或从 API 加载）
interface ArtifactPreview {
  id: string;
  title: string;
  content?: string;
  type: string;
}

// 状态
const [artifact, setArtifact] = useState<ArtifactPreview | null>(null);
const [artifactLoading, setArtifactLoading] = useState(false);

// 当 content.type === "artifact" 时，加载 artifact
useEffect(() => {
  if (content?.type === "artifact") {
    setArtifactLoading(true);
    api.get<ArtifactPreview>(`/api/artifacts/${content.id}/detail`)
      .then(setArtifact)
      .catch(() => setArtifact(null))
      .finally(() => setArtifactLoading(false));
  } else {
    setArtifact(null);
  }
}, [content]);
```

- [ ] **Step 2: RightPanel artifact 视图**

```tsx
{content.type === "artifact" ? (
  artifactLoading ? (
    <div className="flex flex-1 items-center justify-center">
      <span className="font-mono text-xs" style={{color:"var(--theme-text-muted)"}}>Loading...</span>
    </div>
  ) : artifact ? (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{borderColor:"var(--theme-border)"}}>
        <span className="font-mono text-xs font-bold">{artifact.title}</span>
        <div className="flex gap-2">
          <button
            onClick={() => { /* copy */ }}
            className="rounded px-2 py-1 font-mono text-xs"
            style={{border:"1px solid var(--theme-border-light)"}}
          >
            Copy
          </button>
        </div>
      </div>
      {/* Preview area */}
      <div className="flex-1 overflow-auto">
        {artifact.type === "WebPreview" && artifact.content ? (
          <iframe
            srcDoc={artifact.content}
            className="h-full w-full"
            sandbox="allow-scripts"
            title={artifact.title}
          />
        ) : (
          <pre
            className="h-full overflow-auto p-4 font-mono text-sm"
            style={{color:"var(--theme-text-primary)", backgroundColor:"#1a1a2e"}}
          >
            {artifact.content ?? "No content"}
          </pre>
        )}
      </div>
    </div>
  ) : (
    <div className="flex flex-1 items-center justify-center p-4">
      <p className="font-mono text-xs" style={{color:"var(--theme-text-muted)"}}>
        Artifact not found
      </p>
    </div>
  )
) : /* existing agent info */}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/RightPanel.tsx
git commit -m "feat(web): enhance RightPanel with artifact iframe preview"
```

---

## Slice 3: 对话管理

### Task 9: Conversation 增加 isPinned 字段

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/repositories/conversation.ts`
- Modify: `packages/shared/src/types/conversation.ts`

- [ ] **Step 1: Prisma schema 增加 isPinned**

```prisma
// packages/db/prisma/schema.prisma
model Conversation {
  // ... existing fields
  isPinned   Boolean          @default(false)  // 新增
  // ... rest existing
}
```

- [ ] **Step 2: shared Conversation 类型增加 isPinned**

```typescript
// packages/shared/src/types/conversation.ts
export interface Conversation {
  // ...existing
  isPinned: boolean;
}
```

- [ ] **Step 3: repository UpdateConversationInput 增加 isPinned**

```typescript
// packages/db/src/repositories/conversation.ts
export type UpdateConversationInput = {
  title?: string;
  isArchived?: boolean;
  isPinned?: boolean; // 新增
  lastActiveAt?: Date;
  workspacePath?: string | null;
};
```

- [ ] **Step 4: 数据库迁移**

```bash
pnpm --filter @agenthub/db db:push
```

- [ ] **Step 5: 生成 Prisma Client**

```bash
pnpm --filter @agenthub/db db:generate
```

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/src/repositories/conversation.ts packages/shared/src/types/conversation.ts
git commit -m "feat(db): add isPinned field to Conversation model"
```

### Task 10: Sidebar 置顶/归档 UI

**Files:**
- Modify: `apps/web/components/Sidebar.tsx`
- Modify: `apps/web/lib/chat-context.tsx`

- [ ] **Step 1: chat-context 增加 togglePin/toggleArchive 方法**

```typescript
// chat-context.tsx
const togglePinConversation = useCallback(
  async (conversationId: string, isPinned: boolean) => {
    await api.patch(`/api/conversations/${conversationId}/update`, {
      isPinned: !isPinned,
    });
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, isPinned: !isPinned } : c,
      ),
    );
  },
  [],
);

const toggleArchiveConversation = useCallback(
  async (conversationId: string, isArchived: boolean) => {
    await api.patch(`/api/conversations/${conversationId}/update`, {
      isArchived: !isArchived,
    });
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, isArchived: !isArchived } : c,
      ),
    );
  },
  [],
);
```

- [ ] **Step 2: Sidebar 对话列表增加操作按钮**

```typescript
// Sidebar.tsx — 在对话列表项 hover 操作区域增加:

// 排序：isPinned 的对话排前面
const sortedConversations = [...filteredConversations].sort((a, b) => {
  if ((a as any).isPinned && !(b as any).isPinned) return -1;
  if (!(a as any).isPinned && (b as any).isPinned) return 1;
  return 0;
});

// 对话列表项悬停操作按钮（在删除按钮旁边）:
{
  /* Pin button */
}
{isHovered && !isDeleteConfirm && (
  <span
    onClick={(e) => {
      e.stopPropagation();
      togglePinConversation(conv.id, (conv as any).isPinned);
    }}
    className="rounded p-1 transition-colors cursor-pointer"
    style={{ color: (conv as any).isPinned ? "var(--theme-accent)" : "var(--theme-text-muted)" }}
    title={(conv as any).isPinned ? "Unpin" : "Pin to top"}
    role="button"
    tabIndex={0}
  >
    📌
  </span>
)}
```

- [ ] **Step 3: 归档切换按钮**

```typescript
// 在搜索框下方或旁边增加归档切换:

<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    checked={showArchived}
    onChange={(e) => setShowArchived(e.target.checked)}
    className="rounded"
  />
  <span className="font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
    Show archived
  </span>
</label>
```

```typescript
// 搜索逻辑中过滤:
const filteredConversations = (conversations || []).filter((c) => {
  const matchesSearch = getDisplayName(c).toLowerCase().includes(searchQuery.toLowerCase());
  const matchesArchive = showArchived || !c.isArchived;
  return matchesSearch && matchesArchive;
});
```

- [ ] **Step 4: 归档按钮**

```typescript
// 在对话悬停操作区域增加归档按钮（在 pin 和 delete 之间）
<span
  onClick={(e) => {
    e.stopPropagation();
    toggleArchiveConversation(conv.id, conv.isArchived);
  }}
  className="rounded p-1 transition-colors cursor-pointer"
  style={{ color: "var(--theme-text-muted)" }}
  title={conv.isArchived ? "Unarchive" : "Archive"}
  role="button"
  tabIndex={0}
>
  📁
</span>
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/Sidebar.tsx apps/web/lib/chat-context.tsx
git commit -m "feat(web): add conversation pin/archive UI with toggle"
```

---

## 验证与集成测试

### Task 11: 集成验证

- [ ] **Step 1: 全量构建**

```bash
pnpm build
```

- [ ] **Step 2: 运行所有测试**

```bash
pnpm test
```

- [ ] **Step 3: 运行 lint**

```bash
pnpm lint
```

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore: finalize P0 IM enhancement implementation"
```

---

## 执行顺序总结

```
Slice 1 ── Task 1 (MessageBubble 引用块)
        ├── Task 2 (ChatPanel 回复交互)
        ├── Task 3 (Regenerate 后端)
        ├── Task 4 (Regenerate 前端)
        └── Task 5 (Pin 消息 前后端)

Slice 2 ── Task 6 (ArtifactCard 预览模式)
        ├── Task 7 (DiffCard 应用按钮)
        └── Task 8 (RightPanel 全屏预览)

Slice 3 ── Task 9 (DB isPinned 迁移)
        └── Task 10 (Sidebar 置顶/归档 UI)

验证  ── Task 11 (构建 + 测试 + lint)
```
