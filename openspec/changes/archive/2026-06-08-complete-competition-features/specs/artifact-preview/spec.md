## ADDED Requirements

### Requirement: Inline artifact preview in chat
When an Artifact with previewable content (HTML/WebPreview) is in a message, a preview button SHALL be shown inline.

#### Scenario: Click preview button in chat
- **WHEN** user clicks the "preview" button on an artifact message
- **THEN** ChatPanel fetches artifact content via `GET /api/artifacts/:id/preview`
- **AND** renders it inline below the message using an iframe

### Requirement: Fullscreen artifact preview
The right panel's "预览" tab SHALL display the actual artifact content when an artifact is selected.

#### Scenario: Open artifact in right panel
- **WHEN** user clicks an artifact to preview in the right panel
- **THEN** right panel fetches artifact detail via `GET /api/artifacts/:id/detail`
- **AND** renders it in an iframe within the preview tab

### Requirement: Fullscreen preview modal
The system SHALL support opening artifact preview in a fullscreen modal for better viewing.

#### Scenario: Fullscreen preview
- **WHEN** user clicks "全屏" on an artifact preview
- **THEN** a fullscreen modal opens with the artifact content
- **AND** an iframe renders the artifact with sandbox restrictions
