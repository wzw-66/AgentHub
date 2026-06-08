## ADDED Requirements

### Requirement: API credentials list page
The system SHALL provide a dedicated page (`/credentials`) to manage API keys for custom agent providers.

#### Scenario: View credentials
- **WHEN** user navigates to the credentials page
- **THEN** system calls `GET /api/credentials/list`
- **AND** displays all stored credentials with masked keys (****)

#### Scenario: Add credential
- **WHEN** user fills in provider name and API key
- **AND** clicks Save
- **THEN** system calls `POST /api/credentials/create` with `provider` and `encryptedKey`
- **AND** the new credential appears in the list

#### Scenario: Delete credential
- **WHEN** user clicks Delete on a credential
- **AND** confirms
- **THEN** system calls `DELETE /api/credentials/:id/delete`
- **AND** the credential is removed from the list
