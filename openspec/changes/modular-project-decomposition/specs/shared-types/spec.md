## 新增需求

### 需求：共享枚举定义
`shared` 包应定义系统中使用的所有枚举类型。

#### 场景：ConversationType 枚举已存在
- **当** 从 `shared` 导入
- **则** `ConversationType` 应包含 `Single = "single"` 和 `Group = "group"` 值

#### 场景：SenderType 枚举已存在
- **当** 从 `shared` 导入
- **则** `SenderType` 应包含 `User`、`Contact` 和 `System` 值

#### 场景：MessageType 枚举已存在
- **当** 从 `shared` 导入
- **则** `MessageType` 应包含 `Text`、`Code`、`Diff`、`Preview` 和 `Artifact` 值

#### 场景：ChunkType 枚举已存在
- **当** 从 `shared` 导入
- **则** `ChunkType` 应包含 `Text`、`Code`、`ToolCall`、`Artifact`、`Error` 和 `Done` 值

### 需求：共享类型定义
`shared` 包应定义所有核心领域实体的 TypeScript 接口。

#### 场景：Agent 类型已存在
- **当** 从 `shared` 导入 `Agent`
- **则** 应包含 `id`、`name`、`provider`、`model`、`systemPrompt` 和 `config` 字段

#### 场景：Conversation 类型已存在
- **当** 从 `shared` 导入 `Conversation`
- **则** 应包含 `id`、`title`、`type`、`ownerId`、`contactIds` 和 `isArchived` 字段

#### 场景：Message 类型已存在
- **当** 从 `shared` 导入 `Message`
- **则** 应包含 `id`、`conversationId`、`senderType`、`senderId`、`type`、`content` 和 `parentId` 字段

#### 场景：AgentAdapter 接口已存在
- **当** 从 `shared` 导入 `AgentAdapter`
- **则** 应包含 `execute()`、`abort()` 和 `healthCheck()` 方法

### 需求：零外部依赖
`shared` 包的运行时依赖应为零。

#### 场景：包没有依赖项
- **当** 检查 `packages/shared/package.json`
- **则** `dependencies` 字段应为空

### 需求：包统一导出入口
`shared` 包应从单一入口点导出所有类型和枚举。

#### 场景：所有符号从 index 导出
- **当** 从 `shared` 导入
- **则** 所有枚举和类型接口应可访问
