# AgentHub 产品设计文档

## 1. 项目概述

AgentHub 是一个多 Agent 协作平台，以 IM 聊天为核心交互范式。用户像使用飞书/微信一样，通过聊天会话与不同 AI Agent 进行交互。

### 核心能力

- **单聊模式**：1v1 与单个 Agent 对话
- **群聊模式**：多 Agent 由 Orchestrator 协调分工，并行/串行分派任务
- **产物预览**：代码 Diff、网页、文档等富媒体内联展示
- **Agent 接入**：统一适配器层接入外部 Agent 平台 + 用户自建 Agent

### 技术选型

| 项目 | 选择 |
|---|---|
| 前端框架 | Next.js (App Router) |
| 后端框架 | Fastify (Node.js/TypeScript) |
| 数据库 | PostgreSQL + Prisma ORM |
| 实时通信 | SSE（流式输出）+ WebSocket（双向消息） |
| Monorepo 工具 | Turborepo |
| 桌面端 | Electron (P2) |
| 移动端 | PWA，由 apps/web 内置 (P2) |
| 测试框架 | Vitest + Playwright |

---

## 2. 项目结构

```
AgentHub/
├── apps/
│   ├── web/           # Next.js App Router — Web 主端 + PWA（移动端）
│   ├── desktop/       # Electron — 桌面端（P2）
│   └── server/        # Fastify — API + WS/SSE + Orchestrator
│
├── packages/
│   ├── shared/        # 类型定义、枚举、DTO
│   ├── db/            # Prisma schema + 数据库客户端
│   ├── agent-core/    # 统一适配器层
│   └── ui/            # 共享 UI 组件库
│
├── tooling/
│   ├── eslint-config/
│   └── tsconfig/
│
└── turbo.json
```

### 各包职责

| 包 | 职责 | 依赖 |
|---|---|---|
| `shared` | DTO 类型、消息类型枚举、Agent 能力定义、API 契约 | 无 |
| `db` | Prisma schema、迁移、seed、数据库 CRUD 封装 | `shared` |
| `agent-core` | Agent 抽象接口、Claude Code/OpenCode/自建 Agent 实现 | `shared` |
| `ui` | 消息气泡、Diff 卡片、预览卡片、Agent 头像等纯组件 | `shared` |
| `server` | REST API、WebSocket、SSE、Orchestrator、认证 | `db`, `agent-core`, `shared` |
| `web` | Next.js 前端页面和交互 | `shared`, `ui` |

### 多端架构

```
                    apps/server
                 （唯一业务后端）
                 /    |        \
          REST/SSE/WS  WS    REST/SSE/WS
            /           |          \
       apps/web    apps/desktop  apps/mobile(PWA)
       (浏览器)   (Electron)     (浏览器)
```

- **Web**：主力端，完整 IM 体验 + 代码编辑。响应式设计覆盖移动端浏览器。
- **Desktop**：Electron 包装，本地文件访问、系统通知、Agent 进程管理。Renderer 与 Main Process 通过 Electron IPC 通信，Main Process 通过 WebSocket 连接 Server。
- **Mobile (PWA)**：复用 `apps/web` 的响应式 UI，通过 manifest.json + Service Worker 提供离线缓存和"添加到主屏幕"体验。

---

## 3. 运行时架构

```
                          apps/server
                   ┌─────────────────────┐
  ┌─────────┐      │   REST API          │
  │  web    │──────│   (auth, CRUD)      │
  │(Next.js)│      │                     │      ┌──────────────┐
  └─────────┘      │   SSE Manager       │      │  agent-core  │
        │          │   (流式 Agent 输出)   │──────│  (适配器层)   │
  ┌─────────┐      │                     │      └──────────────┘
  │ desktop │      │   WS Gateway        │             │
  │(Electron)│────│   (双向消息/状态)     │     ┌───────┴───────┐
  └─────────┘      │                     │     │ Claude  OpenCode│
                   │   Orchestrator      │     │  API     CLI    │
  ┌─────────┐      │   (任务拆解/调度)     │     └───────────────┘
  │mobile(PWA)────│                     │
  └─────────┘      └─────────────────────┘
```

### 单聊消息链路

1. 用户发送消息 → `POST /api/conversations/:id/messages`
2. server 存入消息 (db) → 路由到 agent-core → 调用对应 Agent
3. Agent 流式返回 → SSE 推送 chunk 到前端 → 消息气泡逐字展开
4. Agent 完成后 → 检查产物 → 附上预览卡片 → WS 推送最终消息状态

### 群聊消息链路

1. 用户发送消息 @多个Agent → `POST /api/conversations/:id/messages`
2. Orchestrator 分析意图 → 拆解为独立子任务
3. 无依赖的子任务并行分派到 agent-core，同时调用多个 Agent
4. 多个 Agent 并行执行，各自通过 SSE 流式输出（前端多气泡同时展开）
5. 有依赖的子任务等待前置完成后执行
6. 全部完成后 → Orchestrator 聚合结果 → WS 推送汇总卡片

