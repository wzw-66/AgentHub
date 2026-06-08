## ADDED Requirements

### Requirement: @mention popup activates in group chat input

The system SHALL show the MentionPopup when user types "@" followed by a query in a group chat textarea.

#### Scenario: @mention activates on typing @
- **WHEN** conversation type is "group"
- **WHEN** user types "@" in the input textarea
- **WHEN** cursor is immediately after "@" (no space between)
- **THEN** MentionPopup appears with filtered agent list
- **THEN** popup shows agents whose name matches the query text after "@"

#### Scenario: @mention closes on Escape
- **WHEN** MentionPopup is open
- **WHEN** user presses Escape
- **THEN** MentionPopup closes
- **THEN** input text is unchanged

#### Scenario: @mention selects agent on Enter
- **WHEN** MentionPopup is open
- **WHEN** an agent is highlighted (via arrow keys or default)
- **WHEN** user presses Enter
- **THEN** `@query` text is replaced with `@AgentName ` (trailing space)
- **THEN** MentionPopup closes
- **THEN** cursor moves after the trailing space

### Requirement: @mention works only in group chat context

The @mention feature SHALL NOT activate in single-agent conversations.

#### Scenario: @mention does not activate in single chat
- **WHEN** conversation type is "single"
- **WHEN** user types "@" in input
- **THEN** no MentionPopup appears
- **THEN** "@" is treated as literal text

### Requirement: @mention forwards agent name to backend via message content

The selected @AgentName text SHALL be sent as part of the message content to the API, and the backend intent-analyzer SHALL resolve it.

#### Scenario: @AgentName sent in message
- **WHEN** user sends a message containing `@设计师 ...`
- **THEN** the raw message content `@设计师 ...` is sent to `POST /api/conversations/:id/messages/create`
- **THEN** the backend intent-analyzer receives the full text with @mention
- **THEN** the intent-analyzer resolves the mention to the correct agent ID
