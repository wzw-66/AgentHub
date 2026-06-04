## ADDED Requirements

### Requirement: Marker-based artifact detection

The server SHALL detect artifact-producing content from agent output using dual-channel detection (file extension + content sniffing), and insert marker tags into the message content string.

#### Scenario: HTML content detected via content sniffing
- **WHEN** a ToolCall chunk contains input that starts with `<html` or `<!DOCTYPE html` and has no filename field
- **THEN** the `detectArtifact()` function SHALL return `{ type: "web_preview", language: "html" }`, and the server SHALL insert `~~~artifact:web_preview:title~~~` and `~~~artifact:end:web_preview~~~` markers wrapping the HTML content

#### Scenario: Code language detected via file extension
- **WHEN** a ToolCall chunk's input contains a `file` or `filename` field with value `"Main.java"`
- **THEN** the `detectArtifact()` function SHALL use the `.java` extension and return `{ type: "code", language: "java" }`, and the server SHALL insert `~~~artifact:code:Main.java~~~` markers

#### Scenario: Content sniffing for code without filename
- **WHEN** a ToolCall chunk's input starts with `public class` and has no filename field
- **THEN** the `detectArtifact()` function SHALL return `{ type: "code", language: "java" }` via content sniffing fallback

#### Scenario: Diff content detected
- **WHEN** a ToolCall chunk contains input that starts with `diff --git` or `--- a/`
- **THEN** the `detectArtifact()` function SHALL return `{ type: "diff", language: "diff" }`, and the server SHALL insert appropriate markers

#### Scenario: Non-artifact content passes through
- **WHEN** a ToolCall chunk contains input that does not match any artifact type or known file extension
- **THEN** the content SHALL be appended to the message content as plain text without markers

### Requirement: Frontend inline artifact rendering

The frontend SHALL parse message content for artifact markers and render the wrapped content as interactive preview cards instead of plain text.

#### Scenario: web_preview rendered as iframe
- **WHEN** the frontend renders a message containing `~~~artifact:web_preview:My Page~~~<html>...~~~artifact:end~~~`
- **THEN** it SHALL split the content at the markers, render the HTML content inside an iframe with sandbox attributes, and display a preview card with title "My Page"

#### Scenario: Same rendering for SSE streaming and API load
- **WHEN** content arrives via SSE streaming chunks
- **AND WHEN** the same content is loaded from the API after page refresh
- **THEN** both paths SHALL produce identical rendered output, with artifact cards in the same positions

#### Scenario: Streaming artifact card appears in-line
- **WHEN** a ToolCall chunk triggers artifact marker insertion during SSE streaming
- **THEN** the artifact card SHALL appear at the marker position in the streaming message, with subsequent text chunks appearing below the card
