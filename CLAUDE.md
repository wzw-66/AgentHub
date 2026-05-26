# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AgentHub is a multi-Agent collaboration platform using IM chat as the core interaction paradigm. Users interact with AI Agents (Claude, OpenCode, custom) through chat conversations — like WeChat/Feishu but for AI collaboration.

**Current status — 4 packages implemented:**

| Package | Status | Description |
|---------|--------|-------------|
| `@agenthub/shared` | Done | Type definitions, enums, DTOs (zero runtime deps) |
| `@agenthub/db` | Done | Prisma schema, CRUD repositories, seed data |
| `@agenthub/agent-core` | Done | Agent adapter layer (Claude CLI, OpenCode CLI, custom LLM) |
| `@agenthub/server` | Done | Fastify REST API + JWT dual-token auth |

## Commands

### Root Workspace (via Turborepo)

- `pnpm install` — install all dependencies
- `pnpm build` — build all packages
- `pnpm dev` — dev mode (watch)
- `pnpm lint` — lint all packages (tsc --noEmit)
- `pnpm test` — run all tests
- `pnpm db:up` — `docker compose up -d`
- `pnpm db:down` — `docker compose down`

### Per-Package

```bash
pnpm --filter @agenthub/shared test                    # run all tests
pnpm --filter @agenthub/shared test src/tests/enums.test.ts

pnpm --filter @agenthub/db test                        # run all DB tests
pnpm --filter @agenthub/db test src/__tests__/agent.test.ts
pnpm --filter @agenthub/db test:watch

pnpm --filter @agenthub/agent-core test                # run all adapter tests
pnpm --filter @agenthub/agent-core test src/__tests__/claude.adapter.test.ts

pnpm --filter @agenthub/server test                    # run all server tests
pnpm --filter @agenthub/server test src/__tests__/auth.test.ts
pnpm --filter @agenthub/server dev                     # watch mode build
pnpm --filter @agenthub/server start                   # run built server (node dist/index.js)
```

### Database (packages/db)

```bash
pnpm --filter @agenthub/db db:generate    # generate Prisma client
pnpm --filter @agenthub/db db:push        # push schema to dev DB
pnpm --filter @agenthub/db db:push:test   # push schema to test DB
pnpm --filter @agenthub/db db:seed        # seed demo data
pnpm --filter @agenthub/db db:studio      # open Prisma Studio
```

### Docker

```bash
docker compose up -d         # start PostgreSQL
docker compose down          # stop PostgreSQL
docker compose exec postgres psql -U agenthub -d agenthub  # psql shell
```

### Adding a New Package

1. Create dir under `packages/` or `apps/`
2. Add `package.json` with `"@agenthub/xxx"` name, export ESM + CJS via tsup
3. Extend from `../../tooling/tsconfig/base.json` (or node/nextjs variant)
4. Use `vitest` for tests, `tsup` for building
5. Reference deps via workspace protocol: `"@agenthub/shared": "workspace:*"`
6. Add lint script: `"lint": "tsc --noEmit"`

