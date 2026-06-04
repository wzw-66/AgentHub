## Why

Agent creation flow is currently broken: provider enum values are inconsistent between frontend (lowercase), server validation (PascalCase), and Prisma (PascalCase), causing 400 errors on create. The Agent model lacks a creator association, making it impossible to query "which agents did this user create?" There's no workspace directory mechanism for agents to operate in. And the message execution pipeline doesn't properly route messages to the correct agent.

## What Changes

- **Unify provider enum values**: Align shared `AgentProvider` enum to PascalCase (`Claude` / `OpenCode` / `Custom`) matching Prisma; update adapter factory to normalize case internally
- **Add** **`creatorId`** **to Agent model**: Link each agent to its creating user; add `agents` relation on User for bidirectional query
- **Add** **`workspacePath`** **to Agent model**: Store auto-generated path `agent-workspace/{email}/{name}/`
- **Rename** **`contactIds`** **to** **`agentIds`** **on Conversation**: Fix semantic ambiguity; update server routes and frontend calls
- **Redesign CreateAgentModal**: Segmented provider selector (Claude Code / OpenCode / Custom); conditional fields for Custom (API URL, API Key, model); auto-preview workspace path
- **Auto-create workspace directory**: On agent creation, `mkdir -p` the workspace path on disk
- **Fix message execution routing**: `runAgentExecution` now correctly resolves `conversation.agentIds` to the target Agent and creates the adapter with workspace cwd; fix the bug where all contacts were iterated instead of using agentIds
- **Conversation type enum alignment**: Change `"Single"/"Group"` to `"single"/"group"` to match frontend usage
- **Remove** **`.workspace`** **marker file**: Initially proposed but deemed unnecessary

## Capabilities

### New Capabilities

- `agent-create`: Agent creation form with provider selection (Claude Code, OpenCode, Custom), dynamic field rendering, workspace path preview, and server-side workspace directory initialization

### Modified Capabilities

- *(No existing specs have requirement changes — the agent creation flow was never fully specified at the capability level)*

## Impact

- **packages/db**: Prisma schema migration — Agent model adds `creatorId`, `workspacePath`; User adds `agents` relation; Conversation `contactIds` renamed to `agentIds`; `AgentProvider` enum values unchanged (already PascalCase)
- **packages/shared**: `AgentProvider` enum values change from lowercase to PascalCase
- **packages/agent-core**: Adapter factory gets case normalization; `ClaudeAdapterConfig` and `OpenCodeAdapterConfig` add optional `cwd` field
- **apps/server**: Agent routes handle `creatorId` and workspace directory creation; conversation routes use `agentIds`; message execution fixes routing bug
- **apps/web**: `CreateAgentModal` redesigned with provider segmented control; conversation creation calls use `agentIds`
- **config**: Server needs project root path for workspace directory creation (resolved at runtime via `process.cwd()`)
- **BREAKING**: `AgentProvider` shared enum value change affects any code comparing against lowercase strings
- **BREAKING**: Conversation `contactIds` → `agentIds` rename affects all conversation creation calls

