## ADDED Requirements

### Requirement: Agent management entry point
The Sidebar SHALL provide a visible button to access the Agent management view.

#### Scenario: Agent button in sidebar header
- **WHEN** Sidebar is in `chats` view
- **THEN** the header shows a "🤖" button that transitions to `agents` view

### Requirement: Agent list display
The Agent management view SHALL display all agents created by the current user in a card layout.

#### Scenario: Agent cards shown
- **WHEN** user enters `agents` view
- **THEN** all created agents are displayed as cards, each showing: avatar/initial, name, description, capability tags

#### Scenario: Empty agent list
- **WHEN** user has no created agents
- **THEN** display an empty state with message and a prompt to create an agent

#### Scenario: Scrollable list
- **WHEN** there are more agents than visible space
- **THEN** the agent list scrolls vertically

### Requirement: Search agents in management view
The Agent management view SHALL provide a search box to filter agents by name.

#### Scenario: Search filters agent cards
- **WHEN** user types in the search box
- **THEN** agent cards are filtered to show only agents whose names match the query

#### Scenario: Search no results
- **WHEN** no agents match the search query
- **THEN** display a "no results" empty state

### Requirement: Edit agent
The Agent management view SHALL allow editing an existing agent.

#### Scenario: Click edit button
- **WHEN** user clicks the edit button (✏️) on an agent card
- **THEN** the EditAgentModal is opened with the agent's current data pre-filled

#### Scenario: Edit and save
- **WHEN** user modifies agent data in EditAgentModal and confirms
- **THEN** the agent is updated and the agent list refreshes

### Requirement: Delete agent
The Agent management view SHALL allow deleting an existing agent with confirmation.

#### Scenario: Click delete button
- **WHEN** user clicks the delete button (🗑️) on an agent card
- **THEN** a confirmation prompt is shown

#### Scenario: Confirm delete
- **WHEN** user confirms deletion
- **THEN** the agent is deleted and the agent list refreshes

#### Scenario: Cancel delete
- **WHEN** user cancels deletion
- **THEN** no action is taken and the agent remains

### Requirement: Create agent from management view
The Agent management view SHALL provide a button to create a new agent.

#### Scenario: Create agent button
- **WHEN** user clicks the "创建新 Agent" button at the bottom of the agents view
- **THEN** the CreateAgentModal is opened

#### Scenario: Agent created successfully
- **WHEN** user creates a new agent via CreateAgentModal
- **THEN** the agent list refreshes to show the new agent

### Requirement: Back navigation from agents view
The Agent management view SHALL provide a way to return to the chats view.

#### Scenario: Back button
- **WHEN** user clicks the back button (←) in the `agents` view header
- **THEN** Sidebar returns to `chats` view