**Prisma packages:** Set `exactOptionalPropertyTypes: false` in tsconfig (base.json enables it, but Prisma's nullable JSON types are incompatible).

## Tech Stack

- **Monorepo:** Turborepo + pnpm workspaces (pnpm 9.15.4)
- **Language:** TypeScript (6.0.3), strict mode
- **Building:** tsup (ESM + CJS dual output, dts generation)
- **Testing:** Vitest (v3)
- **Linting:** ESLint (v10) + @typescript-eslint + Prettier
- **Database:** PostgreSQL 16 via Docker Compose, Prisma ORM (v6)
- **Server:** Fastify (v5) + JWT (jsonwebtoken) + bcryptjs
- **Package manager:** pnpm

## Architecture

### Monorepo Structure

```
AgentHub/
├── packages/
│   ├── shared/              # Type definitions, enums, DTOs (zero deps)
│   ├── db/                  # Prisma schema, CRUD repositories, seed
│   └── agent-core/          # Agent adapter layer (Claude, OpenCode, custom)
├── apps/
│   └── server/              # Fastify REST API + JWT auth
├── tooling/
│   ├── eslint-config/       # Shared ESLint config
│   └── tsconfig/            # Shared TypeScript configs
├── docs/                    # Design docs
├── openspec/                # OpenSpec change management
├── docker-compose.yaml      # PostgreSQL 16
├── turbo.json               # Task orchestration
└── pnpm-workspace.yaml      # Workspace definition
```

### Package Dependency Graph

```
@agenthub/shared  (zero deps)
       |
       v
@agenthub/db  (depends on shared + Prisma)
       |
       v
@agenthub/server  (depends on shared + db + Fastify)
       |
       v
@agenthub/agent-core  (depends on shared only)
```

### Database Layer (packages/db)

**Prisma (7 models, 6 enums):**

```
User ──→ Contact ←── Agent
  │
  ├──→ Conversation ──→ Message ──→ Artifact
  │                        │
  │                     (self-ref parentId)
  │
  └──→ UserCredential
```

Cascade deletes: User/Agent → Contact; User → Conversation → Message → Artifact.

**Repository Pattern** — Each model has a repository module (`src/repositories/`) with functions that accept an optional `PrismaClient` parameter (defaults to global singleton). Enables DI for testing.

```typescript
import { createConversation, listMessages } from "@agenthub/db";

// Production: default Prisma singleton
const conv = await createConversation({ title: "...", type: "Single", ownerId: "u1" });

// Test: inject test client
const result = await listMessages(convId, { cursor, limit: 50 }, testPrisma);
```

**Pagination:** Conversation list uses offset pagination with total count; Message list uses cursor pagination (for infinite scroll).

### Agent Core (packages/agent-core)

Provides an `AgentAdapter` interface for executing prompts via different providers:

```typescript
interface AgentAdapter {
  execute(context: AgentContext): AsyncIterable<Chunk>;
  abort(): void;
  healthCheck(): Promise<HealthStatus>;
}
```

Three implementations:

| Adapter | Mechanism | Stream Format |
|---------|-----------|---------------|
| `ClaudeAdapter` | `claude --bare -p --output-format stream-json` subprocess | NDJSON stream events |
| `OpenCodeAdapter` | `opencode run --format json` subprocess | NDJSON events (text, tool_use, error, step_finish) |
| `CustomAgentAdapter` | HTTP fetch to OpenAI-compatible API | SSE `data:` lines |

Unified `createAdapter(provider, config)` factory dispatches by `AgentProvider` enum.

**Chunk types** (from `ChunkType` enum): `Text`, `Code`, `ToolCall`, `Artifact`, `Error`, `Done`.

**Chunk parser utils** handle per-provider format parsing: `parseClaudeStreamJson`, `parseOpenCodeEvent`, `parseOpenAIStreamEvent`, `parseEventLine`.

### Server (apps/server)

Fastify v5 REST API with module-based route registration:

- `src/app.ts` — builds Fastify instance with CORS, global error handler, route registration
- `src/index.ts` — entry point, loads .env from root, starts server with graceful shutdown
- `src/config/env.ts` — typed config from env vars (port, JWT secrets, expiration)
- `src/routes/auth.ts` — `/auth/register`, `/auth/login`, `/auth/refresh` endpoints
- `src/middleware/jwt.ts` — `authenticate` hook for Bearer token, `verifyQueryToken` for SSE/WS
- `src/utils/jwt.ts` — sign/verify access+refresh tokens, jti generation
- `src/utils/password.ts` — bcrypt hash/compare with 10 salt rounds

### Shared Types (packages/shared)

Zero-dependency package with enums and TypeScript interfaces shared across all packages. Type-only exports using `import type`. Enums: `AgentProvider`, `ConversationType`, `SenderType`, `MessageType`, `ArtifactType`, `ArtifactStatus`, `ChunkType`.

### Testing

- **DB tests** use real PostgreSQL via `TEST_DATABASE_URL` (separate `agenthub_test` database). Global setup (`src/__tests__/setup.ts`) pushes schema via `npx prisma db push` before all tests. Each test manages its own data lifecycle.
- **Server tests** require the test DB to be pushed beforehand (`pnpm --filter @agenthub/db db:push:test`). Setup is intentionally minimal.
- **Agent-core tests** are unit tests — no external dependencies.
- Test files co-located in `src/__tests__/` within each package.

### Key TypeScript Notes

- Base tsconfig has `exactOptionalPropertyTypes: true` — override to `false` in Prisma package tsconfigs.
- All packages use `import type` for type-only imports.
- Default exports avoided; prefer named exports throughout.
- All packages are `"type": "module"` (ESM).
