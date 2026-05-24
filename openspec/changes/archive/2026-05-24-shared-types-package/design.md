## Context

AgentHub monorepo 基础已就绪（Turborepo、TypeScript 严格模式、ESLint、pnpm workspace），`packages/` 和 `apps/` 目录尚未创建。`@agenthub/shared` 将是第一个包，作为整个系统的类型基石。它的消费者包括 database（Prisma schema 映射）、agent-adapter（接口实现）、api-server（请求/响应类型）、chat-ui（组件 props）等所有上层模块。

约束条件：
- 包运行时零外部依赖
- 使用严格 TypeScript（继承 `tooling/tsconfig/base.json`）
- 采用 pnpm workspace 的包引用方式
- 构建输出需要同时支持 ESM 和 CJS

## Goals / Non-Goals

**Goals:**
- 创建 `packages/shared` 包，配置完整的 tsconfig、build、test 流水线
- 定义 7 个枚举，所有枚举使用字符串值便于 JSON 序列化
- 定义 8 个核心实体接口，覆盖 Agent、Contact、Conversation、Message、Artifact、User、Chunk、AgentContext
- 定义 AgentAdapter 接口和 UserCredential 类型
- 定义通用 API 工具类型（ApiResponse、HealthStatus）
- 通过 `src/index.ts` 统一导出所有符号
- 编写枚举值的单元测试
- 通过 `pnpm build` 编译出 `dist/` 输出

**Non-Goals:**
- 不包含任何运行时逻辑（工具函数、校验器等——属于后续模块）
- 不引入第三方类型库（如 zod、io-ts）
- 不处理 database 层的 Prisma schema 映射（属于 database 模块）
- 不包含 agent-adapter 的具体实现（属于 agent-adapter 模块）

## Decisions

### Decision 1: 按领域分文件组织源码，统一出口导出

```
src/
├── index.ts            # 统一导出
├── enums/
│   ├── conversation.ts # ConversationType
│   ├── sender.ts       # SenderType
│   ├── message.ts      # MessageType
│   ├── artifact.ts     # ArtifactType + ArtifactStatus
│   ├── agent.ts        # AgentProvider
│   └── chunk.ts        # ChunkType
└── types/
    ├── agent.ts        # Agent, AgentAdapter, AgentConfig
    ├── contact.ts      # Contact
    ├── conversation.ts # Conversation
    ├── message.ts      # Message
    ├── artifact.ts     # Artifact
    ├── user.ts         # User, UserCredential
    ├── chunk.ts        # Chunk, AgentContext
    └── common.ts       # ApiResponse<T>, HealthStatus
```

**Why**: 按领域拆分文件在源码层级保持清晰，外部消费者只需 `import { Agent, ConversationType } from "@agenthub/shared"`。与 Prisma schema 按模型拆分的风格一致。

### Decision 2: 构建输出 ESM + CJS 双格式

`package.json` 配置：
```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

**Why**: Next.js (ESM) 和 Fastify (CJS) 两个运行时都需要引用此包。双格式确保兼容。

### Decision 3: 枚举使用字符串枚举（string enum）

```typescript
export enum ConversationType {
  Single = "single",
  Group = "group",
}
```

**Why**: 字符串值在 JSON 序列化/反序列化时天然正确；Prisma schema 的 enum 映射到相同字符串值；运行时日志和人眼可读。

### Decision 4: 接口统一使用 interface 而非 type alias

**Why**: interface 支持 declaration merging，生成的 `.d.ts` 更简洁；extend 时类型检查更精确；与 Prisma 生成的类型风格一致。

### Decision 5: 测试策略——值正确性验证

只对枚举值做运行时测试（验证字符串值不变），接口类型由 TypeScript 编译器在编译期检查。

**Why**: 纯类型包的运行时行为几乎为零；枚举值错误是唯一会在运行时表现出来的问题。接口字段变更在编译期即可捕获。

## Risks / Trade-offs

- [类型遗漏风险] → Prisma schema 定义时如果发现缺少类型，需要回来补充。建议在 database 模块实现时同步验证 shared-types 的完整性
- [枚举值变更影响面大] → 一旦下游依赖开始使用，枚举值变更需要同步修改所有引用方。策略：在本阶段充分 review 枚举值定义，避免后续变更
- [构建配置复杂度] → ESM + CJS 双格式需要 tsup 或同样的 bundler 支持。策略：使用 tsup（零配置，支持双格式输出）
