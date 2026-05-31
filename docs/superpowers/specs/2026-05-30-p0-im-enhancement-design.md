# P0 IM 体验增强设计

## 概述

补全赛题要求的 P0 核心 IM 功能，采用垂直切片方案分 3 个 Slice 实施：

| Slice   | 功能                  | 目标           |
| ------- | ------------------- | ------------ |
| Slice 1 | 消息回复/引用、重新生成、Pin 消息 | 补全消息交互闭环     |
| Slice 2 | 产物内联预览、全屏展开、Diff 应用 | Agent 产物消费体验 |
| Slice 3 | 对话置顶/归档             | 对话管理         |

***

## Slice 1: 消息交互增强

### 1.1 消息回复/引用

**现有基础：**

- Message 表已有 `parentId` 自引用字段
- 前端已有 `MessageBubble` 组件

**前端改动：**

| 文件                           | 改动                                            |
| ---------------------------- | --------------------------------------------- |
| `ChatPanel.tsx`              | 消息悬停时显示 "回复" 按钮；点击后输入框上方显示引用条；发送时传 `parentId` |
| `MessageBubble` (ui package) | 检测 `parentId` 时在消息顶部渲染引用块（被引用消息预览）            |

**交互流程：**

1. 鼠标悬停消息 → 在每个消息右侧浮现操作栏（回复 + Pin）
2. 点击回复 → 输入框上方出现引用条（"回复 @AgentName: 消息预览" + ✕ 取消）
3. 发送 → POST `/messages/create` 时携带 `parentId`
4. 渲染 → 有 `parentId` 的消息顶部显示引用块（灰底 + 原文预览）

**数据流：**

```
User 点击回复 → set replyTargetId state → 引用条显示
User 输入内容发送 → POST body: { content, parentId: replyTargetId }
后端存储 parentId → 前端从消息列表获取被引用消息 → 渲染引用块
```

**API：** 已有 `POST /messages/create` 支持 `parentId` 字段，无需新增路由。

### 1.2 重新生成 (Regenerate)

**交互流程：**

1. 每条 AI 回复底部显示 "🔄 重新生成" 按钮
2. 点击 → 读取该消息对应的用户原始输入 → 重新执行 Agent
3. Agent 执行完成后 → **替换**当前 AI 回复消息的内容
4. 生成过程中显示 streaming 状态（复用现有 SSE 机制）

**关键逻辑：**

- 单聊模式：找到这条 AI 回复之前的用户消息，用同样的内容重新请求 Agent
- 群聊模式：只重新生成该 Agent 的部分，其他 Agent 回复保留
- 实现方式：新增 `POST /messages/:messageId/regenerate` 路由

**后端改动：**

| 文件                            | 改动                                                  |
| ----------------------------- | --------------------------------------------------- |
| `messages.ts` (server routes) | 新增 `handleRegenerate` — 找到前一条用户消息，重新执行 Agent，更新当前消息 |

**API：**

```
POST /api/conversations/:conversationId/messages/:messageId/regenerate
Response: { status: "regenerating", messageId }
SSE event: "chunk" (复用) → "done" → 前端替换消息内容
```

### 1.3 Pin 消息

**现有基础：**

- 已有 `POST /messages/:messageId/pin` 路由
- 已有 `pinMessage` repository

**前端改动：**

| 文件              | 改动                            |
| --------------- | ----------------------------- |
| `ChatPanel.tsx` | 消息悬停操作栏增加 Pin 按钮；Pin 状态显示     |
| `Sidebar.tsx`   | 增加 "Pinned Messages" 面板（可选折叠） |

**交互流程：**

1. 消息悬停 → 点击 📌 Pin 按钮 → 消息标记为已 Pin（显示 Pin 图标）
2. 被 Pin 的消息进入 Pin 列表（可在侧边栏或右侧面板查看）
3. 发送消息给 Agent 时，被 Pin 的消息追加到 System Prompt 或上下文中

**API：** 已有 `POST /messages/:messageId/pin`，可能需要增加 `GET /conversations/:id/pinned-messages`。

**上下文注入：**

```
每次 Agent 执行时（runAgentExecution / runOrchestration）：
  1. 查询该对话下所有 pinned=true 的消息
  2. 格式化为 "[Pinned Context] 消息内容"
  3. 追加到 Agent 的 system prompt 或 context 中
```

***

## Slice 2: 产物展示增强

### 2.1 内联预览

**现状：** ArtifactCard 仅显示文件名和状态，无实际渲染。 

**改动：**

