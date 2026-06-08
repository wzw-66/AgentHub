## ADDED Requirements

### Requirement: Sidebar supports three views
The Sidebar SHALL support three distinct views: `chats` (默认会话列表), `add-agent` (添加 Agent), `agents` (Agent 管理).

#### Scenario: Default view on load
- **WHEN** user opens the application
- **THEN** Sidebar displays the `chats` view showing the conversation list

#### Scenario: Switch from chats to add-agent
- **WHEN** user clicks the "+" button in the Sidebar header
- **THEN** Sidebar transitions to the `add-agent` view

#### Scenario: Switch from chats to agents
- **WHEN** user clicks the "🤖" button in the Sidebar header
- **THEN** Sidebar transitions to the `agents` view

#### Scenario: Back navigation returns to chats
- **WHEN** user is in `add-agent` or `agents` view and clicks the back button (←)
- **THEN** Sidebar returns to the `chats` view

#### Scenario: Contact strip remains visible in all views
- **WHEN** user switches between Sidebar views
- **THEN** the contact pills strip and bottom section (create agent button, user info) remain visible

### Requirement: Smooth view transition animation
View transitions SHALL use CSS opacity and transform animations for a smooth feel.

#### Scenario: View fade-in animation
- **WHEN** Sidebar switches to a new view
- **THEN** the new view content fades in with a slight vertical slide (duration ~200ms)

### Requirement: Header adapts to current view
The Sidebar header SHALL display different content based on the active view.

#### Scenario: Header in chats view
- **WHEN** Sidebar is in `chats` view
- **THEN** header shows "AgentHub" title, "+" button, and "🤖" button

#### Scenario: Header in add-agent/agents view
- **WHEN** Sidebar is in `add-agent` or `agents` view
- **THEN** header shows a back button (←) and the view title ("添加 Agent" / "我的 Agent")
