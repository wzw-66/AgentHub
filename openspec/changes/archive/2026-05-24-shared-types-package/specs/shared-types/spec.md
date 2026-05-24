## ADDED Requirements

### Requirement: 共享枚举定义
`@agenthub/shared` 包应定义系统中使用的所有枚举类型，所有枚举使用字符串值。

#### Scenario: ConversationType 已定义
- **WHEN** 从 `@agenthub/shared` 导入 `ConversationType`
- **THEN** `ConversationType.Single` 的值为 `"single"`，`ConversationType.Group` 的值为 `"group"`

#### Scenario: SenderType 已定义
- **WHEN** 从 `@agenthub/shared` 导入 `SenderType`
- **THEN** 应包含 `User`（值为 `"user"`）、`Contact`（值为 `"contact"`）、`System`（值为 `"system"`）

#### Scenario: MessageType 已定义
- **WHEN** 从 `@agenthub/shared` 导入 `MessageType`
- **THEN** 应包含 `Text`、`Code`、`Diff`、`Preview`、`Artifact` 五个值

#### Scenario: ArtifactType 已定义
- **WHEN** 从 `@agenthub/shared` 导入 `ArtifactType`
- **THEN** 应包含 `Code`、`WebPreview`、`Document`、`Diff` 四个值

#### Scenario: ArtifactStatus 已定义
- **WHEN** 从 `@agenthub/shared` 导入 `ArtifactStatus`
- **THEN** 应包含 `Building`（值为 `"building"`）、`Completed`（值为 `"completed"`）、`Failed`（值为 `"failed"`）

#### Scenario: AgentProvider 已定义
- **WHEN** 从 `@agenthub/shared` 导入 `AgentProvider`
- **THEN** 应包含 `Claude`（值为 `"claude"`）、`OpenCode`（值为 `"opencode"`）、`Custom`（值为 `"custom"`）

#### Scenario: ChunkType 已定义
- **WHEN** 从 `@agenthub/shared` 导入 `ChunkType`
- **THEN** 应包含 `Text`、`Code`、`ToolCall`、`Artifact`、`Error`、`Done` 六个值

### Requirement: 核心实体类型定义
`@agenthub/shared` 应定义所有核心领域实体的 TypeScript 接口。

#### Scenario: Agent 接口已定义
- **WHEN** 从 `@agenthub/shared` 导入 `Agent`
- **THEN** 应包含 `id`（string）、`name`（string）、`provider`（AgentProvider）、`model`（string）、`systemPrompt`（optional string）、`config`（Record<string, unknown>）、`avatarUrl`（optional string）、`createdAt`（string）、`updatedAt`（string）字段

#### Scenario: Contact 接口已定义
- **WHEN** 从 `@agenthub/shared` 导入 `Contact`
- **THEN** 应包含 `id`、`name`、`email`、`avatarUrl`（optional）、`isPinned`（boolean）、`createdAt`、`updatedAt` 字段

#### Scenario: Conversation 接口已定义
- **WHEN** 从 `@agenthub/shared` 导入 `Conversation`
- **THEN** 应包含 `id`、`title`、`type`（ConversationType）、`ownerId`、`contactIds`（string[]）、`isArchived`（boolean）、`lastMessageAt`（optional string）、`createdAt`、`updatedAt` 字段

#### Scenario: Message 接口已定义
- **WHEN** 从 `@agenthub/shared` 导入 `Message`
- **THEN** 应包含 `id`、`conversationId`、`senderType`（SenderType）、`senderId`、`type`（MessageType）、`content`（string）、`parentId`（optional string）、`artifacts`（optional Artifact[]）、`createdAt`、`updatedAt` 字段

#### Scenario: Artifact 接口已定义
- **WHEN** 从 `@agenthub/shared` 导入 `Artifact`
- **THEN** 应包含 `id`、`messageId`、`type`（ArtifactType）、`status`（ArtifactStatus）、`title`、`content`、`metadata`（Record<string, unknown>）、`createdAt`、`updatedAt` 字段

#### Scenario: User 接口已定义
- **WHEN** 从 `@agenthub/shared` 导入 `User`
- **THEN** 应包含 `id`、`username`、`email`、`avatarUrl`（optional string）、`createdAt`、`updatedAt` 字段

#### Scenario: Chunk 接口已定义
- **WHEN** 从 `@agenthub/shared` 导入 `Chunk`
- **THEN** 应包含 `type`（ChunkType）、`content`（string）、`metadata`（optional Record<string, unknown>）、`timestamp`（string）字段

#### Scenario: AgentContext 接口已定义
- **WHEN** 从 `@agenthub/shared` 导入 `AgentContext`
- **THEN** 应包含 `conversationId`（string）、`message`（string）、`history`（Message[]）、`agents`（Agent[]）字段

### Requirement: 基础设施类型定义
`@agenthub/shared` 应定义 Agent 适配器接口和凭据类型。

#### Scenario: AgentAdapter 接口已定义
- **WHEN** 从 `@agenthub/shared` 导入 `AgentAdapter`
- **THEN** 应包含 `execute(context: AgentContext): AsyncIterable<Chunk>`、`abort(): void`、`healthCheck(): Promise<HealthStatus>` 三个方法

#### Scenario: UserCredential 类型已定义
- **WHEN** 从 `@agenthub/shared` 导入 `UserCredential`
- **THEN** 应包含 `id`（string）、`userId`（string）、`provider`（AgentProvider）、`apiKey`（string）、`baseUrl`（optional string）、`createdAt`（string）、`updatedAt`（string）字段

### Requirement: 通用工具类型
`@agenthub/shared` 应提供通用的 API 响应和健康状态类型。

#### Scenario: ApiResponse 泛型已定义
- **WHEN** 从 `@agenthub/shared` 导入 `ApiResponse`
- **THEN** `ApiResponse<T>` 应包含 `success`（boolean）、`data`（T）、`error`（optional { code: string, message: string }）、`pagination`（optional { page: number, pageSize: number, total: number }）字段

#### Scenario: HealthStatus 类型已定义
- **WHEN** 从 `@agenthub/shared` 导入 `HealthStatus`
- **THEN** 应包含 `status`（"healthy" | "unhealthy"）、`latency`（number）、`message`（optional string）字段

### Requirement: 零运行时依赖
`@agenthub/shared` 包的运行时依赖必须为零。

#### Scenario: package.json 的 dependencies 为空
- **WHEN** 检查 `packages/shared/package.json`
- **THEN** `dependencies` 字段应为空对象

### Requirement: 统一导出入口
`@agenthub/shared` 应从单一入口点导出所有类型和枚举。

#### Scenario: 所有符号从 index 导出
- **WHEN** 从 `@agenthub/shared` 导入
- **THEN** 所有枚举和类型接口应可访问