- ArtifactCard 增加 "预览" 按钮 → 点击后在卡片内部展开 iframe
- iframe srcdoc = Artifact 的内容（HTML）
- 适用于：HTML 页面、SVG、渲染后的 Markdown 文档

**组件改动：**

| 文件                          | 改动                                  |
| --------------------------- | ----------------------------------- |
| `ArtifactCard` (ui package) | 新增 `preview` mode，expandable iframe |
| `RightPanel.tsx`            | 增强 artifact 视图，支持 iframe 渲染         |

### 2.2 全屏展开

- ArtifactCard / DiffCard 增加 ⛶ 按钮 → 在 RightPanel 中全屏展示
- RightPanel artifact 模式支持：
  - iframe 预览（HTML）
  - 代码高亮编辑器（只读）
  - 复制代码 / 下载文件

### 2.3 Diff 视图 + 一键应用

**现状：** DiffCard 组件存在，但无 "应用" 功能。

**改动：**

| 文件                           | 改动                                |
| ---------------------------- | --------------------------------- |
| `DiffCard` (ui package)      | 增加 "应用" 按钮 + "已应用" 状态             |
| server routes (artifacts.ts) | 新增 `POST /artifacts/:id/apply` 路由 |

**交互：**

1. Agent 回复中包含 Diff → DiffCard 显示变更内容
2. 用户点击 "✓ 应用" → 后端将 diff 写入对应文件
3. 自动备份原文件到 `.backup/`
4. 返回结果 → DiffCard 显示 "已应用" 状态
5. 应用失败 → 显示错误，提供回滚选项

**API：**

```
POST /api/conversations/:conversationId/artifacts/:artifactId/apply
Response: { status: "applied" | "failed", backupPath?: string, error?: string }
```

***

## Slice 3: 对话管理

### 3.1 对话置顶

**现有基础：** Contact 有 `isPinned` 字段，Conversation 无。需要新增。

**后端改动：**

| 文件                           | 改动                             |
| ---------------------------- | ------------------------------ |
| Prisma schema                | Conversation 表新增 `isPinned` 字段 |
| `conversation.ts` repository | updateConversation 支持 isPinned |
| `conversations.ts` routes    | 已有 PATCH 路由，无需新增               |

**前端改动：**

| 文件            | 改动                              |
| ------------- | ------------------------------- |
| `Sidebar.tsx` | 悬停对话时显示 Pin 图标；已 Pin 的对话固定在列表顶部 |

### 3.2 对话归档

**现有基础：** Conversation 已有 `isArchived` 字段，API 支持 `includeArchived` 查询参数。

**前端改动：**

| 文件            | 改动                          |
| ------------- | --------------------------- |
| `Sidebar.tsx` | 悬停对话时显示归档图标；搜索栏增加 "归档" 切换按钮 |

**交互：**

1. 对话悬停 → 归档图标（📁）
2. 归档后对话从主列表消失
3. 搜索栏增加 toggle: "显示归档对话"
4. 归档对话列表中可取消归档

***

## API 变更汇总

| 方法      | 路由                                   | 状态            | 用途           |
| ------- | ------------------------------------ | ------------- | ------------ |
| `POST`  | `/messages/:messageId/regenerate`    | **新增**        | 重新生成 AI 回复   |
| `POST`  | `/artifacts/:artifactId/apply`       | **新增**        | 应用 Diff      |
| `GET`   | `/conversations/:id/pinned-messages` | **新增**        | 获取已 Pin 消息列表 |
| `POST`  | `/messages/create`                   | 已有 (parentId) | 回复消息         |
| `POST`  | `/messages/:messageId/pin`           | 已有            | Pin 消息       |
| `PATCH` | `/conversations/:id/update`          | 已有 (isPinned) | 置顶对话         |

## 数据库变更

```prisma
model Conversation {
  // ... existing fields
  isPinned Boolean @default(false)  // 新增
}
```

***

## 风险与注意事项

1. **Regenerate 的群聊语义：** 群聊中重新生成单个 Agent 回复时，其他 Agent 不应受影响。实现时要确保只替换目标消息。
2. **Pin 消息的上下文注入：** 要控制 Pin 消息的数量上限（建议 10 条），避免 Agent 上下文过长。到达上限时提示用户取消旧的 Pin。
3. **Diff 应用的文件安全：** 写入文件前自动备份原文件；更新文件路径应限制在 workspace 范围内，防止路径穿越。
4. **回复引用的消息同步：** 引用的消息如果被删除，引用块应显示 "消息已删除" 占位。

