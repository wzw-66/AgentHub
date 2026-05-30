## ADDED Requirements

### Requirement: Contact list scoped to current user

The system SHALL return only the authenticated user's own contacts when listing contacts, filtering by `Contact.userId`.

#### Scenario: List returns user's own contacts

- **WHEN** authenticated user A calls `GET /api/contacts/list`
- **THEN** the response SHALL only include contacts where `Contact.userId` equals user A's ID
- **AND** contacts created by other users SHALL NOT be included

#### Scenario: List with provider filter respects ownership

- **WHEN** authenticated user calls `GET /api/contacts/list?provider=Claude`
- **THEN** the response SHALL only include Claude contacts where `userId` equals the current user

#### Scenario: Admin can list all contacts (future)

- **WHEN** `/api/contacts/list?all=true` is called with admin privileges
- **THEN** the response SHALL include all contacts regardless of creator (reserved for future admin/market feature)

### Requirement: Contact list is a plain array

The `GET /api/contacts/list` endpoint SHALL return a JSON array directly, not wrapped in an envelope object.

#### Scenario: Response is plain array

- **WHEN** user calls `GET /api/contacts/list`
- **THEN** the response body SHALL be a JSON array of Contact objects, not `{ contacts: [...] }`

### Requirement: Contact detail returns a single contact

The `GET /api/contacts/:id/detail` endpoint SHALL return the contact regardless of ownership.

#### Scenario: Can view any contact's detail

- **WHEN** user calls `GET /api/contacts/:id/detail` for any contact
- **THEN** the response SHALL return the contact if it exists, regardless of who created it
