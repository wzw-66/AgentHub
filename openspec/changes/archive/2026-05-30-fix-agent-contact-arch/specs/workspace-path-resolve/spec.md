## ADDED Requirements

### Requirement: Workspace path uses stable server root

The workspace directory path SHALL be resolved relative to `apps/server/` using `__dirname`, not `process.cwd()`.

#### Scenario: Directory created under server package

- **WHEN** a user creates an agent
- **THEN** the workspace directory SHALL be created at `{SERVER_ROOT}/agent-workspace/{safeEmail}/{safeName}/`
- **WHERE** `SERVER_ROOT` is `path.resolve(__dirname, "..")` from `apps/server/src/`
- **AND** this path SHALL be deterministic regardless of how the server process is launched

#### Scenario: Relative path stored in database

- **WHEN** the agent is created
- **THEN** the `workspacePath` field in the Agent record SHALL store the relative path `agent-workspace/{safeEmail}/{safeName}`
- **AND** this relative path SHALL be portable across different machines

#### Scenario: Runtime resolution uses server root

- **WHEN** an agent execution is triggered via `runAgentExecution`
- **THEN** the `cwd` for the subprocess SHALL be resolved as `path.resolve(SERVER_ROOT, agent.workspacePath)`

### Requirement: Safe file names for email and agent name

Email and agent name SHALL be sanitized before use in file paths.

#### Scenario: Email sanitization

- **WHEN** building workspace path from user email `test+tag@example.com`
- **THEN** `+` SHALL be replaced with `_`
- **AND** only `a-zA-Z0-9@._-` characters SHALL be allowed

#### Scenario: Agent name sanitization

- **WHEN** building workspace path from agent name containing special characters
- **THEN** only `a-zA-Z0-9\u4e00-\u9fff_-` characters SHALL be allowed
- **AND** other characters SHALL be replaced with `_`
