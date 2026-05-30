## ADDED Requirements

### Requirement: Agent fields merged into Contact

The Contact model SHALL absorb all fields from the Agent model, and the Agent model SHALL be removed.

#### Scenario: Contact has all Agent fields

- **GIVEN** the Prisma schema
- **THEN** the Contact model SHALL have fields: `id`, `userId`, `name`, `avatarUrl`, `provider`, `systemPrompt`, `model`, `workspacePath`, `config`, `displayName`, `tags`, `isPinned`, `createdAt`, `updatedAt`
- **AND** the Agent model SHALL NOT exist

#### Scenario: Contact creation includes agent config

- **WHEN** a user creates a Contact via `POST /api/contacts/create`
- **THEN** the payload SHALL accept: `name`, `provider`, `systemPrompt`, `model`, `config`
- **AND** the Contact SHALL be created directly (no Agent record needed)

#### Scenario: Contact list returns agent info

- **WHEN** a user calls `GET /api/contacts/list`
- **THEN** the response SHALL include agent fields (`name`, `provider`, `model`, etc.)
- **AND** the response SHALL NOT require a join to any other table

### Requirement: Conversation uses contactIds

The `Conversation.agentIds` field SHALL be renamed to `contactIds`.

#### Scenario: Conversation stores contact IDs

- **WHEN** a conversation is created with participants
- **THEN** the `contactIds` field SHALL store Contact IDs
- **AND** the `agentIds` field SHALL NOT exist

#### Scenario: Single-agent conversation

- **WHEN** a user creates a single-agent conversation
- **THEN** the `contactIds` array SHALL contain exactly one Contact ID

### Requirement: API routes use `/api/contacts/`

Agent CRUD operations SHALL be accessible under `/api/contacts/` routes.

#### Scenario: Create via contacts

- **WHEN** a user sends `POST /api/contacts/create` with agent config
- **THEN** a Contact record SHALL be created with all provided fields
- **AND** the response SHALL return the Contact object

#### Scenario: List via contacts

- **WHEN** a user sends `GET /api/contacts/list`
- **THEN** the response SHALL return the user's Contact list (i.e., their agents)

#### Scenario: Old agent routes removed

- **WHEN** a user sends `POST /api/agents/create`
- **THEN** the response SHALL be 404 (route no longer registered)

### Requirement: Seed data uses Contacts

The database seed script SHALL create Contacts instead of Agents.

#### Scenario: Seed creates contacts with agent config

- **WHEN** seed runs
- **THEN** Contact records SHALL be created with `name`, `provider`, `systemPrompt`, `model`, `config`
- **AND** no Agent records SHALL be created