### Orchestrator 调度策略

| 场景 | 行为 |
|---|---|
| 两个独立子任务 | 并行分发，各自 SSE 流式输出 |
| 子任务有依赖 | 依赖链串行，无依赖的并行 |
| 某个 Agent 失败 | 降级：重试一次 → 失败则跳过，其他继续 |

---

## 4. 数据库模型

```
User (id, name, email, passwordHash, avatarUrl)
 │
 ├──→ Conversation (id, title, type, ownerId, contactIds[], isArchived)
 │         │
 │         └──→ Message (id, conversationId, senderType, senderId,
 │         │             type, content, parentId, isPinned, metadata)
 │         │
 │         └──→ Artifact (id, messageId, type, url, content, previewUrl, status)
 │
 ├──→ Contact (userId, agentId, displayName, tags[], isPinned)
 │
 ├──→ UserCredential (userId, provider, encryptedKey)
 │
 └──→ Agent (id, name, avatarUrl, provider, systemPrompt, model, config)
```

### 关键表说明

- **User**：平台用户，邮箱注册登录
- **Agent**：Agent 定义。`provider` 标识底层 LLM，`systemPrompt` 为自定义 Agent 的人格 prompt，内置 Agent 此项为空
- **Contact**：用户在联系人列表中对 Agent 的个性化展示（自定义名称、标签、置顶）。用户与 Agent 多对多
- **Conversation**：`type` 枚举 (single/group)。`contactIds` 为参与者 Contact ID 数组（PostgreSQL 原生数组字段）。单聊含一个 ID，群聊含多个
- **Message**：`senderType` 枚举 (user/contact/system)，`senderId` 对应发送方。`type` 枚举 (text/code/diff/preview/artifact)。`parentId` 自引用实现引用回复
- **Artifact**：Agent 产出物，`type` 枚举 (webpage/code/document)，`status` 枚举 (building/done/failed)
- **UserCredential**：用户保存的外部 API Key（如 Anthropic API Key），加密存储

### 自定义 Agent

用户创建自定义 Agent 只需提供名称和 System Prompt，底层复用 agent-core 的通用 LLM 适配器。不需要额外 harness 或插件系统。

---

## 5. Agent 适配器层 API

```typescript
interface Chunk {
  type: 'text' | 'code' | 'tool_call' | 'artifact' | 'error' | 'done';
  content: string;
  metadata?: {
    language?: string;
    artifactUrl?: string;
    toolName?: string;
  };
}

interface AgentContext {
  systemPrompt: string;
  messages: { role: string; content: string }[];
  pinnedMessages?: { role: string; content: string }[];
}

interface AgentAdapter {
  readonly agentId: string;
  readonly provider: string;

  execute(
    context: AgentContext,
    credential: { apiKey: string },
    options?: { maxTokens?: number; temperature?: number }
  ): AsyncIterator<Chunk>;

  abort(): Promise<void>;
  healthCheck(): Promise<{ available: boolean; latency: number }>;
}
```

### 具体实现

| 实现类 | 通信方式 | 说明 |
|---|---|---|
| `ClaudeAdapter` | Anthropic API (HTTP SSE) | 透传请求，直接返回流 |
| `OpenCodeAdapter` | CLI 子进程 (spawn) | stdout 逐行解析成 Chunk |
| `CustomAgentAdapter` | 用户配置 endpoint + LLM API | 用户自带 endpoint + key |

---

## 6. REST API 路由

```
/auth
  POST /register           # 注册
  POST /login              # 登录，返回 JWT
  POST /refresh            # 刷新 token

/agents
  GET /                    # Agent 列表（内置 + 自建）
  POST /                   # 创建自定义 Agent
  GET /:id                 # Agent 详情

/contacts
  GET /                    # 我的联系人列表
  POST /                   # 添加联系人
  PATCH /:id               # 修改展示名/标签/置顶
  DELETE /:id              # 删除联系人

/conversations
  GET /                    # 我的会话列表
  POST /                   # 新建会话
  GET /:id                 # 会话详情 + 最近消息
  PATCH /:id               # 修改标题/归档
  DELETE /:id              # 删除会话

/conversations/:id/messages
  GET /                    # 消息列表（分页）
  POST /                   # 发送消息 → 触发 Agent，返回 SSE stream
  POST /:messageId/pin     # Pin 消息
  POST /:messageId/reply   # 引用回复

/artifacts
  GET /:id                 # 产物详情
  GET /:id/preview         # 产物预览

/credentials
  GET /                    # 我保存的 API Key 列表
  POST /                   # 添加 API Key
  DELETE /:id              # 删除 API Key
```

