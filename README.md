# AgentHub

多 Agent 协作平台 — 以 IM 聊天为核心交互范式，用户通过对话与 AI Agent（Claude、OpenCode、自定义）协作。

## Current Status

| Package | Status | Description |
|---------|--------|-------------|
| `@agenthub/shared` | ✅ Done | Type definitions, enums, DTOs — zero runtime deps |
| `@agenthub/db` | ✅ Done | Prisma schema, CRUD repositories, seed data |
| `@agenthub/agent-core` | 📋 Planned | Agent adapter layer (Claude API, OpenCode CLI, custom) |
| `apps/server` | 📋 Planned | Fastify REST API + SSE/WS |
| `apps/web` | 📋 Planned | Next.js chat UI |
| `packages/ui` | 📋 Planned | Shared React components |

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

## Project Architecture

```
AgentHub/
├── packages/
│   ├── shared/              # [✅] 共享类型、枚举、DTO
│   └── db/                  # [✅] Prisma schema、CRUD 仓储、seed
├── tooling/
│   ├── eslint-config/       # ESLint 共享配置
│   └── tsconfig/            # TypeScript 共享配置
├── apps/                    # 待开发的应用层
├── openspec/                # OpenSpec 变更管理
├── docs/                    # 设计文档
├── docker-compose.yaml      # PostgreSQL 16 容器
├── turbo.json               # Turborepo 任务编排
└── pnpm-workspace.yaml      # pnpm 工作空间
```

### Tech Stack

| Category | Choice |
|----------|--------|
| Monorepo | Turborepo + pnpm workspaces |
| Language | TypeScript 6.0.3 (strict mode) |
| Building | tsup (ESM + CJS dual output) |
| Testing | Vitest |
| Database | PostgreSQL 16 + Prisma ORM 6 |
| Linting | ESLint 10 + Prettier |
| Container | Docker Compose |

### Database Schema

7 个数据模型，完整关系图：

```
User ──→ Contact ←── Agent
  │
  ├──→ Conversation ──→ Message ──→ Artifact
  │                        │
  │                     (自引用 parentId)
  │
  └──→ UserCredential
```

### Repository Pattern

每个模型对应一个仓储模块，所有函数接受可选的 `PrismaClient` 参数（默认使用全局单例），方便测试注入：

```typescript
import { createConversation, listMessages } from "@agenthub/db";

// 生产环境：使用默认 Prisma 单例
const conv = await createConversation({ title: "New Chat", type: "Single", ownerId: "user1" });

// 测试环境：注入 test client
const result = await listMessages(convId, { cursor, limit: 50 }, testPrisma);
```

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

# 单包测试
pnpm --filter @agenthub/db test
pnpm --filter @agenthub/db vitest run src/__tests__/agent.test.ts
```

### Database Connection

```
Development: postgresql://agenthub:agenthub_dev@localhost:5432/agenthub
Test:        postgresql://agenthub:agenthub_dev@localhost:5432/agenthub_test
```

## Planned Features

- Claude / OpenCode / 自定义 Agent 适配器
- Fastify REST API + JWT 认证
- SSE 流式 Agent 输出 + WebSocket 实时通信
- 群聊多 Agent 编排调度
- Next.js 三栏 IM 界面
- Agent 市场、产物预览
