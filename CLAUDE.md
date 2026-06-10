# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AgentHub is a multi-Agent collaboration platform using IM chat as the core interaction paradigm. Users interact with AI Agents (Claude, OpenCode, custom) through chat conversations — like WeChat/Feishu but for AI collaboration.

**Current status — 6 packages implemented:**

| Package | Status | Description |
|---------|--------|-------------|
| `@agenthub/shared` | Done | Type definitions, enums, DTOs (zero runtime deps) |
| `@agenthub/db` | Done | Prisma schema, CRUD repositories, seed data |
| `@agenthub/agent-core` | Done | Agent adapter layer (Claude CLI, OpenCode CLI, custom LLM) |
| `@agenthub/ui` | Done | Shared React components (MessageBubble, ArtifactCard, etc.) |
| `@agenthub/server` | Done | Fastify REST API + JWT dual-token auth |
| `@agenthub/web` | Done | Next.js 14 chat UI with Tailwind CSS |

## Commands

### Root Workspace (via Turborepo)

- `pnpm install` — install all dependencies
- `pnpm build` — build all packages
- `pnpm dev` — dev mode (watch)
- `pnpm lint` — lint all packages (tsc --noEmit)
- `pnpm test` — run all tests
- `pnpm db:up` — `docker compose up -d`
- `pnpm db:down` — `docker compose down`
- `pnpm db:generate` — generate Prisma client
- `pnpm db:push` — push schema to dev DB
- `pnpm db:seed` — seed demo data
- `pnpm db:studio` — open Prisma Studio

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

pnpm --filter @agenthub/ui test                        # run all UI component tests
pnpm --filter @agenthub/ui test:watch                  # watch mode
pnpm --filter @agenthub/ui dev                         # tsup watch mode

pnpm --filter @agenthub/web test                       # run all web tests
pnpm --filter @agenthub/web test:watch                 # watch mode
pnpm --filter @agenthub/web dev                        # Next.js dev server (reads WEB_PORT/PORT from root .env)
pnpm --filter @agenthub/web dev:clean                  # dev with clean cache
pnpm --filter @agenthub/web build                      # next build
pnpm --filter @agenthub/web start                      # next start
pnpm --filter @agenthub/web typecheck                  # tsc --noEmit
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
│   ├── agent-core/          # Agent adapter layer (Claude, OpenCode, custom)
│   └── ui/                  # Shared React components (MessageBubble, etc.)
├── apps/
│   ├── server/              # Fastify REST API + JWT auth + SSE/WS
│   └── web/                 # Next.js 14 IM chat UI
├── tooling/
│   ├── eslint-config/       # Shared ESLint config
│   └── tsconfig/            # Shared TypeScript configs
├── docs/                    # Design docs (superpowers specs, architecture deep dives)
├── openspec/                # OpenSpec change management
├── docker-compose.yaml      # PostgreSQL 16
├── turbo.json               # Task orchestration
└── pnpm-workspace.yaml      # Workspace definition
```

### Package Dependency Graph

```
@agenthub/shared  (zero deps)
       │
       ├──→ @agenthub/db           (shared + Prisma)
       ├──→ @agenthub/agent-core   (shared only)
       ├──→ @agenthub/ui           (shared + prism-react-renderer)
       │
       ├──→ @agenthub/server       (shared + db + agent-core + Fastify)
       └──→ @agenthub/web          (shared + ui + Next.js 14)
```

### Database Layer (packages/db)

**Important concept: Agent = Contact** — There is no standalone `Agent` table/model. Agents are represented entirely by the `Contact` model, differentiated by `provider` field set to one of `AgentProvider` (`Claude`, `OpenCode`, `Custom`). When the code references an "agent", it's working with a `Contact` record. Key Contact fields: `provider`, `systemPrompt`, `model`, `workspacePath`, `displayName`, `tags`, `isPinned`, `config` (arbitrary JSON).

**PublishedAgent** — A separate Prisma model for the agent marketplace. Users can publish their Contact agents as PublishedAgent listings (with `sourceContactId` linking back to the original Contact). Has its own `creatorId` → `User` relation.

**Prisma (8 models, 6 enums):**

```
User ──→ RefreshToken
  │
  ├──→ Contact (Agent = Contact with provider field set to a non-User provider)
  │       └──→ PublishedAgent (marketplace agent listing, separate table)
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

