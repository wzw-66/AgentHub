## Context

当前系统使用 Contact 模型承载 Agent 概念（无独立 Agent 表）。Conversation 模型已支持 `type: "single" | "group"` 枚举，但 UI 层只使用了单聊。消息通过 SSE 流式推送，但 SSE endpoint 使用 `reply.raw.writeHead()` 绕过了 Fastify 的 CORS 插件，导致跨域连接失败。Agent 详情页创建对话时发送了错误的字段名 `agentIds`（后端期望 `contactIds`），导致 agentId 丢失，消息执行链路空转。

## Goals / Non-Goals

**Goals:**
- Start Chat 时查重，已有单聊则复用而非新建
- Sidebar New Chat 支持群聊模式（多选 agent）
- Sidebar 列表和 ChatPanel 头部用图标/标签区分单聊和群聊
- SSE 流式连接添加 CORS 头，修复跨域问题
- 修复 Agent 详情页 `agentIds` → `contactIds` 参数名
- 最后一条用户消息 hover 显示编辑/删除按钮，点击进入 textarea 编辑态
- Agent 详情页增加 Edit 按钮，弹窗编辑 name 和 systemPrompt

**Non-Goals:**
- 不涉及富文本编辑器（不支持 markdown 工具栏、斜杠命令等）
- 不涉及消息的重新执行（编辑已回复消息不自动重跑 agent）
- 不涉及 group chat 的编排逻辑改造（已有 `runOrchestration` 保持不变）
- 不涉及文件上传/图片消息

## Decisions

### Decision 1: 单聊查重

新增一个轻量查询 endpoint 而非在创建时隐式去重，保持 REST 语义清晰。

```typescript
// GET /api/conversations/find-by-agent/:agentId
// 返回 { conversation: Conversation | null }
// 后端查：type="single", ownerId=当前用户, contactIds 包含 agentId, isArchived=false, 按 lastActiveAt DESC 取最新
```

前端流程：
```
Start Chat → GET find-by-agent/:agentId
  → 有结果 → router.push 到已有对话
  → 无结果 → POST conversations/create → router.push 到新对话
```

### Decision 2: 群聊创建入口

Sidebar New Chat 弹窗增加模式切换：

| 模式 | 选择方式 | 创建时 type |
|---|---|---|
| 单聊（默认） | 点击单个 agent | `"single"`，contactIds=[agentId] |
| 群聊 | 勾选多个 agent（≥3） | `"group"`，contactIds=[id1, id2, id3, ...] |

前端用多选框（checkbox）代替当前的单选按钮。单聊模式限制只能选 1 个，群聊模式至少选 3 个。

### Decision 3: SSE CORS 修复

不需要引入新依赖。在 SSE endpoint 的 `writeHead` 中直接添加 CORS 头：

```typescript
reply.raw.writeHead(200, {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": request.headers.origin ?? "*",
  "Access-Control-Allow-Credentials": "true",
});
```

同时在 SSE 路由插件中注册 `OPTIONS` handler 处理预检请求。

### Decision 4: agentIds → contactIds 修复

单行修复：`apps/web/app/(market)/agents/[id]/page.tsx` 第 62 行改 `agentIds` 为 `contactIds`。

> 此外，`RightPanel.tsx` 中的 `startChat` 函数使用 `contactIds`（已正确），`Sidebar.tsx` 中的 `handleCreateConversation` 也正确，仅 Agent 详情页使用了错误字段名。

### Decision 5: 消息编辑/删除

仅在最后一条用户消息（`messages[messages.length-1]` 且 `senderType === "user"`）显示 hover 操作。

编辑态：
- 点击编辑 → 该消息内容替换为 textarea + [保存][取消] 按钮
- 保存 → `PATCH /api/conversations/:convId/messages/:msgId/update` 更新 content
- 取消 → 恢复显示

删除：
- 点击删除 → `DELETE /api/conversations/:convId/messages/:msgId/delete`
- 成功后从本地 messages 数组中移除

### Decision 6: Agent 编辑弹窗

复用 `CreateAgentModal` 的 UI 布局，支持传入 `initialData` prop 进入编辑模式：

- **可编辑字段**：name、systemPrompt
- **只读展示**：provider（不可改）、model（如适用）
- 保存调用 `PATCH /api/contacts/:id/update`
- Provider 不可修改，因为涉及 adapter 类型切换，风险不可控

## Risks / Trade-offs

- **[消息编辑时效性]** 只允许编辑最后一条用户消息，无法编辑更早的消息或 agent 的回复 → **Mitigation:** MVP 先满足"撤回/修改上一条"的核心需求，后续可扩展
- **[群聊功能门槛]** 群聊功能底层已有但未经过充分测试（orchestrator 路径） → **Mitigation:** 本次只做 UI 创建入口和视觉区分，不修改编排逻辑
- **[Provider 不可改]** 用户如果选错 provider 只能删除重建 → **Mitigation:** 创建时已有明确的分段选择器提示，删除重建成本低（1 次点击）
