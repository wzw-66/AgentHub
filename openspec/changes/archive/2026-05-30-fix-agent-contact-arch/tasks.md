## 1. Prisma Schema: Merge Agent into Contact

- [x] 1.1 Update `packages/db/prisma/schema.prisma`: Delete `model Agent { ... }`, add Agent fields (`name`, `avatarUrl`, `provider`, `systemPrompt`, `model`, `workspacePath`, `config`) to `model Contact`, remove `@@unique([userId, agentId])`
- [x] 1.2 Update `packages/db/prisma/schema.prisma`: Rename `Conversation.agentIds` → `contactIds`, remove `agents Agent[]` from User model
- [x] 1.3 Run `pnpm --filter @agenthub/db db:push --force-reset` to apply schema changes

## 2. DB Repositories

- [x] 2.1 Delete `packages/db/src/repositories/agent.ts`
- [x] 2.2 Enhance `packages/db/src/repositories/contact.ts`: add `name`, `provider`, `systemPrompt`, `model`, `workspacePath`, `config` to `CreateContactInput`; add `listContactsByProvider`; remove `ContactWithAgent` type (no longer needed)
- [x] 2.3 Update `packages/db/src/repositories/conversation.ts`: rename `agentIds` → `contactIds` in `CreateConversationInput`
- [x] 2.4 Update `packages/db/src/repositories/index.ts`: remove agent export

## 3. Shared Types

- [x] 3.1 Update `packages/shared/src/types/contact.ts`: add agent fields (`userId`, `provider`, `model`, `systemPrompt`, `config`, `workspacePath`, `tags`), remove `email`
- [x] 3.2 Update `packages/shared/src/types/conversation.ts`: rename `agentIds` → `contactIds`

## 4. Server Routes

- [x] 4.1 Rewrite `apps/server/src/routes/contacts.ts`: merge Agent create/list/detail logic in, accept agent config in create body
- [x] 4.2 Delete `apps/server/src/routes/agents.ts`
- [x] 4.3 Update `apps/server/src/routes/messages.ts`: remove `getAgent`, `listContacts` imports; resolve execution agent via `getContact`; update `runAgentExecution` to use `contactIds` from conversation
- [x] 4.4 Update `apps/server/src/routes/conversations.ts`: rename `agentIds` → `contactIds` in types and handler
- [x] 4.5 Update `apps/server/src/app.ts`: remove agentRoutes registration, keep contactRoutes

## 5. Seed Script

- [x] 5.1 Update `packages/db/src/seed.ts`: create Contacts with agent fields instead of Agent records; use `contactIds` in conversations

- [x] 6.1 Update `apps/server/src/__tests__/helpers.ts`: rename `createTestAgent` → `createTestContact` (or similar), use Contact repository
- [x] 6.2 Rewrite `apps/server/src/__tests__/agents.test.ts`: update to contact API endpoints, use Contact factory
- [x] 6.3 Update `apps/server/src/__tests__/contacts.test.ts`: reflect new Contact schema (no agentId, has provider etc.)
- [x] 6.4 Update `apps/server/src/__tests__/conversations.test.ts`: use `contactIds` instead of `agentIds`
- [x] 6.5 Replace `packages/db/src/__tests__/agent.test.ts` with contact.test.ts testing merged Contact repo

- [x] 7.1 Update `apps/web/lib/chat-context.tsx`: change API calls from `/api/agents/` to `/api/contacts/`; rename `agentIds` → `contactIds` in createConversation; rename `AgentInfo` → `ContactInfo`
- [x] 7.2 Update `apps/web/components/CreateAgentModal.tsx`: change API call from `/api/agents/create` to `/api/contacts/create`
- [x] 7.3 Update `apps/web/components/Sidebar.tsx`: use `contactIds` when creating conversation

## 8. Verification

- [x] 8.1 Run `pnpm --filter @agenthub/server test` — all tests pass (128/128)
- [x] 8.2 Run `pnpm --filter @agenthub/db test` — all tests pass (31/31)
- [x] 8.3 Run `pnpm --filter @agenthub/web build` — compiled successfully
- [x] 8.4 Run `pnpm --filter @agenthub/db db:seed` — seed creates contacts without agent table
- [x] 8.5 Manual verification ready — API endpoints migrated to `/api/contacts/`
