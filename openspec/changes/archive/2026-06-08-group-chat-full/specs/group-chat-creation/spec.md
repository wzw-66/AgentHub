## ADDED Requirements

### Requirement: User can create a group conversation by selecting multiple agents

The system SHALL provide a multi-select dialog for creating group conversations. Users SHALL be able to toggle between single-agent chat creation and multi-agent group creation.

#### Scenario: Create group with 2+ agents
- **WHEN** user clicks "+" button in sidebar
- **WHEN** user toggles to "Group Chat" mode
- **WHEN** user selects 2 or more agents from the contact list
- **WHEN** user clicks "Create Group"
- **THEN** system calls `POST /api/conversations/create` with `type: "group"` and `contactIds: [id1, id2, ...]`
- **THEN** system navigates to the newly created group conversation

#### Scenario: Create group button disabled with < 2 agents
- **WHEN** user is in group creation mode
- **WHEN** fewer than 2 agents are selected
- **THEN** the "Create Group" button SHALL be disabled
- **THEN** UI shows hint text "请至少选择 2 个 Agent"

#### Scenario: Group conversation renders correctly
- **WHEN** user opens a group conversation
- **THEN** the conversation header shows group indicator
- **THEN** @mention placeholder text "@ 提及 Agent..." is shown in input area

### Requirement: Single-agent chat creation still works unchanged

The existing single-agent chat creation flow SHALL remain functional and unaffected.

#### Scenario: Single chat creation unaffected
- **WHEN** user is in single-agent mode
- **WHEN** user selects one agent
- **THEN** system creates `type: "single"` conversation as before
