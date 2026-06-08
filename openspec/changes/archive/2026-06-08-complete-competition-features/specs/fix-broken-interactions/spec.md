## ADDED Requirements

### Requirement: Sidebar contact pill opens correct conversation
When a user clicks a contact pill in the Sidebar, the system SHALL create or open an existing single conversation with that agent, rather than using the agent ID as a conversation ID.

#### Scenario: Click contact pill opens existing conversation
- **WHEN** user clicks a contact pill for an agent
- **THEN** system calls `/api/conversations/find-by-agent/:agentId`
- **WHEN** a conversation already exists
- **THEN** system sets that conversation as active

#### Scenario: Click contact pill creates new conversation
- **WHEN** user clicks a contact pill for an agent
- **AND** no existing conversation with that agent exists
- **THEN** system creates a new single conversation with that agent
- **AND** sets it as active

### Requirement: Regenerate button triggers API call
The "重新生成" button on AI messages SHALL call the regenerate API endpoint and handle the streaming response.

#### Scenario: Regenerate button clicked
- **WHEN** user clicks "重新生成" on an AI message
- **THEN** system calls `POST /api/conversations/:conversationId/messages/:messageId/regenerate`
- **AND** the existing AI message content gets replaced

### Requirement: Pin button triggers API call
The "Pin" (Fork) button on messages SHALL call the pin API endpoint.

#### Scenario: Pin message
- **WHEN** user clicks Pin button on a message
- **THEN** system calls `POST /api/conversations/:conversationId/messages/:messageId/pin`
- **AND** the button state updates to reflect pinned status

### Requirement: Agent detail page add contact works correctly
The "添加到联系人" button on the Agent detail page SHALL correctly create a contact by calling the contacts API with valid parameters.

#### Scenario: Add agent as contact
- **WHEN** user clicks "添加到联系人" on an agent detail page
- **THEN** system calls `POST /api/contacts/create` with `name`, `provider` fields
- **AND** displays success state

### Requirement: CreateAgentModal refresh without page reload
After creating an agent, the contacts list SHALL refresh without a full page reload.

#### Scenario: Agent created closes modal and refreshes
- **WHEN** user submits the CreateAgentModal form successfully
- **THEN** modal closes
- **AND** the contacts list in the ChatContext refreshes
- **AND** no `window.location.reload()` is called
