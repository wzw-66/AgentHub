## ADDED Requirements

### Requirement: Add-agent view shows all available agents
The `add-agent` view SHALL display all available contacts (agents) in a scrollable list.

#### Scenario: Agent list displayed
- **WHEN** Sidebar switches to `add-agent` view
- **THEN** all available contacts are displayed as a list with avatar, name, and short description

#### Scenario: Agent list supports scrolling
- **WHEN** there are more agents than visible space
- **THEN** the agent list scrolls vertically

### Requirement: Search agents in add-agent view
The `add-agent` view SHALL provide a search box to filter agents by name.

#### Scenario: Search filters agent list
- **WHEN** user types in the search box
- **THEN** the agent list filters to show only agents whose names match the search query

#### Scenario: Empty search results
- **WHEN** search query matches no agents
- **THEN** display a "no results" empty state message

### Requirement: Single/group mode toggle
The `add-agent` view SHALL support two modes: single chat and group chat, with a toggle control.

#### Scenario: Default to single mode
- **WHEN** user enters `add-agent` view
- **THEN** default mode is "single chat"

#### Scenario: Single mode - click agent creates chat
- **WHEN** user is in single mode and clicks an agent
- **THEN** a new single conversation is created with that agent and Sidebar returns to `chats` view

#### Scenario: Toggle to group mode
- **WHEN** user clicks "群聊" toggle
- **THEN** mode switches to group mode and agents show selection checkboxes

#### Scenario: Group mode - select multiple agents
- **WHEN** user is in group mode and clicks multiple agents
- **THEN** each clicked agent toggles selection state with visual checkbox indicator

### Requirement: Group creation flow
The `add-agent` view SHALL show a create group button when in group mode.

#### Scenario: Create group button disabled
- **WHEN** fewer than 2 agents are selected in group mode
- **THEN** the "创建群聊" button is disabled

#### Scenario: Create group button enabled
- **WHEN** 2 or more agents are selected in group mode
- **THEN** the "创建群聊" button is enabled showing selected count

#### Scenario: Create group conversation
- **WHEN** user clicks "创建群聊" with 2+ agents selected
- **THEN** a new group conversation is created, Sidebar returns to `chats` view, and the new conversation is opened

### Requirement: Add-agent back navigation
The `add-agent` view SHALL provide a way to return to the chats view.

#### Scenario: Back button
- **WHEN** user clicks the back button (←) in the `add-agent` view header
- **THEN** Sidebar returns to `chats` view without creating any conversation
