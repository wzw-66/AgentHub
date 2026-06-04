## 1. Bug Fixes

- [x] 1.1 Fix SSE CORS: add `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials` headers to `apps/server/src/routes/sse.ts` `writeHead` call
- [x] 1.2 Fix SSE CORS: register `OPTIONS` handler in `sseRoutes` for preflight requests
- [x] 1.3 Fix agentIds → contactIds: change `agentIds: [id]` to `contactIds: [id]` in `apps/web/app/(market)/agents/[id]/page.tsx` line 62

## 2. Backend: DB Layer Additions

- [x] 2.1 Add `findSingleConversationByAgentId(userId, agentId)` to `packages/db/src/repositories/conversation.ts` — query `type="single"`, `contactIds` contains agentId, `isArchived=false`, ordered by `lastActiveAt DESC`, limit 1
- [x] 2.2 Export new function from `packages/db/src/repositories/index.ts`
- [x] 2.3 Add `updateMessage(id, data)` to `packages/db/src/repositories/message.ts` — update `content` field
- [x] 2.4 Add `deleteMessage(id)` to `packages/db/src/repositories/message.ts` — soft or hard delete
- [x] 2.5 Export new message functions from `packages/db/src/repositories/index.ts`

## 3. Backend: Server Routes

- [x] 3.1 Add `GET /conversations/find-by-agent/:agentId` to `apps/server/src/routes/conversations.ts` — calls `findSingleConversationByAgentId`, returns `{ conversation }` or `{ conversation: null }`
- [x] 3.2 Add `PATCH /messages/:messageId/update` to `apps/server/src/routes/messages.ts` — validates content, calls `updateMessage`, checks ownership
- [x] 3.3 Add `DELETE /messages/:messageId/delete` to `apps/server/src/routes/messages.ts` — calls `deleteMessage`, checks ownership
- [x] 3.4 Update route registrations in `apps/server/src/routes/messages.ts` plugin

## 4. Frontend: Single Conversation Dedup

- [x] 4.1 Update `handleStartChat` in `apps/web/app/(market)/agents/[id]/page.tsx` — call `GET /api/conversations/find-by-agent/:id` first, navigate to existing or create new

## 5. Frontend: Group Chat Creation

- [x] 5.1 Redesign Sidebar New Chat modal (`apps/web/components/Sidebar.tsx`) — add single/group mode toggle
- [x] 5.2 Implement multi-select agent list for group mode (checkbox-based)
- [x] 5.3 Wire up group conversation creation with `type: "group"` and multiple `contactIds`
- [x] 5.4 Add i18n strings for group chat UI (mode labels, member count, etc.)

## 6. Frontend: Visual Distinction

- [x] 6.1 Update Sidebar conversation list (`Sidebar.tsx`) — group icon for `type="group"`, single icon for `type="single"`
- [x] 6.2 Update ChatPanel header — show member count for group, keep existing "Direct Channel" for single

## 7. Frontend: Message Edit & Delete

- [x] 7.1 Add hover state tracking and edit/delete buttons to last user message in `ChatPanel.tsx`
- [x] 7.2 Add editing state (`editingMessageId`, `editContent`) and textarea edit mode
- [x] 7.3 Wire up save — call `PATCH /api/conversations/:id/messages/:msgId/update`
- [x] 7.4 Wire up delete — call `DELETE /api/conversations/:id/messages/:msgId/delete` with confirmation

## 8. Frontend: Agent Edit

- [x] 8.1 Create `EditAgentModal.tsx` component (reuse layout from `CreateAgentModal`, add `initialData` prop)
- [x] 8.2 Add Edit button to Agent detail page (`[id]/page.tsx`) — opens EditAgentModal with current data
- [x] 8.3 Wire up save — call `PATCH /api/contacts/:id/update`, refresh detail on success
- [x] 8.4 Add i18n strings for edit modal (title, labels, save button)

## 9. Verification

- [x] 9.1 Run `pnpm lint` — pre-existing lint errors only (config issues, not from changes)
- [x] 9.2 Run `pnpm --filter @agenthub/db test` — 31/31 passed
- [x] 9.3 Run `pnpm --filter @agenthub/server test` — 128/128 passed
- [x] 9.4 Run `pnpm --filter @agenthub/web test` — pre-existing test setup failures (missing env/provider), not related to changes
- [x] 9.5 Manual smoke test: register → create agent → start chat → send message → verify SSE stream works → receive agent response
- [x] 9.6 Manual test: click Start Chat twice on same agent → verify second click reuses existing conversation
- [x] 9.7 Manual test: create group chat from Sidebar → verify group icon and member display
- [x] 9.8 Manual test: edit last user message → verify save and display update
- [x] 9.9 Manual test: edit agent name/systemPrompt → verify persistence
