## ADDED Requirements

### Requirement: Pin conversation from sidebar
The Sidebar conversation list SHALL provide a way to pin/unpin conversations.

#### Scenario: Pin conversation
- **WHEN** user hovers over a conversation in the sidebar
- **AND** clicks the Pin action
- **THEN** system calls `PATCH /api/conversations/:id/update` with `isPinned: true`
- **AND** the conversation moves to the top of the list with a pin indicator

#### Scenario: Unpin conversation
- **WHEN** user hovers over a pinned conversation
- **AND** clicks the Unpin action
- **THEN** system calls the update API with `isPinned: false`
- **AND** the pin indicator is removed

### Requirement: Archive conversation from sidebar
The Sidebar conversation list SHALL provide a way to archive/unarchive conversations.

#### Scenario: Archive conversation
- **WHEN** user hovers over a conversation
- **AND** clicks Archive
- **THEN** system calls `PATCH /api/conversations/:id/update` with `isArchived: true`
- **AND** the conversation is hidden from the default list

#### Scenario: Show archived conversations
- **WHEN** user toggles "Show archived" filter
- **THEN** system calls `/api/conversations/list` with `includeArchived=true`
- **AND** archived conversations are shown with an archived indicator

### Requirement: Delete conversation from sidebar
The Sidebar SHALL provide a way to delete a conversation with confirmation.

#### Scenario: Delete conversation
- **WHEN** user hovers over a conversation
- **AND** clicks Delete
- **THEN** a confirmation prompt appears
- **WHEN** user confirms deletion
- **THEN** system calls `DELETE /api/conversations/:id/delete`
- **AND** the conversation is removed from the list
