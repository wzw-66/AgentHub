# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AgentHub is a multi-Agent collaboration platform using IM chat as the core interaction paradigm. Users interact with AI Agents (Claude, OpenCode, custom) through chat conversations — like WeChat/Feishu but for AI collaboration.

**Current status:** `@agenthub/shared` (types/enums) and `@agenthub/db` (database) exist. Other packages are planned.

## Commands

### Root Workspace (via Turborepo)

- `pnpm install` — install all dependencies
- `pnpm build` — build all packages
- `pnpm dev` — dev mode (watch)
- `pnpm lint` — lint all packages
- `pnpm test` — run all tests

### Per-Package

```bash
pnpm --filter @agenthub/shared test        # run tests for shared
pnpm --filter @agenthub/shared build
pnpm --filter @agenthub/shared test src/tests/enums.test.ts  # single test file

pnpm --filter @agenthub/db test
pnpm --filter @agenthub/db build
pnpm --filter @agenthub/db test:watch
```

### Database (packages/db)

```bash
# Run from packages/db/ or use --filter
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

1. Create directory under `packages/` or `apps/`
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
- **Package manager:** pnpm

## Architecture

### Monorepo Structure

```
AgentHub/
├── packages/
│   ├── shared/              # [EXISTS] Type definitions, enums, DTOs (zero deps)
│   └── db/                  # [EXISTS] Prisma schema, CRUD repositories, seed
├── tooling/
│   ├── eslint-config/       # Shared ESLint config
│   └── tsconfig/            # Shared TypeScript configs (base.json, node.json, nextjs.json)
├── apps/                    # (planned: web, server, desktop)
├── openspec/                # OpenSpec change management
├── docs/                    # Design docs
├── docker-compose.yaml      # PostgreSQL 16
└── turbo.json               # Task orchestration
```

### Database Layer (packages/db)

**Prisma Schema** — 7 models, 6 enums:

| Model | Key Fields | Relations |
|-------|-----------|-----------|
| User | id, name, email (unique), passwordHash, avatarUrl | → Contact, Conversation, UserCredential |
| Agent | id, name, provider (enum), systemPrompt, model, config (JSON) | → Contact |
| Contact | id, userId, agentId, displayName, tags, isPinned | → User, Agent; `@@unique([userId, agentId])` |
| Conversation | id, title, type (enum), ownerId, contactIds[], isArchived, lastActiveAt | → User, Message |
| Message | id, conversationId, senderType, senderId, type, content, parentId?, isPinned, metadata (JSON) | → Conversation, Artifact; self-referencing parent |
| Artifact | id, messageId, type, url?, content?, previewUrl?, status (enum) | → Message |
| UserCredential | id, userId, provider, encryptedKey | → User |

Cascade deletes: User/Agent delete cascades to Contact; User delete cascades to Conversation → Message → Artifact cascade.

**Repository Pattern** — Each model has a repository module (`src/repositories/`) with functions that accept an optional `PrismaClient` parameter (defaults to global singleton). This enables dependency injection for testing.

```
src/repositories/
├── index.ts          # re-exports all
├── agent.ts          # listAgents(filter), getAgent, createAgent, updateAgent, deleteAgent
├── contact.ts        # listContacts(userId), getContact, createContact, updateContact, deleteContact
├── conversation.ts   # createConversation, getConversation, listConversations(pagination, filter), updateConversation
├── message.ts        # createMessage(transactional), getMessage, listMessages(cursor pagination), pinMessage
├── artifact.ts       # listArtifacts, getArtifact, createArtifact, updateArtifact
└── credential.ts     # listCredentials, getCredential, createCredential, deleteCredential
```

**Pagination strategies:** Conversation list uses offset pagination (supports total count); Message list uses cursor pagination (for infinite scroll).

### Testing

- Tests use **real PostgreSQL** via `TEST_DATABASE_URL` (separate `agenthub_test` database)
- Global setup (`src/__tests__/setup.ts`) pushes schema before tests
- Each test manages its own data lifecycle: create → assert → clean up
- Run single test file: `pnpm --filter @agenthub/db vitest run src/__tests__/agent.test.ts`
- Test files co-located in `src/__tests__/` within each package

### Key TypeScript Notes

- Base tsconfig has `exactOptionalPropertyTypes: true` — this causes issues with Prisma's nullable JSON fields (`config Json?`, `metadata Json?`). Override to `false` in Prisma package tsconfigs.
- All packages use `import type` for type-only imports
- Default exports avoided; prefer named exports throughout
