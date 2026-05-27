## ADDED Requirements

### Requirement: AgentAvatar component
The system SHALL provide an `AgentAvatar` component that displays an agent's avatar with a fallback to initials.

#### Scenario: Render image when avatarUrl is provided
- **WHEN** `AgentAvatar` receives an `avatarUrl` prop
- **THEN** it SHALL render an `<img>` element with that URL as the `src`

#### Scenario: Show initials when no avatarUrl
- **WHEN** `AgentAvatar` does not receive an `avatarUrl` prop
- **THEN** it SHALL display the first character of the `name` prop as a fallback

#### Scenario: Support size variants
- **WHEN** `AgentAvatar` receives a `size` prop of `"sm"`, `"md"`, or `"lg"`
- **THEN** it SHALL render at 32px, 40px, or 48px respectively

#### Scenario: Accept className for custom styling
- **WHEN** `AgentAvatar` receives a `className` prop
- **THEN** it SHALL append the className to the root element

### Requirement: MessageBubble component
The system SHALL provide a `MessageBubble` component that renders chat messages with sender-specific styling.

#### Scenario: Render text content
- **WHEN** `MessageBubble` receives a `message` with text content
- **THEN** it SHALL render the content text inside the bubble

#### Scenario: User messages left-aligned
- **WHEN** the `variant` prop is `"user"`
- **THEN** the bubble SHALL be styled as a user message with left alignment and primary color background

#### Scenario: Contact messages right-aligned
- **WHEN** the `variant` prop is `"contact"`
- **THEN** the bubble SHALL be styled as a contact message with right alignment and neutral background

#### Scenario: System messages centered
- **WHEN** the `variant` prop is `"system"`
- **THEN** the message SHALL be rendered as a centered system notification with small text

#### Scenario: Display timestamp
- **WHEN** the `message` contains a `createdAt` field
- **THEN** the component SHALL display a formatted timestamp below the content

### Requirement: CodeBlock component
The system SHALL provide a `CodeBlock` component with syntax highlighting and copy functionality.

#### Scenario: Render code with syntax highlighting
- **WHEN** `CodeBlock` receives a `code` string and a `language` prop
- **THEN** it SHALL render the code with syntax highlighting using prism-react-renderer

#### Scenario: Copy button present
- **WHEN** `CodeBlock` is rendered
- **THEN** it SHALL display a copy-to-clipboard button in the top-right corner

#### Scenario: Copy button feedback
- **WHEN** the user clicks the copy button
- **THEN** the button SHALL briefly show "Copied!" or a checkmark before reverting

#### Scenario: Language label display
- **WHEN** `CodeBlock` receives a `language` prop
- **THEN** it SHALL display the language name as a label

#### Scenario: Scrollable overflow
- **WHEN** the code content exceeds the `maxHeight` prop
- **THEN** the code block SHALL display a vertical scrollbar

### Requirement: DiffCard component
The system SHALL provide a `DiffCard` component that renders unified diff content with visual indicators.

#### Scenario: Render added lines in green
- **WHEN** a diff line starts with `+`
- **THEN** it SHALL be rendered with a green background

#### Scenario: Render removed lines in red
- **WHEN** a diff line starts with `-`
- **THEN** it SHALL be rendered with a red background

#### Scenario: Render context lines without highlight
- **WHEN** a diff line starts with a space or is empty
- **THEN** it SHALL be rendered without background highlight

#### Scenario: Display title
- **WHEN** `DiffCard` receives a `title` prop
- **THEN** it SHALL display the title above the diff content

#### Scenario: Handle empty diff gracefully
- **WHEN** the `diff` string is empty
- **THEN** the component SHALL render a placeholder message indicating no changes

### Requirement: PreviewCard component
The system SHALL provide a `PreviewCard` component that renders an iframe preview of a URL.

#### Scenario: Render iframe with URL
- **WHEN** `PreviewCard` receives a `url` prop
- **THEN** it SHALL render an `<iframe>` element with the URL as the `src`

#### Scenario: Sandbox iframe for security
- **WHEN** `PreviewCard` renders the iframe
- **THEN** the iframe SHALL include a `sandbox` attribute for security

#### Scenario: Display title
- **WHEN** `PreviewCard` receives a `title` prop
- **THEN** it SHALL display the title in a header bar above the iframe

#### Scenario: Show loading state
- **WHEN** the iframe content is loading
- **THEN** the component SHALL display a loading placeholder

### Requirement: ArtifactCard component
The system SHALL provide an `ArtifactCard` component that displays the build status of an artifact.

#### Scenario: Building state shows loading indicator
- **WHEN** the artifact `status` is `"building"`
- **THEN** the component SHALL display a spinning loader and "Building..." text

#### Scenario: Completed state shows content
- **WHEN** the artifact `status` is `"completed"`
- **THEN** the component SHALL display the artifact title and a preview area

#### Scenario: Failed state shows error
- **WHEN** the artifact `status` is `"failed"`
- **THEN** the component SHALL display an error icon and "Build failed" message

#### Scenario: Accept className for custom styling
- **WHEN** `ArtifactCard` receives a `className` prop
- **THEN** it SHALL append the className to the root element
