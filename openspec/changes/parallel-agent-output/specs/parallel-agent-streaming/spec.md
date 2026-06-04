## ADDED Requirements

### Requirement: Multi-agent parallel streaming

In group conversations, when multiple agents are assigned tasks, the system SHALL stream each agent's output independently and concurrently to the frontend.

#### Scenario: Two agents respond in parallel
- **WHEN** a user sends a message that triggers AgentA and AgentB in a group conversation
- **THEN** the frontend SHALL display two independent streaming message bubbles, one for each agent, updating concurrently

#### Scenario: Single streaming message per agent
- **WHEN** chunks arrive for different agentIds via SSE
- **THEN** each agentId SHALL have its own StreamingMessage entry, with content appended only to its own entry

### Requirement: Agent message persistence with real messageId

When an agent completes execution in a group conversation, the system SHALL persist the agent's response to the database and send the real messageId in the done SSE event.

#### Scenario: Message saved before done event
- **WHEN** an agent finishes streaming
- **THEN** the server SHALL save the response as a Contact message in the database BEFORE sending the done SSE event, and the done event SHALL include the real messageId

#### Scenario: Frontend receives real messageId
- **WHEN** the frontend receives a done event with a messageId
- **THEN** it SHALL use that messageId when finalizing the streaming message into a permanent message, ensuring the message can be identified by ID on page refresh

### Requirement: Windows subprocess window suppression

Agent adapter subprocess SHALL NOT display a console window on Windows.

#### Scenario: No console window on spawn
- **WHEN** the ClaudeAdapter or OpenCodeAdapter spawns a CLI subprocess on Windows
- **THEN** no console window SHALL appear to the user
