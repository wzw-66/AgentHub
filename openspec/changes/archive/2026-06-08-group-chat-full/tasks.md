## 1. Backend: Extend conversation update API

- [x] 1.1 Add `addMembers` and `removeMembers` fields to `PATCH /api/conversations/:id/update` route handler in `apps/server/src/routes/conversations.ts`
- [x] 1.2 Add repository functions `addConversationMembers` and `removeConversationMembers` in `packages/db/src/repositories/conversation.ts`
- [x] 1.3 Handle cascade: on member removal, abort active streaming for that agent via `ConnectionManager`

## 2. Frontend: Group chat creation dialog

- [x] 2.1 Add "Group Chat" toggle to New Chat dialog in `apps/web/components/Sidebar.tsx`
- [x] 2.2 Implement multi-select mode: allow checking multiple agent items, show selected count
- [x] 2.3 Validate minimum 2 agents selected → disable Create button otherwise with hint text
- [x] 2.4 Call `createConversation(title, "group", selectedIds)` on submit

## 3. Frontend: Group member management (RightPanel)

- [x] 3.1 Wire `onRemoveMember` in `apps/web/components/RightPanel.tsx` to call `PATCH /api/conversations/:id/update` with `removeMembers`
- [x] 3.2 Wire `onAddMember` to show contact selection overlay and call API with `addMembers`
- [x] 3.3 Filter out existing members from the add-member selection list

## 4. Frontend: Verify @mention end-to-end

- [x] 4.1 Create a group conversation via new dialog
- [x] 4.2 Verify @mention popup appears when typing `@` in group chat input
- [x] 4.3 Verify keyboard navigation (↑↓ Enter Escape) works correctly
- [x] 4.4 Verify `@AgentName` is included in sent message content
- [x] 4.5 Verify @mention does NOT activate in single-agent conversations

## 5. Polish and edge cases

- [x] 5.1 Refresh conversation list after member add/remove
- [x] 5.2 Handle error states: API failure on add/remove member shows user feedback
- [x] 5.3 Ensure group conversation header differentiates from single chat in sidebar
