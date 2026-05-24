## ADDED Requirements

### Requirement: Prisma schema 定义所有数据模型

`@agenthub/db` 包 SHALL 定义包含 User、Agent、Contact、Conversation、Message、Artifact 和 UserCredential 模型的 Prisma schema，并包含所有必需的枚举类型。

#### Scenario: User 模型已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `User` 模型 SHALL 包含 `id`(String, 主键)、`name`(String)、`email`(String, 唯一)、`passwordHash`(String)、`avatarUrl`(String?, 可选) 字段

#### Scenario: Agent 模型已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `Agent` 模型 SHALL 包含 `id`(String, 主键)、`name`(String)、`avatarUrl`(String?)、`provider`(AgentProvider 枚举)、`systemPrompt`(String?)、`model`(String?)、`config`(Json?) 字段

#### Scenario: Contact 模型已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `Contact` 模型 SHALL 包含 `id`(String, 主键)、`userId`(String, 外键→User)、`agentId`(String, 外键→Agent)、`displayName`(String)、`tags`(String[])、`isPinned`(Boolean) 字段

#### Scenario: Contact 模型有联合唯一约束
- **WHEN** Prisma schema 生成完成
- **THEN** `Contact` SHALL 在 `userId` + `agentId` 上有 `@@unique` 约束

#### Scenario: Conversation 模型已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `Conversation` 模型 SHALL 包含 `id`(String, 主键)、`title`(String)、`type`(ConversationType 枚举)、`ownerId`(String, 外键→User)、`contactIds`(String[])、`isArchived`(Boolean)、`lastActiveAt`(DateTime) 字段

#### Scenario: Message 模型已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `Message` 模型 SHALL 包含 `id`(String, 主键)、`conversationId`(String, 外键→Conversation)、`senderType`(SenderType 枚举)、`senderId`(String)、`type`(MessageType 枚举)、`content`(String)、`parentId`(String?, 自引用外键→Message)、`isPinned`(Boolean)、`metadata`(Json?) 字段

#### Scenario: Artifact 模型已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `Artifact` 模型 SHALL 包含 `id`(String, 主键)、`messageId`(String, 外键→Message)、`type`(ArtifactType 枚举)、`url`(String?)、`content`(String?)、`previewUrl`(String?)、`status`(ArtifactStatus 枚举) 字段

#### Scenario: UserCredential 模型已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `UserCredential` 模型 SHALL 包含 `id`(String, 主键)、`userId`(String, 外键→User)、`provider`(String)、`encryptedKey`(String) 字段

### Requirement: 枚举类型已定义

Prisma schema SHALL 定义 6 个枚举类型，映射核心领域概念。

#### Scenario: AgentProvider 枚举已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `AgentProvider` 枚举 SHALL 包含 `Claude`、`OpenCode`、`Custom` 值

#### Scenario: ConversationType 枚举已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `ConversationType` 枚举 SHALL 包含 `Single`、`Group` 值

#### Scenario: SenderType 枚举已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `SenderType` 枚举 SHALL 包含 `User`、`Contact`、`System` 值

#### Scenario: MessageType 枚举已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `MessageType` 枚举 SHALL 包含 `Text`、`Code`、`Diff`、`Preview`、`Artifact` 值

#### Scenario: ArtifactType 枚举已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `ArtifactType` 枚举 SHALL 包含 `CodeDiff`、`WebPreview`、`Document` 值

#### Scenario: ArtifactStatus 枚举已定义
- **WHEN** Prisma schema 生成完成
- **THEN** `ArtifactStatus` 枚举 SHALL 包含 `Building`、`Completed`、`Failed` 值

### Requirement: 模型间关系声明完整

Prisma schema SHALL 声明所有模型间的关联关系，并配置级联删除行为。

#### Scenario: User 到 Contact 一对多
- **WHEN** Prisma schema 生成完成
- **THEN** User SHALL 通过 `userId` 与 Contact 建立一对多关系，删除 User 时级联删除关联 Contact

#### Scenario: User 到 Conversation 一对多
- **WHEN** Prisma schema 生成完成
- **THEN** User SHALL 通过 `ownerId` 与 Conversation 建立一对多关系

#### Scenario: User 到 UserCredential 一对多
- **WHEN** Prisma schema 生成完成
- **THEN** User SHALL 通过 `userId` 与 UserCredential 建立一对多关系，删除 User 时级联删除

