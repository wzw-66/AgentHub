# AgentHub

多 Agent 协作平台 — 以 IM 聊天为核心交互范式，用户通过对话与 AI Agent（Claude、OpenCode、自定义）协作。

## Current Status

| Package | Status | Description |
|---------|--------|-------------|
| `@agenthub/shared` | ✅ Done | Type definitions, enums, DTOs — zero runtime deps |
| `@agenthub/db` | ✅ Done | Prisma schema, CRUD repositories, seed data |
| `@agenthub/agent-core` | ✅ Done | Agent adapter layer (Claude CLI, OpenCode CLI, custom LLM) |
| `@agenthub/server` | ✅ Done | Fastify 5 REST API + JWT 双 token 认证 + SSE/WS |
| `@agenthub/ui` | ✅ Done | Shared React components (MessageBubble, ArtifactCard, etc.) |
| `@agenthub/web` | ✅ Done | Next.js 14 chat UI with Tailwind CSS |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) 9.15.4
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Generate Prisma Client (首次启动或 schema 变更后需要)
pnpm db:generate

# 3. Start PostgreSQL
docker compose up -d

# 4. Push database schema
pnpm --filter @agenthub/db db:push

# 5. (Optional) Seed demo data
pnpm --filter @agenthub/db db:seed

# 6. Build all packages
pnpm build

# 7. Run tests
pnpm test
```

### Run Project

```bash
# Development mode — starts all packages in watch mode (Turbo)
pnpm dev

# Or start individual packages separately:
pnpm --filter @agenthub/web dev        # Web app (default: http://localhost:3002)
pnpm --filter @agenthub/server dev     # API server (default: http://localhost:8124)

# Production build (all packages)
pnpm build

# Start production server
pnpm --filter @agenthub/server start
```

## Project Architecture

```
AgentHub/
├── apps/
│   ├── server/              # [✅] Fastify REST API + JWT 认证 + 编排器
│   └── web/                 # [✅] Next.js IM 聊天界面
├── packages/
│   ├── shared/              # [✅] 共享类型、枚举、DTO
│   ├── db/                  # [✅] Prisma schema、CRUD 仓储、seed
│   ├── agent-core/          # [✅] Agent 适配器层（Claude / OpenCode / 自定义）
│   └── ui/                  # [✅] 共享 React 组件库
├── tooling/
│   ├── eslint-config/       # ESLint 共享配置
│   └── tsconfig/            # TypeScript 共享配置
├── docs/                    # 设计文档与技术详解
├── openspec/                # OpenSpec 变更管理
├── docker-compose.yaml      # PostgreSQL 16 容器
├── turbo.json               # Turborepo 任务编排
└── pnpm-workspace.yaml      # pnpm 工作空间
```

### Package Dependency

```
@agenthub/shared  (zero deps)
       │
       ├──→ @agenthub/db           (shared + Prisma)
       ├──→ @agenthub/agent-core   (shared only)
       ├──→ @agenthub/ui           (shared + React)
       │
       ├──→ @agenthub/server       (shared + db + agent-core + Fastify)
       └──→ @agenthub/web          (shared + ui + Next.js)
