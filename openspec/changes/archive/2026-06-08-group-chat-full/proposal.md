## Why

The @"mention" feature for selecting agents in group chats is fully implemented in the frontend (MentionPopup component, detection logic, keyboard navigation) and backend (intent-analyzer LLM prompt), but users can never trigger it because there is no UI to create group conversations. The "New Chat" dialog only creates single-agent chats, so `isGroupChat` is always `false` and the @mention detection never activates. 群聊管理面板（RightPanel GroupSection）的添加/移除成员按钮也是空函数，没有实际功能。

## What Changes

- **New Chat dialog enhancement**: Support multi-select of agents to create group conversations (type: "group")
- **Group member management**: Wire up GroupSection's add/remove member buttons with actual API calls
- **@mention activation test**: Verify @mention detection (`ChatPanel.tsx:202-219`) works end-to-end when group chat context is available
- **RightPanel group UX**: Make group member management functional, not just visual

## Capabilities

### New Capabilities

- `group-chat-creation`: Multi-select dialog for creating group conversations with multiple agents
- `group-member-management`: Add/remove agents from existing group conversations via RightPanel
- `chat-mention`: @mention agent selection in group chat input (currently code-complete but untestable without group chat entry)

### Modified Capabilities

<!-- No existing capability specs need requirement changes -->

## Impact

- `apps/web/components/Sidebar.tsx` — New Chat dialog (add multi-select + group creation)
- `apps/web/components/RightPanel.tsx` — Wire up GroupSection callbacks
- `apps/web/components/GroupSection.tsx` — onAddMember/onRemoveMember need backend API integration
- `apps/web/components/ChatPanel.tsx` — @mention already implemented, may need minor polish
- `apps/web/lib/chat-context.tsx` — May need new API methods for group management
- `apps/server/src/routes/conversations.ts` — May need endpoint for adding/removing members
- `apps/server/src/routes/contacts.ts` — Verify contact list endpoint supports group creation flow
