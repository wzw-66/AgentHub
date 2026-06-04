## ADDED Requirements

### Requirement: User can import a published agent

The system SHALL allow users to import any published agent's configuration into their own contacts. Importing creates a new `Contact` record with the same configuration (name, provider, model, systemPrompt) for the importing user.

#### Scenario: Successful import
- **WHEN** user views a published agent detail page and clicks "Import Agent"
- **THEN** system creates a new Contact for the importing user with:
  - name: same as published agent name
  - provider: same as published agent provider
  - model: same as published agent model (if any)
  - systemPrompt: same as published agent systemPrompt (if any)
- **THEN** the PublishedAgent's importCount is incremented by 1
- **THEN** system shows success toast: "Agent imported successfully"
- **THEN** user is redirected to their agent list

#### Scenario: Import with existing name conflict
- **WHEN** user imports an agent and already has a contact with the same name
- **THEN** system appends " (1)" or incrementing number to the new contact's name
- **THEN** import completes successfully

#### Scenario: Import loading state
- **WHEN** user clicks "Import Agent" and the request is processing
- **THEN** the button shows loading state and is disabled

#### Scenario: Import error
- **WHEN** import fails due to network or server error
- **THEN** system shows error message
- **THEN** the button re-enables for retry

#### Scenario: Import non-existent published agent
- **WHEN** user attempts to import a published agent that does not exist
- **THEN** system returns 404 error: "Published agent not found"

### Requirement: User can import their own published agent

The system SHALL allow a creator to import their own published agent.

#### Scenario: Self-import
- **WHEN** the creator of a published agent clicks "Import Agent" on their own listing
- **THEN** system creates a new Contact for the creator (same as any other import)
- **THEN** importCount is NOT incremented
- **THEN** system shows success message

### Requirement: Import deduplication tracking

The system SHALL track unique imports per user to provide accurate popularity metrics.

#### Scenario: Repeated import by same user
- **WHEN** the same user imports the same published agent multiple times
- **THEN** each import creates a new Contact (allowing multiple copies)
- **THEN** importCount is only incremented on the first import by this user
