## ADDED Requirements

### Requirement: Provider selection with segmented control

Agent creation form SHALL provide a segmented control for selecting the agent provider with three options: "Claude", "OpenCode", and "Custom".

#### Scenario: Default provider is Claude
- **WHEN** the create agent modal opens
- **THEN** the provider segmented control SHALL show "Claude" as the default selected option

#### Scenario: Switching provider hides/shows fields
- **WHEN** user selects "Claude" or "OpenCode"
- **THEN** the form SHALL only show Name and System Prompt fields (no Provider name, API URL, API Key, or Model fields)
- **WHEN** user selects "Custom"
- **THEN** the form SHALL additionally show Provider name, API URL, API Key, and Model fields

### Requirement: Agent name validation

Agent name SHALL be required (non-empty string) and trimmed of leading/trailing whitespace.

#### Scenario: Empty name shows error
- **WHEN** user submits the form with an empty name
- **THEN** the form SHALL display a validation error "Name cannot be empty" and SHALL NOT submit

#### Scenario: Name with only whitespace
- **WHEN** user submits the form with a name containing only whitespace
- **THEN** the form SHALL treat it as empty and show the validation error

### Requirement: System prompt length limit

System prompt SHALL have a maximum length of 4000 characters.

#### Scenario: System prompt too long
- **WHEN** user submits the form with a system prompt exceeding 4000 characters
- **THEN** the form SHALL display a validation error "System prompt exceeds 4000 characters" and SHALL NOT submit

### Requirement: Custom provider fields

When provider is "Custom", the form SHALL show additional fields: Provider name, API URL, API Key, and Model.
Provider name SHALL be required (e.g., "OpenAI", "Anthropic") for display/labeling purposes.
API URL SHALL be required.
API Key SHALL be required.
Model is optional with a default placeholder.

#### Scenario: Custom provider missing Provider name
- **WHEN** user selects "Custom" provider and submits without entering a Provider name
- **THEN** the form SHALL display a validation error "Provider name is required"

#### Scenario: Custom provider missing API URL
- **WHEN** user selects "Custom" provider and submits without entering an API URL
- **THEN** the form SHALL display a validation error "API URL is required"

#### Scenario: Custom provider missing API Key
- **WHEN** user selects "Custom" provider and submits without entering an API Key
- **THEN** the form SHALL display a validation error "API Key is required"

### Requirement: Workspace path preview

Agent creation form SHALL display a read-only preview of the workspace path, generated as `agent-workspace/{user.email}/{agent.name}/`.

#### Scenario: Workspace path updates as user types name
- **WHEN** user types in the name field
- **THEN** the workspace path preview SHALL update in real-time to reflect the current name
- **WHEN** the name field is empty
- **THEN** the workspace path preview SHALL show `agent-workspace/{email}/...` as a placeholder

### Requirement: Agent creation API contract

The server `POST /api/agents/create` endpoint SHALL accept the following body:

```json
{
  "name": "string (required)",
  "provider": "Claude | OpenCode | Custom",
  "systemPrompt": "string (optional)",
  "avatarUrl": "string (optional)",
  "model": "string (optional, only used for Custom)",
  "config": {
    "providerName": "string (required if Custom, e.g. OpenAI)",
    "apiUrl": "string (required if Custom)",
    "apiKey": "string (required if Custom)"
  }
}
```

The server SHALL:
1. Validate input
2. Create the Agent record in DB with `creatorId` set to the authenticated user's ID
3. Create the workspace directory at `agent-workspace/{email}/{name}/`
4. Return 201 with the created Agent object

#### Scenario: Successful agent creation
- **WHEN** a valid agent creation request is submitted
- **THEN** server returns HTTP 201 with the created Agent object containing `id`, `name`, `provider`, `creatorId`, `workspacePath`, and `createdAt`
- **AND** the workspace directory SHALL exist on disk at the path specified by `workspacePath`

#### Scenario: Invalid provider returns 400
- **WHEN** an agent creation request contains an invalid provider (e.g., "unknown")
- **THEN** server returns HTTP 400 with an error message

#### Scenario: Filesystem write failure returns 500
- **WHEN** the server fails to create the workspace directory (e.g., permission denied)
- **THEN** server returns HTTP 500 and the Agent record SHALL NOT be created (transaction rollback)

### Requirement: Workspace directory structure

When an agent is created, the server SHALL create a directory at `agent-workspace/{email}/{name}/` relative to the project root.

- The email part SHALL be sanitized to only allow `[a-zA-Z0-9@._-]`
- The name part SHALL be sanitized to only allow `[a-zA-Z0-9\u4e00-\u9fff_-]`
- The directory SHALL be created with `recursive: true`

#### Scenario: Email with special characters
- **WHEN** the authenticated user's email contains characters outside `[a-zA-Z0-9@._-]`
- **THEN** those characters SHALL be replaced with `_` in the directory path

### Requirement: Agent list API returns user's agents

The server `GET /api/agents/list` endpoint SHALL return agents with their `creatorId` field populated.

#### Scenario: Agent list includes creatorId
- **WHEN** the frontend calls `GET /api/agents/list`
- **THEN** each returned agent object SHALL include a `creatorId` field

#### Scenario: Chat context loads agents correctly
- **WHEN** `chat-context` loads agents via `GET /api/agents/list`
- **THEN** the response SHALL be a plain array (not wrapped in `{ agents: [...] }`)
