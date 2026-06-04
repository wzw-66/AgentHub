## ADDED Requirements

### Requirement: Delete contact from contact list
The system SHALL allow users to delete a contact (agent) from the contact list page.

#### Scenario: Click delete shows confirmation
- **WHEN** user clicks the delete button on a contact in the contact list
- **THEN** a confirmation dialog SHALL appear inline with "Confirm?" and "Cancel" buttons

#### Scenario: Confirm delete removes contact
- **WHEN** user clicks "Confirm" in the confirmation dialog
- **THEN** the system SHALL send `DELETE /api/contacts/{id}/delete`
- **AND** the contact SHALL be removed from the contact list and any cached contact data

#### Scenario: Cancel delete dismisses dialog
- **WHEN** user clicks "Cancel" in the confirmation dialog
- **THEN** the delete confirmation SHALL close
- **AND** the contact SHALL remain unchanged

### Requirement: Delete contact from agent detail page
The system SHALL allow users to delete an agent from the agent detail page.

#### Scenario: Detail page shows delete button
- **WHEN** viewing an agent's detail page
- **THEN** a delete button SHALL be displayed

#### Scenario: Confirm delete on detail page
- **WHEN** user clicks delete on the detail page and confirms
- **THEN** the system SHALL send `DELETE /api/contacts/{id}/delete`
- **AND** redirect the user back to the agent list page
- **AND** show a success feedback

### Requirement: Delete contact from backend (already implemented)
The backend SHALL support deleting a contact by ID with ownership verification.

#### Scenario: Contact exists and belongs to user
- **WHEN** `DELETE /api/contacts/{id}/delete` is called with the owner's token
- **THEN** the contact SHALL be deleted from the database
- **AND** HTTP 204 SHALL be returned

#### Scenario: Contact belongs to another user
- **WHEN** `DELETE /api/contacts/{id}/delete` is called for a contact owned by another user
- **THEN** HTTP 403 SHALL be returned

#### Scenario: Conversations referencing deleted contact unaffected
- **WHEN** a contact is deleted
- **THEN** existing conversations referencing that contact ID SHALL remain intact
