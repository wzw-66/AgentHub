## ADDED Requirements

### Requirement: Render Diff message type
The ChatPanel SHALL render messages with `type === "diff"` using the DiffCard component from `@agenthub/ui`.

#### Scenario: Diff message received
- **WHEN** a message with `type: "diff"` appears in the messages list
- **THEN** ChatPanel renders it using the `DiffCard` component
- **AND** the diff view shows side-by-side code comparison

### Requirement: Render Preview message type
The ChatPanel SHALL render messages with `type === "preview"` showing a link preview or embedded content.

#### Scenario: Preview message received
- **WHEN** a message with `type: "preview"` appears in the messages list
- **THEN** ChatPanel renders a preview card with title, description, and URL

### Requirement: Render Artifact message type
The ChatPanel SHALL render messages with `type === "artifact"` using the ArtifactCard component from `@agenthub/ui`.

#### Scenario: Artifact message received
- **WHEN** a message with `type: "artifact"` appears in the messages list
- **THEN** ChatPanel renders it using the `ArtifactCard` component
- **AND** shows the artifact status (building/completed/failed)

### Requirement: Support multi-agent streaming in group chat
In group conversations, the ChatPanel SHALL display streaming messages from multiple agents simultaneously, each with their own agent avatar and typing indicator.

#### Scenario: Multiple agents stream concurrently
- **WHEN** orchestrator dispatches to multiple agents in a group chat
- **AND** multiple agents are streaming responses simultaneously
- **THEN** ChatPanel renders each agent's streaming message in a separate bubble
- **AND** each bubble shows the correct agent avatar and name
- **AND** each bubble has its own streaming cursor animation

#### Scenario: Streaming messages finalize independently
- **WHEN** one agent finishes streaming while others are still streaming
- **THEN** the finished agent's streaming message is finalized
- **AND** other agents' streaming messages continue to display
