## Why

AgentHub 是一个功能密集的多 Agent 协作平台，其 monorepo 基础（Turborepo、TypeScript、ESLint）已就绪。当前缺失共享类型层——所有领域实体、枚举、接口散落在设计文档中，没有可被代码引用的单一来源。建立共享类型包可以让所有上层模块（database、agent-adapter、api-server、chat-ui）基于同一套类型契约开发和测试，消除类型不一致导致的跨模块 bug。

## What Changes

- 创建 `packages/shared` 包（`@agenthub/shared`），作为整个 monorepo 的类型基石
- 定义 7 个枚举：`ConversationType`、`SenderType`、`MessageType`、`ArtifactType`、`ArtifactStatus`、`AgentProvider`、`ChunkType`
- 定义 8 个核心实体接口：`Agent`、`Contact`、`Conversation`、`Message`、`Artifact`、`User`、`Chunk`、`AgentContext`
- 定义 2 个基础设施类型：`AgentAdapter` 接口和 `UserCredential` 类型
- 定义通用工具类型：`ApiResponse<T>`、`HealthStatus`
- 包运行时零外部依赖，纯 TypeScript 类型包
- 通过 `src/index.ts` 统一导出所有符号

## Capabilities

### New Capabilities

- `shared-types`: 共享类型定义，包含系统级枚举、核心实体接口、基础设施类型——零运行时依赖的纯类型包

### Modified Capabilities

<!-- No existing capabilities to modify, this is the first type-layer package. -->

## Impact

- 新增 `packages/shared/` 目录及其构建流水线
- 无运行时依赖变更（纯类型包）
- 引入 devDependencies：`vitest`、`typescript`
- 后续所有模块将通过 `@agenthub/shared` 引用共享类型
