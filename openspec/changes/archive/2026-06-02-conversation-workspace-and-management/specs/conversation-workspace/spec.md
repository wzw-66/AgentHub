## ADDED Requirements

### Requirement: Create conversation workspace directory
The system SHALL create a workspace directory on disk when a conversation is created.

#### Scenario: Single conversation creates workspace
- **WHEN** user creates a single-agent conversation
- **THEN** a directory at `agent-workspace/{userEmail}/conversations/{conversationId}/` SHALL be created
- **AND** the directory path SHALL be stored in the conversation's `workspacePath` field

#### Scenario: Group conversation creates workspace
- **WHEN** user creates a group conversation
- **THEN** a directory at `agent-workspace/{userEmail}/conversations/{conversationId}/` SHALL be created
- **AND** the directory path SHALL be stored in the conversation's `workspacePath` field

#### Scenario: Directory creation failure returns error
- **WHEN** the filesystem fails to create the workspace directory
- **THEN** the API SHALL return HTTP 500 with an error message
- **AND** the conversation record SHALL NOT be created

### Requirement: Use conversation workspace as AI execution cwd
The system SHALL use the conversation's workspace directory as the AI adapter's working directory (`cwd`).

#### Scenario: Conversation with workspacePath
- **WHEN** an AI agent executes in a conversation that has `workspacePath`
- **THEN** the AI adapter SHALL use `resolve(SERVER_ROOT, conversation.workspacePath)` as `cwd`

#### Scenario: Conversation without workspacePath (backward compatibility)
- **WHEN** an AI agent executes in a conversation that does NOT have `workspacePath`
- **THEN** the AI adapter SHALL use `resolve(SERVER_ROOT, agent.workspacePath)` as `cwd` (fallback)
- **AND** if neither path exists, `cwd` SHALL be `undefined`

### Requirement: User email sanitization for workspace path
The system SHALL sanitize user email for filesystem-safe directory names.

#### Scenario: Email contains special characters
- **WHEN** creating a workspace directory
- **THEN** non-alphanumeric characters (except `@`, `.`, `_`, `-`) in the user email SHALL be replaced with `_`
- **AND** the resulting directory name SHALL be filesystem-safe
