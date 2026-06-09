## ADDED Requirements

### Requirement: Client prevents duplicate message submission
The system SHALL prevent duplicate message submission when the user triggers send more than once in rapid succession.

#### Scenario: Double-click send button
- **WHEN** user clicks send button twice within 100ms
- **THEN** only one POST /messages/create request SHALL be sent

#### Scenario: Double-press Enter key
- **WHEN** user presses Enter twice within 100ms
- **THEN** only one POST /messages/create request SHALL be sent

#### Scenario: Normal single send still works
- **WHEN** user clicks send once
- **THEN** one POST /messages/create request SHALL be sent

### Requirement: Group chat done event carries valid messageId
The orchestrator SHALL emit done events with the actual database messageId for each completed agent task.

#### Scenario: Agent completes in group chat
- **WHEN** an agent finishes executing in a group conversation
- **THEN** the done event SHALL contain the agent's saved message database ID
- **THEN** the client SHALL be able to deduplicate using this ID

### Requirement: No redundant message fetch on done
The client SHALL NOT fetch all messages from the API when a done event is received, since finalizeMessage already handles the message correctly.

#### Scenario: Done event received
- **WHEN** client receives a done event
- **THEN** finalizeMessage SHALL convert the streaming message to permanent
- **THEN** no additional fetchMessages API call SHALL be made
