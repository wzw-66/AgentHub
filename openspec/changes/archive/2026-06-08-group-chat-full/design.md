## Context

Current state:
- `MentionPopup` component exists with full UI (floating list, keyboard navigation, selection handling)
- `ChatPanel.tsx` has @mention detection logic gated by `isGroupChat` (line 204: `if (!isGroupChat || !textareaRef.current)`)
- "New Chat" dialog in `Sidebar.tsx` only supports single-agent selection → creates `type: "single"` conversations
- `RightPanel.tsx` renders `GroupSection` for group chats but `onAddMember={() => {}}` and `onRemoveMember` are no-ops
- Backend already has `/api/conversations/create` with `type` and `contactIds` support
- Backend has `/api/contacts/list` for fetching available agents
- Orchestrator intent-analyzer already understands @AgentName syntax in LLM prompts

## Goals / Non-Goals

**Goals:**
- Enable creating group conversations by selecting multiple agents in the New Chat dialog
- Wire up group member add/remove in RightPanel GroupSection with real API calls
- Ensure @mention feature activates and works correctly in group chat context
- Verify end-to-end flow: create group → chat with @mention → multi-agent response

**Non-Goals:**
- Group conversation discovery / directory (finding public groups)
- Group admin roles (owner/moderator distinction)
- Group chat naming/rename flow (uses auto-generated title for now)
- Message forwarding between conversations
- @mention for non-agent contacts (user-to-user mention)

## Decisions

### 1. New Chat Dialog: Expand existing dialog vs create new component
- **Decision**: Enhance the existing dialog in `Sidebar.tsx` with a multi-select mode toggle
- **Rationale**: Single dialog for all conversation creation is simpler UX. A "Group Chat" toggle switches between single-select and multi-select modes. Avoids creating a separate component for what is fundamentally the same flow.

### 2. Group member management API
- **Decision**: Add `addMembers` and `removeMembers` fields to existing `PATCH /api/conversations/:id/update` endpoint
- **Rationale**: The update endpoint already handles conversation mutations. Adding member arrays avoids creating new route modules. Backward compatible — existing clients unaffected.

### 3. @mention UX treatment
- **Decision**: No changes needed to existing @mention code in `ChatPanel.tsx`. The only missing piece was a way to reach `isGroupChat === true`.
- **Rationale**: The mention detection, popup rendering, keyboard nav, and selection logic are all verified complete. Once group chat is creatable, @mention works automatically.

### 4. GroupSection add/remove wiring
- **Decision**: RightPanel passes real API-backed handlers instead of no-op functions
- **Rationale**: GroupSection component is already well-designed. The only gap is that `onAddMember` and `onRemoveMember` props receive empty functions. We need to:
  - `onAddMember`: Open a contact selection overlay (lightweight modal), then call the API
  - `onRemoveMember`: Call the API directly with the member ID, then refresh

## Risks / Trade-offs

- **[Risk] Adding/removing group members mid-conversation**: If an agent is removed while it's being assigned a sub-task, that execution may fail.
  → **Mitigation**: Member removal triggers a cascade: active streaming for that agent is aborted via `ConnectionManager`, and the orchestrator skips removed agents in future intent analysis.

- **[Risk] Large group chats (10+ agents)**: The mention popup filters by query text, but with many agents the list scrolls.
  → **Mitigation**: Already limited to showing top 5 filtered results. Acceptable for now.

- **[Risk] Group creation without at least 2 agents**: A group chat with 0 or 1 agents doesn't make sense.
  → **Mitigation**: The multi-select dialog enforces minimum 2 selections before enabling the "Create" button.
