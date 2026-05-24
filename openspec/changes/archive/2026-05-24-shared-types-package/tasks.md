## 1. 包脚手架

- [x] 1.1 创建 `packages/shared/` 目录结构（`src/enums/`、`src/types/`、`src/tests/`）
- [x] 1.2 创建 `packages/shared/package.json`，配置 name、exports（ESM + CJS）、scripts、devDependencies
- [x] 1.3 创建 `packages/shared/tsconfig.json`，继承 `tooling/tsconfig/base.json`
- [x] 1.4 创建 `packages/shared/vitest.config.ts`，配置测试运行器

## 2. 枚举定义

- [x] 2.1 在 `src/enums/` 下定义 `ConversationType`（Single, Group）和 `SenderType`（User, Contact, System）
- [x] 2.2 在 `src/enums/` 下定义 `MessageType`（Text, Code, Diff, Preview, Artifact）
- [x] 2.3 在 `src/enums/` 下定义 `ArtifactType`（Code, WebPreview, Document, Diff）和 `ArtifactStatus`（Building, Completed, Failed）
- [x] 2.4 在 `src/enums/` 下定义 `AgentProvider`（Claude, OpenCode, Custom）
- [x] 2.5 在 `src/enums/` 下定义 `ChunkType`（Text, Code, ToolCall, Artifact, Error, Done）

## 3. 类型定义

- [x] 3.1 在 `src/types/` 下定义 `Agent` 接口（id, name, provider, model, systemPrompt, config, avatarUrl, createdAt, updatedAt）
- [x] 3.2 在 `src/types/` 下定义 `Contact` 接口（id, name, email, avatarUrl, isPinned, createdAt, updatedAt）
- [x] 3.3 在 `src/types/` 下定义 `Conversation` 接口（id, title, type, ownerId, contactIds, isArchived, lastMessageAt, createdAt, updatedAt）
- [x] 3.4 在 `src/types/` 下定义 `Message` 接口（id, conversationId, senderType, senderId, type, content, parentId, artifacts, createdAt, updatedAt）
- [x] 3.5 在 `src/types/` 下定义 `Artifact` 接口（id, messageId, type, status, title, content, metadata, createdAt, updatedAt）
- [x] 3.6 在 `src/types/` 下定义 `User` 接口（id, username, email, avatarUrl, createdAt, updatedAt）和 `UserCredential` 类型
- [x] 3.7 在 `src/types/` 下定义 `Chunk` 接口和 `AgentContext` 接口
- [x] 3.8 在 `src/types/` 下定义 `AgentAdapter` 接口（execute, abort, healthCheck）
- [x] 3.9 在 `src/types/` 下定义通用工具类型 `ApiResponse<T>` 和 `HealthStatus`

## 4. 统一导出

- [x] 4.1 创建 `src/enums/index.ts`，收集所有枚举并统一导出
- [x] 4.2 创建 `src/types/index.ts`，收集所有类型并统一导出
- [x] 4.3 创建 `src/index.ts`，从 enums 和 types 索引中重新导出所有符号

## 5. 单元测试

- [x] 5.1 编写枚举值正确性的单元测试（验证每个枚举成员的值与 spec 一致）
- [x] 5.2 编写类型导出完整性测试（验证所有预期符号可从入口访问）

## 6. 编译验证

- [x] 6.1 在根目录执行 `pnpm install`，确认 workspace 解析正常
- [x] 6.2 执行 `pnpm build --filter @agenthub/shared`，确认 `dist/` 输出包含 `.js`、`.cjs`、`.d.ts`
- [x] 6.3 执行 `pnpm test --filter @agenthub/shared`，确认所有测试通过
- [x] 6.4 执行 `pnpm lint --filter @agenthub/shared`，确认无 lint 错误