**MessageType** (stored in DB): `Text`, `Code`, `Diff`, `Preview`, `Artifact`, `Deploy`, `Hesitate`, `Debate`, `Alert`.

**Chunk parser utils** handle per-provider format parsing: `parseClaudeStreamJson`, `parseOpenCodeEvent`, `parseOpenAIStreamEvent`, `parseEventLine`.

### Server (apps/server)

Fastify v5 REST API with module-based route registration:

- `src/app.ts` — builds Fastify instance with CORS, global error handler, route registration
- `src/index.ts` — entry point, loads .env from root, starts server with graceful shutdown
- `src/config/env.ts` — typed config from env vars (port, JWT secrets, expiration)
- `src/middleware/jwt.ts` — `authenticate` hook for Bearer token, `verifyQueryToken` for SSE/WS
- `src/utils/jwt.ts` — sign/verify access+refresh tokens, jti generation
- `src/utils/password.ts` — bcrypt hash/compare with 10 salt rounds

**Route modules** (in `src/routes/`):

| Module | Key Endpoints |
|--------|--------------|
| `auth.ts` | `/auth/register`, `/auth/login`, `/auth/refresh` |
| `messages.ts` | `/messages/create`, `/messages/list`, `/messages/detail` |
| `conversations.ts` | `/conversations/create`, `/conversations/list`, `/conversations/detail` |
| `contacts.ts` | `/contacts/create`, `/contacts/list` (Agent = Contact) |
| `agents.ts` | `/agents/create`, `/agents/list`, `/agents/detail` |
| `artifacts.ts` | `/artifacts/create`, `/artifacts/detail`, `/artifacts/list` |
| `credentials.ts` | `/credentials/create`, `/credentials/list` |
| `sse.ts` | `/sse` — SSE stream connection |
| `ws.ts` | WebSocket endpoint for presence/status |

**API naming convention:** All URLs use verb-path suffixes (e.g., `/messages/create`, `/messages/list`, `/messages/detail`). HTTP methods (POST for create, GET for list/detail) are secondary — the path always explicitly states the action. Do NOT use RESTful resource-only paths like `POST /messages` or `GET /messages/:id`.

### Orchestrator (apps/server/src/orchestrator/)

The orchestrator is the core agent task scheduler. It processes user messages and coordinates multi-agent execution:

| Module | Role |
|--------|------|
| `types.ts` | Data types: `SubTask`, `TaskGraph`, `Intent`, `ExecutionPlan` |
| `intent-analyzer.ts` | Analyzes user input, decomposes into sub-tasks with dependencies |
| `task-graph.ts` | Builds a DAG of sub-tasks, detects circular dependencies, topological sort |
| `dispatcher.ts` | Routes each sub-task to the appropriate AgentAdapter based on task type |
| `executor.ts` | Orchestrates execution — walks the task graph, handles parallel/serial execution |
| `aggregator.ts` | Merges multi-agent outputs into a coherent final response |

Flow: `Intent Analysis → Task Graph → Dispatch → Execute → Aggregate`

### Realtime (apps/server/src/realtime/)

Two complementary realtime channels:

- **SSE** (`routes/sse.ts`): Server-Sent Events for streaming agent output (typing effect). Uses `verifyQueryToken` middleware for auth.
- **WebSocket** (`routes/ws.ts`, `realtime/connection-manager.ts`): Handles presence, typing indicators, and async event notifications. Managed by `ConnectionManager` singleton.

### Web App (apps/web)

Next.js 14 App Router chat UI with three route groups:

```
app/
├── (auth)/                    # /login, /register pages
├── (chat)/                    # /chat — main conversation panel
└── (market)/                  # /agents, /agents/[id], /agents/contacts
```

