## ADDED Requirements

### Requirement: Delete conversation from sidebar
The system SHALL allow users to delete a conversation from the sidebar UI.

#### Scenario: Hover shows delete button
- **WHEN** user hovers over a conversation item in the sidebar
- **THEN** a delete icon/button SHALL appear on that item

#### Scenario: Click delete shows confirmation
- **WHEN** user clicks the delete button on a conversation
- **THEN** a confirmation dialog SHALL appear with "Confirm delete?" text
- **AND** "Delete" and "Cancel" action buttons SHALL be displayed

#### Scenario: Confirm delete removes conversation
- **WHEN** user clicks "Delete" in the confirmation dialog
- **THEN** the system SHALL send `DELETE /api/conversations/{id}/delete`
- **AND** the conversation SHALL be removed from the UI list
- **AND** if it was the active conversation, the chat panel SHALL return to empty state

#### Scenario: Cancel delete dismisses dialog
- **WHEN** user clicks "Cancel" in the confirmation dialog
- **THEN** the confirmation SHALL close
- **AND** the conversation SHALL remain unchanged

### Requirement: Delete conversation from backend
The backend SHALL support deleting a conversation by ID.

#### Scenario: Conversation exists
- **WHEN** `DELETE /api/conversations/{id}/delete` is called with a valid conversation ID
- **THEN** the conversation SHALL be deleted from the database
- **AND** HTTP 204 SHALL be returned

#### Scenario: Conversation not found
- **WHEN** `DELETE /api/conversations/{id}/delete` is called with a non-existent ID
- **THEN** HTTP 404 SHALL be returned

#### Scenario: Workspace directory preserved on delete
- **WHEN** a conversation is deleted
- **THEN** its workspace directory on disk SHALL NOT be removed
