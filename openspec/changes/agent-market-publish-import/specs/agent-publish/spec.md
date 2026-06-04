## ADDED Requirements

### Requirement: User can publish an agent to market

The system SHALL allow users to publish their own custom agents to the market. Publishing creates a snapshot of the agent configuration (name, provider, model, systemPrompt, config) into a `PublishedAgent` record.

#### Scenario: Successful publish from agent detail
- **WHEN** user views their agent detail page and clicks "Publish to Market"
- **THEN** a publish modal appears with fields for description and tags
- **WHEN** user fills in description and tags and confirms
- **THEN** system creates a PublishedAgent record with a snapshot of the agent config
- **THEN** system shows success message and redirects to the market listing page

#### Scenario: Publish with minimal info
- **WHEN** user clicks "Publish to Market" and leaves description empty and tags empty
- **THEN** system still creates the PublishedAgent successfully (description and tags are optional)
- **THEN** system shows success message

#### Scenario: Publish built-in agent (Claude/OpenCode)
- **WHEN** user views a built-in agent detail page (provider is Claude or OpenCode)
- **THEN** the "Publish to Market" button SHALL appear
- **WHEN** user clicks the button and confirms
- **THEN** system creates a PublishedAgent record successfully

### Requirement: Creator can unpublish their agent

The system SHALL allow the original creator to remove their published agent from the market.

#### Scenario: Successful unpublish
- **WHEN** creator views their published agent detail and clicks "Unpublish"
- **WHEN** creator confirms the action
- **THEN** system deletes the PublishedAgent record
- **THEN** system shows success message
- **THEN** the agent no longer appears in market listings

#### Scenario: Non-creator attempts to unpublish
- **WHEN** a user who is not the creator attempts to unpublish an agent
- **THEN** system returns 403 error: "Forbidden"

### Requirement: Creator can update their published agent

The system SHALL allow the creator to update the description and tags of their published agent listing.

#### Scenario: Successful update
- **WHEN** creator views their published agent and edits description or tags
- **THEN** system updates the PublishedAgent record
- **THEN** changes are reflected in market listings immediately

#### Scenario: Creator published agent list
- **WHEN** creator visits "My Published Agents" section
- **THEN** system displays all agents published by this user
- **THEN** each listing shows import count and publish date

### Requirement: Publish fails for non-existent agent

The system SHALL validate that the source Contact exists and belongs to the current user before publishing.

#### Scenario: Publish non-existent contact
- **WHEN** user attempts to publish a contact that does not exist
- **THEN** system returns 404 error: "Contact not found"

#### Scenario: Publish another user's contact
- **WHEN** user attempts to publish a contact that belongs to another user
- **THEN** system returns 403 error: "Forbidden"