**Context provider stack** (wraps entire app via `app/providers.tsx`):
- `I18nProvider` → `ThemeProvider` → `AuthProvider` → `WSProvider` → `ChatProvider`

**Key patterns:**
- `lib/api-client.ts` — centralized API fetch wrapper (reads `NEXT_PUBLIC_API_URL`)
- `hooks/useSSEStream.ts` — SSE stream connection for real-time agent output
- `hooks/useNebulaCanvas.ts` — Canvas-based animated nebula background
- `hooks/useRipple.tsx` — Button ripple effect
- Custom `scripts/dev.mjs` — reads `WEB_PORT` / `PORT` from root `.env`, passes `NEXT_PUBLIC_API_URL` to Next.js
- `next.config.js` — transpiles `@agenthub/shared` and `@agenthub/ui` packages; loads `NEXT_PUBLIC_*` from root `.env`
- `tailwind.config.ts` — CSS custom property-based theming system (theme-accent, theme-surface, etc.)
- i18n via React context (`lib/i18n/`) with zh/en translations; LanguageSwitcher component
- Vitest with jsdom environment, `@/` path alias to project root

### UI Component Library (packages/ui)

Six shared React components built with `tsup` (ESM + CJS dual output):

| Component | Description |
|-----------|-------------|
| `AgentAvatar` | Agent profile avatar with status indicator |
| `MessageBubble` | Chat message display (text, code, tool calls) |
| `CodeBlock` | Syntax-highlighted code with copy button |
| `DiffCard` | Side-by-side diff view for code changes |
| `PreviewCard` | Rich link preview card |
| `ArtifactCard` | Artifact file display with status |

**Component conventions:**
- Each component in its own directory with co-located `__tests__/` and `__tests__/*.test.tsx`
- Shared CSS tokens in `src/styles/tokens.css`, component styles in `src/styles/components.css`
- Peer dependencies on `react` and `react-dom` (not bundled, consumed by host app)
- Tailwind classes used in components; host app's Tailwind config includes `../packages/ui/src/**/*.{ts,tsx}`

### Shared Types (packages/shared)

Zero-dependency package with enums and TypeScript interfaces shared across all packages. Type-only exports using `import type`. Enums: `AgentProvider`, `ConversationType`, `SenderType`, `MessageType`, `ArtifactType`, `ArtifactStatus`, `ChunkType`.

### Testing

- **DB tests** use real PostgreSQL via `TEST_DATABASE_URL` (separate `agenthub_test` database). Global setup (`src/__tests__/setup.ts`) pushes schema via `npx prisma db push` before all tests. Each test manages its own data lifecycle.
- **Server tests** require the test DB to be pushed beforehand (`pnpm --filter @agenthub/db db:push:test`). Setup is intentionally minimal.
- **Agent-core tests** are unit tests — no external dependencies.
- Test files co-located in `src/__tests__/` within each package.

### Configuration

All env vars are read from root `.env` (not per-package `.env`). Key config:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://agenthub:agenthub_dev@localhost:5432/agenthub` | Prod DB |
| `TEST_DATABASE_URL` | `postgresql://agenthub:agenthub_dev@localhost:5432/agenthub_test` | Test DB |
| `PORT` | `8124` | Server HTTP port |
| `WEB_PORT` | `3002` | Next.js dev port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8124` | API base for web app |
| `JWT_SECRET` | — | JWT signing secret (change in production) |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token TTL |
| `API_KEY` / `BASE_URL` / `MODEL` | DeepSeek defaults | Intelligent router LLM config |

### OpenSpec Change Management

The `openspec/` directory tracks active changes using a spec-driven workflow (config in `openspec/config.yaml`). Each change has a spec, task list, and implementation artifacts under `openspec/changes/` and `openspec/specs/`.

### Key TypeScript Notes

- Base tsconfig has `exactOptionalPropertyTypes: true` — override to `false` in Prisma package tsconfigs.
- All packages use `import type` for type-only imports.
- Default exports avoided; prefer named exports throughout.
- All packages are `"type": "module"` (ESM).

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
