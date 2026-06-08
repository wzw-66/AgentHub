## ADDED Requirements

### Requirement: User can remove a member from a group conversation

The system SHALL allow removing an agent from an existing group conversation via the RightPanel GroupSection.

#### Scenario: Remove member from group
- **WHEN** user clicks the ✕ button on a member card in GroupSection
- **WHEN** the remove animation completes
- **THEN** system calls `PATCH /api/conversations/:id/update` with `removeMembers: [agentId]`
- **THEN** the member disappears from the group members list
- **THEN** the member count updates

#### Scenario: Active streaming cancelled on member removal
- **WHEN** a member is being removed
- **WHEN** that member has an active streaming response
- **THEN** the streaming is aborted via ConnectionManager

### Requirement: User can add a member to a group conversation

The system SHALL allow adding an agent to an existing group conversation.

#### Scenario: Add member to group
- **WHEN** user clicks "+ 邀请" button in GroupSection
- **THEN** a contact selection overlay appears showing available agents (excluding current members)
- **WHEN** user selects an agent and confirms
- **THEN** system calls `PATCH /api/conversations/:id/update` with `addMembers: [agentId]`
- **THEN** the new member appears in the group members list
- **THEN** the member count updates

#### Scenario: Cannot add agent already in group
- **WHEN** the add member overlay is open
- **THEN** agents that are already group members are hidden or greyed out
