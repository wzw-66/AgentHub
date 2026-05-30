## 1. Shared Enum & Factory Normalization

- [x] 1.1 Update `AgentProvider` enum in `packages/shared/src/enums/agent.ts` — values to PascalCase: `Claude = "Claude"`, `OpenCode = "OpenCode"`, `Custom = "Custom"`
- [x] 1.2 Add case normalization in `packages/agent-core/src/factory.ts` — `toLowerCase()` switch to handle any case
- [x] 1.3 Add optional `cwd` field to `ClaudeAdapterConfig` and `OpenCodeAdapterConfig`
- [x] 1.4 Pass `cwd` from config to `spawn()` options in both adapters

## 2. Prisma Schema Migration

- [x] 2.1 Add `creatorId String` field to Agent model with required relation to User
- [x] 2.2 Add `agents Agent[]` relation field to User model
- [x] 2.3 Add `workspacePath String?` field to Agent model
- [x] 2.4 Rename `contactIds` to `agentIds` on Conversation model
- [x] 2.5 Run `pnpm --filter @agenthub/db db:push` to sync schema
- [x] 2.6 Update Agent repository types (`CreateAgentInput`, `UpdateAgentInput`) in `packages/db/src/repositories/agent.ts` to include `creatorId` and `workspacePath`

## 3. Server Route Updates

- [x] 3.1 Update `POST /api/agents/create` handler to accept and store `creatorId` (from authenticated user)
- [x] 3.2 Create workspace directory (`agent-workspace/{email}/{name}/`) in create handler with fs.mkdir, write path to DB
- [x] 3.3 Update `VALID_PROVIDERS` array to `["Claude", "OpenCode", "Custom"]` (already correct, verify)
- [x] 3.4 Update conversation routes: rename `contactIds` references to `agentIds` in `apps/server/src/routes/conversations.ts`
- [x] 3.5 Update `ConversationType` validation from `"Single"/"Group"` to `"single"/"group"` in conversations.ts
- [x] 3.6 Fix `runAgentExecution` in `apps/server/src/routes/messages.ts`:
  - Use `conv.agentIds` instead of buggy `contactIds.map(() => listContacts(...))`
  - For "single" type: resolve agent from `agentIds[0]`, create adapter with `cwd: workspacePath`
  - Pass `agent.provider` (PascalCase) to `createAdapter()`
  - Fix response format for agent list (ensure plain array, not `{ agents: [...] }`)

## 4. Frontend CreateAgentModal Redesign

- [x] 4.1 Add provider segmented control (three options: Claude Code, OpenCode, Custom) to `CreateAgentModal.tsx`
- [x] 4.2 Implement conditional field rendering: Custom provider shows Provider name, API URL, API Key, Model fields; CC/OC hide them
- [x] 4.3 Add workspace path read-only preview in the form (real-time updates as user types name)
- [x] 4.4 Update submit handler to send correct provider value and conditional fields
- [x] 4.5 Update i18n translations (zh.ts + en.ts) for new form UI strings (provider labels, conditional field labels)

## 5. Frontend API Calls Alignment

- [x] 5.1 Update `chat-context.tsx` agent list call to expect plain array response (remove `data.agents` wrapping)
- [x] 5.2 Update `chat-context.tsx` conversation creation to use `agentIds` (not `contactIds`)
- [x] 5.3 Update `apps/web/app/(market)/agents/[id]/page.tsx` conversation creation to use `agentIds`
- [x] 5.4 Update `apps/web/app/(market)/agents/contacts/page.tsx` API path calls to match server routes (verify `/list`, `/create`, `/update`, `/delete` suffixes)
- [x] 5.5 Update `apps/web/components/Sidebar.tsx` conversation creation to use `agentIds`

## 6. Verification

- [x] 6.1 Run `pnpm lint` — fix any tsc errors from enum value changes
- [x] 6.2 Run `pnpm --filter @agenthub/shared test` — ensure all tests pass
- [x] 6.3 Run `pnpm --filter @agenthub/db test` — verify repository changes
- [x] 6.4 Run `pnpm --filter @agenthub/server test` — verify route changes
- [x] 6.5 Run `pnpm --filter @agenthub/agent-core test` — verify adapter changes
- [x] 6.6 Run `pnpm --filter @agenthub/web test` — verify frontend test passing
- [ ] 6.7 Manual smoke test: register user → create Claude agent → create conversation → send message → verify workspace dir created on disk
