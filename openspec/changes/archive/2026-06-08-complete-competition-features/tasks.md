## 1. Fix Broken UI Interactions

- [x] 1.1 Fix Sidebar contact pill click: call `find-by-agent` API then create/open conversation instead of using agentId directly
- [x] 1.2 Connect "重新生成" (Regenerate) button in ChatPanel to `POST /messages/:id/regenerate`
- [x] 1.3 Connect "Pin" button in ChatPanel hover actions to `POST /messages/:id/pin`
- [x] 1.4 Fix Agent detail page "添加到联系人" button: call `POST /contacts/create` with correct `name` + `provider` params
- [x] 1.5 Fix CreateAgentModal: replace `window.location.reload()` with `useChat().contacts` refresh

## 2. Rich Message Type Rendering

- [x] 2.1 Import and render `DiffCard` from `@agenthub/ui` for messages with `type === "diff"` in `MessageContent`
- [x] 2.2 Import and render `ArtifactCard` from `@agenthub/ui` for messages with `type === "artifact"` in `MessageContent`
- [x] 2.3 Render `PreviewCard`-style inline preview for messages with `type === "preview"` in `MessageContent`

## 3. Multi-Agent Streaming Display

- [x] 3.1 Update ChatPanel to iterate all entries in `streamingMessages` Map instead of only showing first entry
- [x] 3.2 Render each streaming agent message with correct avatar, name, and independent cursor animation
- [x] 3.3 Handle per-agent finalization: each agent's stream can complete independently

## 4. Conversation Management UI

- [x] 4.1 Add hover-reveal Pin/Archive/Delete action buttons to Sidebar conversation items
- [x] 4.2 Wire Pin button to `PATCH /api/conversations/:id/update` with `isPinned` toggle
- [x] 4.3 Wire Archive button to `PATCH /api/conversations/:id/update` with `isArchived` toggle
- [x] 4.4 Wire Delete button to `DELETE /api/conversations/:id/delete` with confirmation dialog
- [x] 4.5 Add "Show archived" toggle to Sidebar that passes `includeArchived=true` query param

## 5. Marketplace Publish Flow

- [x] 5.1 Add "发布到市场" button to Agent detail page that opens PublishAgentModal
- [x] 5.2 Wire publish modal to `POST /api/market/publish`
- [x] 5.3 Add "我的发布" tab to market page that calls `GET /api/market/my-listings`
- [x] 5.4 Add unpublish button to my-listings calling `DELETE /api/market/:id/unpublish`

## 6. Artifact Preview

- [x] 6.1 Add "Preview" action on artifact messages that fetches `GET /api/artifacts/:id/preview`
- [x] 6.2 Render artifact content in ChatPanel inline using iframe with sandbox
- [x] 6.3 Wire right panel "预览" tab to show actual artifact detail when artifact is selected
- [x] 6.4 Implement fullscreen preview modal for artifacts

## 7. Credential Management Page

- [x] 7.1 Create `/credentials` page route under `(market)` layout
- [x] 7.2 Implement credential list view calling `GET /api/credentials/list`
- [x] 7.3 Implement add credential form calling `POST /api/credentials/create`
- [x] 7.4 Implement delete credential with confirmation calling `DELETE /api/credentials/:id/delete`

## 8. File Attachment Support

- [x] 8.1 Add paperclip attachment button to ChatPanel input area
- [x] 8.2 Implement file picker and file-to-Markdown-image conversion
- [x] 8.3 Add file size validation (5MB limit) with error feedback