```

### Tech Stack

| Category | Choice |
|----------|--------|
| Monorepo | Turborepo + pnpm workspaces |
| Language | TypeScript 6.0.3 (strict mode) |
| Frontend | Next.js 14 + React 18 + Tailwind CSS |
| UI Components | Radix UI + Prism React Renderer |
| Backend | Fastify 5 + JWT + bcryptjs |
| Real-time | SSE (Stream) + WebSocket (Presence/Status) |
| Database | PostgreSQL 16 + Prisma ORM 6 |
| Building | tsup / Next.js Build |
| Testing | Vitest + Testing Library |
| Container | Docker Compose |

## Core Features

### 1. Orchestrator (编排器)

Orchestrator 是系统的核心调度模块，负责处理复杂的多 Agent 任务：

| 阶段 | 模块 | 说明 |
|------|------|------|
| Intent Analysis | `intent-analyzer.ts` | 识别用户意图并分解为子任务 |
| Task Graph | `task-graph.ts` | 构建 DAG 任务依赖图，检测循环依赖，拓扑排序 |
| Dispatch | `dispatcher.ts` | 根据子任务类型调度对应的 Agent Adapter |
| Execute | `executor.ts` | 执行任务图，支持并行/串行执行 |
| Aggregate | `aggregator.ts` | 聚合多个 Agent 输出，生成最终回复 |

### 2. Multi-Agent Adapters

支持多种 Agent 接入：

| Adapter | 机制 | 流格式 |
|---------|------|--------|
| **Claude** | `claude --bare` 子进程 | NDJSON stream-json |
| **OpenCode** | `opencode run --format json` 子进程 | NDJSON events |
| **Custom** | HTTP 调用 OpenAI 兼容 API | SSE data: lines |

### 3. Real-time Interaction

- **SSE (Server-Sent Events)**: Agent 输出的流式推送，实现打字机效果。通过 `verifyQueryToken` 中间件鉴权。
- **WebSocket**: 在线状态、输入中状态、异步事件通知。由 `ConnectionManager` 单例管理。

### 4. Agent = Contact 模型

Agent 由 Contact 模型承载，通过 `provider` 字段（`AgentProvider` 枚举：`Claude` / `OpenCode` / `Custom`）区分。无独立 Agent 表。

- **Contact** 关键字段: `provider`, `systemPrompt`, `model`, `workspacePath`, `displayName`, `tags`, `isPinned`, `config`
- **PublishedAgent**: 独立的市场模型，可将 Contact 发布为市场列表（`sourceContactId` 回溯）

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | 注册新用户 |
| POST | `/auth/login` | 登录获取 token |
| POST | `/auth/refresh` | 刷新 access token |
| POST | `/contacts/create` | 创建 Contact (Agent) |
| GET | `/contacts/list` | 获取 Contact 列表 |
| POST | `/agents/create` | 创建 Agent 市场列表 |
| GET | `/agents/list` | 获取 Agent 市场列表 |
| GET | `/agents/detail` | 获取 Agent 详情 |
| POST | `/conversations/create` | 创建会话 |
| GET | `/conversations/list` | 获取会话列表 |
| GET | `/conversations/detail` | 获取会话详情 |
| POST | `/messages/create` | 发送消息（触发 Orchestrator） |
| GET | `/messages/list` | 获取会话消息列表（cursor 分页） |
| GET | `/messages/detail` | 获取消息详情 |
| POST | `/artifacts/create` | 创建产物 |
| GET | `/artifacts/list` | 获取产物列表 |
| GET | `/artifacts/detail` | 获取产物详情 |
| POST | `/credentials/create` | 保存用户凭据 |
| GET | `/credentials/list` | 获取用户凭据列表 |
| GET | `/sse` | 建立 SSE 流连接（query token 鉴权） |

## Development

### Common Commands

```bash
pnpm dev                       # 开发模式：并行启动所有包（Turbo watch）
pnpm build                     # 构建所有包
pnpm test                      # 运行所有测试
pnpm lint                      # 类型检查所有包

# 数据库
pnpm db:up                     # docker compose up -d (PostgreSQL)
pnpm db:down                   # docker compose down
pnpm --filter @agenthub/db db:generate    # 生成 Prisma Client
pnpm --filter @agenthub/db db:push        # 同步 schema 到 dev DB
pnpm --filter @agenthub/db db:push:test   # 同步 schema 到 test DB
pnpm --filter @agenthub/db db:seed        # 填充种子数据
pnpm --filter @agenthub/db db:studio      # Prisma Studio GUI

# Web 端
pnpm --filter @agenthub/web dev           # 启动 Web 开发服务器
pnpm --filter @agenthub/web dev:clean     # 清理缓存后启动

# 服务器
pnpm --filter @agenthub/server dev        # 启动服务器开发模式 (watch)
pnpm --filter @agenthub/server start      # 启动生产服务
```

### Configuration

所有环境变量通过根目录 `.env` 文件配置：

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://agenthub:agenthub_dev@localhost:5432/agenthub` | 生产数据库 |
| `TEST_DATABASE_URL` | `postgresql://agenthub:agenthub_dev@localhost:5432/agenthub_test` | 测试数据库 |
| `PORT` | `8124` | 服务端 HTTP 端口 |
| `WEB_PORT` | `3002` | Web 开发端口 |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8124` | Web 端 API 地址 |
| `JWT_SECRET` | `dev-secret-...` | JWT 签名密钥 |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access Token 有效期 |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh Token 有效期 |
| `API_KEY` | — | 智能路由 LLM API Key |
| `BASE_URL` | `https://api.deepseek.com` | LLM API 地址 |
| `MODEL` | `deepseek-v4-flash` | LLM 模型名称 |

## Database Model

```
User ──→ RefreshToken
  │
  ├──→ Contact (Agent = Contact with provider field)
  │       └──→ PublishedAgent (marketplace listing)
  │
  ├──→ Conversation ──→ Message ──→ Artifact
  │                        │
  │                     (self-ref parentId)
  │
  └──→ UserCredential
```

- **Cascade deletes**: User/Agent → Contact; User → Conversation → Message → Artifact
- **Pagination**: 会话列表使用 offset 分页 + total count；消息列表使用 cursor 分页（无限滚动）
- **Repository 模式**: 每个模型有独立的 repository 模块，接受可选 `PrismaClient` 参数支持 DI

## Planned Features

- [x] SSE 流式 Agent 输出 + WebSocket 实时通信
- [x] 群聊多 Agent 编排调度 (Orchestrator)
- [x] Next.js 三栏 IM 界面
- [x] Agent 市场与自定义 Agent 创建
- [ ] 产物 (Artifacts) 的实时编辑与版本控制
- [ ] 更多 Agent 适配器 (如 Gemini, Llama3)
