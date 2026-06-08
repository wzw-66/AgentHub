## ADDED Requirements

### Requirement: Publish agent to marketplace from detail page
The Agent detail page SHALL include a "发布到市场" button that opens a publish modal.

#### Scenario: Open publish modal
- **WHEN** user clicks "发布到市场" on an agent detail page
- **THEN** a modal appears with description and tags fields (pre-filled if available)

#### Scenario: Publish agent
- **WHEN** user fills in the publish form
- **AND** clicks Publish
- **THEN** system calls `POST /api/market/publish` with `contactId`, `description`, `tags`
- **AND** shows success feedback

### Requirement: View my published listings
The marketplace page SHALL include a "我的发布" tab to view agents published by the current user.

#### Scenario: View my listings
- **WHEN** user navigates to "我的发布"
- **THEN** system calls `GET /api/market/my-listings`
- **AND** displays the user's published agents

### Requirement: Unpublish agent from marketplace
The "我的发布" list SHALL allow unpublishing an agent.

#### Scenario: Unpublish agent
- **WHEN** user clicks "取消发布" on one of their published agents
- **AND** confirms
- **THEN** system calls `DELETE /api/market/:id/unpublish`
- **AND** the agent is removed from the listing