#### Scenario: Agent 到 Contact 一对多
- **WHEN** Prisma schema 生成完成
- **THEN** Agent SHALL 通过 `agentId` 与 Contact 建立一对多关系，删除 Agent 时级联删除

#### Scenario: Conversation 到 Message 一对多
- **WHEN** Prisma schema 生成完成
- **THEN** Conversation SHALL 通过 `conversationId` 与 Message 建立一对多关系，删除 Conversation 时级联删除

#### Scenario: Message 到 Artifact 一对多
- **WHEN** Prisma schema 生成完成
- **THEN** Message SHALL 通过 `messageId` 与 Artifact 建立一对多关系，删除 Message 时级联删除

#### Scenario: Message 自引用父子关系
- **WHEN** Prisma schema 生成完成
- **THEN** Message SHALL 通过 `parentId` 建立自引用一对多关系（回复/引用）

### Requirement: Prisma 客户端单例

`@agenthub/db` 包 SHALL 导出一个 Prisma 客户端单例实例，在开发环境防止热重载创建多个实例。

#### Scenario: 客户端单例已导出
- **WHEN** 从 `@agenthub/db` 导入
- **THEN** `prisma` 单例 SHALL 可用

#### Scenario: 客户端遵循环境配置
- **WHEN** 设置了 `DATABASE_URL` 环境变量
- **THEN** Prisma 客户端 SHALL 连接到指定的数据库 URL

#### Scenario: 开发环境防多实例
- **WHEN** `NODE_ENV` 不等于 `production`
- **THEN** Prisma 实例 SHALL 缓存在 `globalThis` 上

### Requirement: Agent CRUD 函数

`@agenthub/db` 包 SHALL 为 Agent 模型提供完整的 CRUD 函数。

#### Scenario: listAgents 已存在
- **WHEN** 调用 `listAgents()`
- **THEN** 返回所有 Agent 列表

#### Scenario: listAgents 支持按提供商筛选
- **WHEN** 调用 `listAgents({ provider: AgentProvider.Claude })`
- **THEN** 返回仅包含 Claude 提供商的 Agent 列表

#### Scenario: getAgent 已存在
- **WHEN** 调用 `getAgent(id)`
- **THEN** 返回匹配 ID 的 Agent，或不存在的返回 null

#### Scenario: createAgent 已存在
- **WHEN** 调用 `createAgent(data)`
- **THEN** 创建新 Agent 并返回完整记录

#### Scenario: updateAgent 已存在
- **WHEN** 调用 `updateAgent(id, data)`
- **THEN** 更新 Agent 的指定字段并返回更新后的记录

#### Scenario: deleteAgent 已存在
- **WHEN** 调用 `deleteAgent(id)`
- **THEN** 删除 Agent 及其关联的 Contact，返回被删除的记录

### Requirement: Contact CRUD 函数

`@agenthub/db` 包 SHALL 为 Contact 模型提供完整的 CRUD 函数。

#### Scenario: listContacts 已存在
- **WHEN** 调用 `listContacts(userId)`
- **THEN** 返回指定用户的联系人列表，isPinned 优先排序

#### Scenario: getContact 已存在
- **WHEN** 调用 `getContact(id)`
- **THEN** 返回匹配 ID 的 Contact（包含关联的 Agent 信息），或不存在的返回 null

#### Scenario: createContact 已存在
- **WHEN** 调用 `createContact(data)`
- **THEN** 创建新的联系人关联

#### Scenario: createContact 拒绝重复关联
- **WHEN** 为同一对 (userId, agentId) 重复创建 Contact
- **THEN** throw 唯一约束冲突异常

#### Scenario: updateContact 已存在
- **WHEN** 调用 `updateContact(id, data)`
- **THEN** 更新联系人（displayName/tags/isPinned）并返回更新后的记录

#### Scenario: deleteContact 已存在
- **WHEN** 调用 `deleteContact(id)`
- **THEN** 删除联系人记录

### Requirement: Conversation CRUD 函数

`@agenthub/db` 包 SHALL 为 Conversation 模型提供 CRUD 函数。

#### Scenario: createConversation 已存在
- **WHEN** 调用 `createConversation(data)`
- **THEN** 创建新会话并返回包含关联数据的完整记录

