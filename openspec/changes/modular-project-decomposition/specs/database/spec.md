## 新增需求

### 需求：Prisma schema 定义所有模型
`db` 包应定义包含 User、Agent、Contact、Conversation、Message、Artifact 和 UserCredential 模型的 Prisma schema。

#### 场景：User 模型已存在
- **当** Prisma schema 生成完成
- **则** `User` 模型应包含 `id`、`name`、`email`、`passwordHash` 和 `avatarUrl` 字段

#### 场景：Agent 模型已存在
- **当** Prisma schema 生成完成
- **则** `Agent` 模型应包含 `id`、`name`、`avatarUrl`、`provider`、`systemPrompt`、`model` 和 `config` 字段

#### 场景：Contact 模型已存在
- **当** Prisma schema 生成完成
- **则** `Contact` 模型应包含 `id`、`userId`、`agentId`、`displayName`、`tags` 和 `isPinned` 字段

#### 场景：Conversation 模型已存在
- **当** Prisma schema 生成完成
- **则** `Conversation` 模型应包含 `id`、`title`、`type`、`ownerId`、`contactIds`、`isArchived` 和 `lastActiveAt` 字段

#### 场景：Message 模型已存在
- **当** Prisma schema 生成完成
- **则** `Message` 模型应包含 `id`、`conversationId`、`senderType`、`senderId`、`type`、`content`、`parentId`、`isPinned` 和 `metadata` 字段

#### 场景：Artifact 模型已存在
- **当** Prisma schema 生成完成
- **则** `Artifact` 模型应包含 `id`、`messageId`、`type`、`url`、`content`、`previewUrl` 和 `status` 字段

#### 场景：UserCredential 模型已存在
- **当** Prisma schema 生成完成
- **则** `UserCredential` 模型应包含 `id`、`userId`、`provider` 和 `encryptedKey` 字段

### 需求：数据库客户端单例
`db` 包应导出一个 Prisma 客户端单例实例。

#### 场景：Prisma 客户端已导出
- **当** 从 `db` 导入
- **则** `prisma` 单例应可用

#### 场景：客户端遵循环境配置
- **当** 设置了 `DATABASE_URL` 环境变量
- **则** Prisma 客户端应连接到指定的数据库

### 需求：数据库 CRUD 函数
`db` 包应为每个模型提供类型化的 CRUD 函数。

#### 场景：会话 CRUD 已存在
- **当** 使用 db 包
- **则** 应存在 `createConversation`、`getConversation`、`listConversations` 和 `updateConversation` 函数

#### 场景：消息 CRUD 已存在
- **当** 使用 db 包
- **则** 应存在 `createMessage`、`getMessage`、`listMessages`（分页）和 `pinMessage` 函数

### 需求：迁移支持
数据库 schema 应支持 Prisma 迁移。

#### 场景：迁移脚本可用
- **当** 执行 `pnpm db:migrate`
- **则** Prisma 应为 schema 变更生成新的迁移
