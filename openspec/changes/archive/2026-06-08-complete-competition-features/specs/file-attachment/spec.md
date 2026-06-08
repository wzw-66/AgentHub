## ADDED Requirements

### Requirement: File attachment button in chat input
The chat input area SHALL include an attachment button (paperclip icon) next to the text input.

#### Scenario: Attachment button visible
- **WHEN** a conversation is active
- **THEN** the attachment button is visible in the input area
- **AND** clicking it opens the system file picker

### Requirement: Send image as message
The system SHALL support uploading and sending images as chat messages.

#### Scenario: Send image attachment
- **WHEN** user selects an image file from the file picker
- **THEN** the file is read and converted to a data URL or uploaded to server
- **AND** a message is sent with `type: "Text"` containing the image as Markdown `![alt](url)`
- **AND** the image renders inline in the chat

#### Scenario: File size limit enforced
- **WHEN** user selects a file larger than 5MB
- **THEN** an error message is shown
- **AND** the file is not attached