#### Scenario: getConversation 已存在
- **WHEN** 调用 `getConversation(id)`
- **THEN** 返回会话（包含最近消息和联系人），或不存在的返回 null

#### Scenario: listConversations 已存在
- **WHEN** 调用 `listConversations(userId)`
- **THEN** 按 `lastActiveAt` 降序返回用户的会话列表

#### Scenario: listConversations 支持分页
- **WHEN** 调用 `listConversations(userId, { offset: 0, limit: 20 })`
- **THEN** 返回分页结果 `{ data: Conversation[], total: number }`

#### Scenario: listConversations 支持归档筛选
- **WHEN** 调用 `listConversations(userId, { includeArchived: true })`
- **THEN** 返回包括已归档的会话

#### Scenario: updateConversation 已存在
- **WHEN** 调用 `updateConversation(id, { title })`
- **THEN** 更新会话标题

#### Scenario: updateConversation 支持归档
- **WHEN** 调用 `updateConversation(id, { isArchived: true })`
- **THEN** 将会话标记为已归档

### Requirement: Message CRUD 函数

`@agenthub/db` 包 SHALL 为 Message 模型提供 CRUD 函数。

#### Scenario: createMessage 已存在
- **WHEN** 调用 `createMessage(data)`
- **THEN** 创建新消息，并在同一事务中更新关联会话的 `lastActiveAt`

#### Scenario: createMessage 支持 parentId
- **WHEN** 调用 `createMessage({ ...parentId: "msg1" })`
- **THEN** 新消息作为 msg1 的回复

#### Scenario: getMessage 已存在
- **WHEN** 调用 `getMessage(id)`
- **THEN** 返回消息（包含关联的 Artifact），或不存在的返回 null

#### Scenario: listMessages 已存在
- **WHEN** 调用 `listMessages(conversationId)`
- **THEN** 按 `createdAt` 升序返回会话的消息列表

#### Scenario: listMessages 支持游标分页
- **WHEN** 调用 `listMessages(conversationId, { cursor: "msg_id", limit: 50 })`
- **THEN** 返回 `{ data: Message[], nextCursor: string | null }` 结构，仅返回 cursor 之后的消息

#### Scenario: pinMessage 已存在
- **WHEN** 调用 `pinMessage(id)`
- **THEN** 切换消息的 `isPinned` 状态（true→false, false→true）

### Requirement: Artifact CRUD 函数

`@agenthub/db` 包 SHALL 为 Artifact 模型提供 CRUD 函数。

#### Scenario: listArtifacts 已存在
- **WHEN** 调用 `listArtifacts(messageId)`
- **THEN** 返回指定消息的所有产物

#### Scenario: getArtifact 已存在
- **WHEN** 调用 `getArtifact(id)`
- **THEN** 返回匹配 ID 的 Artifact，或不存在的返回 null

#### Scenario: createArtifact 已存在
- **WHEN** 调用 `createArtifact(data)`
- **THEN** 创建新产物记录，默认 status 为 Building

#### Scenario: updateArtifact 已存在
- **WHEN** 调用 `updateArtifact(id, { status: ArtifactStatus.Completed, url: "..." })`
- **THEN** 更新产物的状态和 URL

### Requirement: UserCredential CRUD 函数

`@agenthub/db` 包 SHALL 为 UserCredential 模型提供 CRUD 函数。

#### Scenario: listCredentials 已存在
- **WHEN** 调用 `listCredentials(userId)`
- **THEN** 返回指定用户的所有凭证

#### Scenario: getCredential 已存在
- **WHEN** 调用 `getCredential(id)`
- **THEN** 返回匹配 ID 的凭证，或不存在的返回 null

#### Scenario: createCredential 已存在
- **WHEN** 调用 `createCredential(data)`
- **THEN** 创建新的凭证记录

#### Scenario: deleteCredential 已存在
- **WHEN** 调用 `deleteCredential(id)`
- **THEN** 删除凭证记录

### Requirement: Seed 脚本

`@agenthub/db` 包 SHALL 包含一个开发环境 seed 脚本，用于填充测试数据。

#### Scenario: Seed 脚本可执行
- **WHEN** 执行 `pnpm --filter @agenthub/db db:seed`
- **THEN** 创建默认用户、3 个预置 Agent、示例联系人、示例会话和消息
