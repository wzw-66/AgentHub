# AgentHub

多 Agent 协作平台 — 以 IM 聊天为核心交互范式，用户通过对话与 AI Agent（Claude、OpenCode、自定义）协作。

## Current Status

| Package | Status | Description |
|---------|--------|-------------|
| `@agenthub/shared` | ✅ Done | Type definitions, enums, DTOs — zero runtime deps |
| `@agenthub/db` | ✅ Done | Prisma schema, CRUD repositories, seed data |
| `@agenthub/agent-core` | ✅ Done | Agent adapter layer (Claude CLI, OpenCode CLI, custom LLM) |
| `@agenthub/server` | ✅ Done | Fastify 5 REST API + JWT 双 token 认证 + SSE/WS |
| `@agenthub/web` | ✅ Done | Next.js 14 chat UI with Tailwind CSS |
| `@agenthub/ui` | ✅ Done | Shared React components (MessageBubble, ArtifactCard, etc.) |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) 9.15.4
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Push database schema
pnpm --filter @agenthub/db db:push

# 4. (Optional) Seed demo data
pnpm --filter @agenthub/db db:seed

# 5. Run tests
pnpm test
```

### Run Project

```bash
# Build all packages
pnpm build

# Start the API server (default: http://localhost:3001)
pnpm --filter @agenthub/server start

# Start the Web app (default: http://localhost:5234)
pnpm --filter @agenthub/web dev
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

Orchestrator 是系统的核心调度模块，负责处理复杂的 Agent 任务：
- **Intent Analysis**: 识别用户意图并分解为子任务。
- **Task Graph**: 构建任务依赖图，支持并行与串行执行，自动检测循环依赖。
- **Dispatcher**: 根据子任务类型调度对应的 Agent Adapter。
- **Aggregator**: 聚合多个 Agent 的输出结果，生成最终回复。

### 2. Multi-Agent Adapters

支持多种 Agent 接入：
- **Claude**: 通过本地 CLI 调用。
- **OpenCode**: 专注于代码生成的 Agent。
- **Custom**: 通过 HTTP 调用兼容 OpenAI 格式的 API。

### 3. Real-time Interaction

- **SSE (Server-Sent Events)**: 用于 Agent 输出的流式推送，实现打字机效果。
- **WebSocket**: 用于处理在线状态、输入中状态以及复杂的异步事件通知。

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | 注册新用户 |
| POST | `/auth/login` | 登录获取 token |
| GET | `/agents` | 获取 Agent 列表 |
| POST | `/agents` | 创建新 Agent |
| GET | `/conversations` | 获取会话列表 |
| GET | `/conversations/:id/messages` | 获取会话消息 |
| POST | `/messages` | 发送消息（触发 Orchestrator） |
| GET | `/sse` | 建立 SSE 流连接 |

## Development

### Common Commands

```bash
pnpm build                    # 构建所有包
pnpm test                     # 运行所有测试
pnpm lint                     # 类型检查所有包

# 数据库
pnpm --filter @agenthub/db db:studio     # Prisma Studio GUI
pnpm --filter @agenthub/db db:push       # 同步 schema
pnpm --filter @agenthub/db db:seed       # 填充种子数据

# Web 端
pnpm --filter @agenthub/web dev          # 启动 Web 开发服务器

# 服务器
pnpm --filter @agenthub/server dev       # 启动服务器开发模式 (watch)
pnpm --filter @agenthub/server start     # 启动生产服务
```

## Planned Features

- [x] SSE 流式 Agent 输出 + WebSocket 实时通信
- [x] 群聊多 Agent 编排调度 (Orchestrator)
- [x] Next.js 三栏 IM 界面
- [x] Agent 市场与自定义 Agent 创建
- [ ] 产物 (Artifacts) 的实时编辑与版本控制
- [ ] 更多 Agent 适配器 (如 Gemini, Llama3)