---

## 7. 实时通信协议

### SSE（Agent 流式输出）

```
GET /sse/conversations/:id/stream?token=jwt

event: chunk
data: {"type":"text","content":"..."}

event: chunk
data: {"type":"code","content":"...","metadata":{"language":"tsx"}}

event: chunk
data: {"type":"artifact","content":"","metadata":{"artifactUrl":"/artifacts/1/preview"}}

event: done
data: {"tokens": 1234, "cost": 0.01}
```

### WebSocket（双向消息）

```
ws://host/ws?token=jwt

→ { "type": "ping" }
→ { "type": "typing", "conversationId": "x", "isTyping": true }

← { "type": "message_status", "messageId": "x", "status": "delivered" }
← { "type": "agent_typing", "conversationId": "x", "agentName": "Claude" }
← { "type": "online", "users": ["u1", "u2"] }
← { "type": "notification", "content": "群聊任务完成" }
```

---

## 8. 认证方案

JWT 双 token 方案：

- 注册/登录 → 返回 `accessToken`(15min) + `refreshToken`(7d)
- API 请求 → `Authorization: Bearer accessToken`
- accessToken 过期 → `POST /auth/refresh` → 新 accessToken
- SSE/WS 连接 → 连接时通过 query param 传 token，server 验证后建立连接

---

## 9. Web 前端设计

### 路由

```
/login                    # 登录页
/register                 # 注册页
/chat                     # IM 主界面（需登录）
/chat/:conversationId     # 具体会话
/agents                   # Agent 市场
/agents/:id               # Agent 详情
/settings                 # 用户设置
/settings/credentials     # API Key 管理
```

### IM 主界面布局（三栏）

```
┌──────────┬────────────────────────┬─────────────┐
│ 左侧栏    │ 中间聊天区              │ 右侧面板     │
│ (w-72)   │                       │ (按需展开)   │
│          │                       │             │
│ 搜索框    │ 消息列表               │ 产物全屏预览  │
│          │  ┌──────────────┐     │ 代码编辑器   │
│ 会话列表  │  │ User: xxx    │     │ Agent 详情   │
│ ├ 张三    │  │ Agent: yyy  │     │             │
│ ├ AgentA │  │ (卡片)       │     │             │
│ └ 群聊1  │  └──────────────┘     │             │
│          │                       │             │
│ 新建按钮  │ 输入框                 │             │
└──────────┴────────────────────────┴─────────────┘
```

### 核心组件树

```
ChatLayout
├── Sidebar
│   ├── UserInfo (头像 + 设置入口)
│   ├── SearchBar
│   ├── ConversationList
│   │   └── ConversationItem (头像、名称、最后消息、未读数)
│   └── NewChatButton
│
├── ChatPanel
│   ├── ChatHeader (对方名称/群名 + @成员列表)
│   ├── MessageList
│   │   ├── MessageBubble (senderType 决定气泡样式)
│   │   │   ├── TextContent
│   │   │   ├── CodeBlock (语法高亮 + 复制)
│   │   │   ├── DiffCard (diff2html)
│   │   │   ├── PreviewCard (iframe 缩略图)
│   │   │   └── ArtifactCard
│   │   └── TypingIndicator
│   └── ChatInput
│       ├── TextArea
│       ├── @MentionPopover (群聊时 @ Agent)
│       └── SendButton
│
└── RightPanel (按需)
    ├── ArtifactFullPreview (iframe 全屏)
    ├── CodeEditor (Monaco Editor)
    └── AgentInfoPanel
```

---

## 10. 产物预览 & 部署 (P2)

### 产物预览流程

```
Agent 产出代码/网页
  → server 写入 Artifact 记录
  → 如果是网页：生成预览 URL
      ├── 静态 HTML → 写入本地临时目录 → server serve
      └── 复杂项目 → sandpack 浏览器端打包
  → SSE 推送 artifact chunk
  → 前端渲染 PreviewCard（iframe 内嵌）
  → 点击展开 → RightPanel 全屏预览 / Monaco 编辑
```

### 部署流程 (P2)

```
用户发送 "部署" → Agent 执行部署 → 返回部署状态卡片
  ├── 静态站点 → 本地 serve 预览
  ├── 容器 → 生成 Dockerfile
  └── 打包下载 → 生成 zip 下载链接
```

---

## 11. 测试策略

| 层级 | 工具 | 覆盖范围 |
|---|---|---|
| 单元测试 | Vitest | shared、agent-core、server 业务逻辑 |
| API 测试 | Vitest + supertest | REST 路由、中间件 |
| 组件测试 | Vitest + React Testing Library | UI 组件、交互行为 |
| E2E | Playwright | 核心用户流程（登录→发消息→Agent 回复） |
