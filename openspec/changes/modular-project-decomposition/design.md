## Context

AgentHub 当前是一个空白 monorepo（仅含 .claude、docs、openspec 目录），其架构已在设计文档中定义但尚未实现。项目采用 Turborepo 管理多包结构，包含 3 个 app（web、desktop、server）和 4 个共享包（shared、db、agent-core、ui），技术栈为 Next.js + Fastify + PostgreSQL + Prisma。

本次模块拆解将整个系统按功能边界分为 12 个独立模块，每个模块有独立 spec、独立构建、独立测试。模块之间通过明确的接口依赖连接，支持并行开发。

## Goals / Non-Goals

**Goals:**
- 将整个项目拆解为可独立开发、测试、部署的模块
- 每个模块有清晰的职责边界、接口契约和依赖关系
- 建立 Foundation → Core → UI → Real-time → Desktop 的分阶段推进路线
- 每个模块包含完整的 spec、设计、实现任务
- 支持多开发者/多 Agent 并行工作

**Non-Goals:**
- 不引入新的技术栈或架构模式（沿用已确定的 Next.js + Fastify + Prisma）
- 不改变已有设计文档中的核心架构决策
- 不处理部署运维层面的模块化（如 Docker 化、K8s）
- 不包含 P2 功能的完整实现（仅预留扩展点）

## Decisions

### Decision 1: 模块依赖方向严格单向

所有模块的依赖必须为单向 DAG，禁止循环依赖：

```
monorepo-foundation (无依赖)
  → shared-types (零依赖纯类型)
    → database (依赖 shared-types)
    → agent-adapter (依赖 shared-types)
      → api-server (依赖 database + agent-adapter + user-auth)
      → real-time-communication (依赖 user-auth)
      → orchestrator (依赖 agent-adapter)
        → ui-components (依赖 shared-types)
          → chat-ui (依赖 ui-components + api-server + real-time-communication)
          → agent-market (依赖 ui-components + api-server)
          → artifact-preview (依赖 ui-components + api-server)
```

**Why**: 单向依赖保证任意模块可独立修改而不影响上游模块。共享类型包作为最底层依赖，减少耦合。

### Decision 2: 每个模块独立构建和测试

每个模块在 turbo.json pipeline 中声明 build 和 test 任务，通过 `dependsOn` 声明模块间构建顺序。各模块拥有独立的 vitest 配置。

**Why**: Turborepo 的缓存机制自动跳过未变更模块的测试，提升 CI 效率。独立测试配置便于聚焦模块级行为。

### Decision 3: 先实现 shared 类型和数据库层，再实现业务层

实施顺序按依赖关系反向：先创建 monorepo 骨架，然后 shared-types → database + agent-adapter → auth → api-server → UI。

**Why**: 底层模块先行确保上层模块有可靠的类型和存储基础，减少开发过程中的阻塞。

### Decision 4: SSE 和 WebSocket 独立为 real-time-communication 模块

**Why**: 实时通信有独立的状态管理（连接池、心跳、重连），与 REST API 的生命周期不同。独立模块便于未来扩展为独立服务或替换协议实现。

### Decision 5: Orchestrator 作为独立服务层而非内嵌于 api-server

**Why**: Orchestrator 的调度逻辑（任务拆解、DAG 执行、失败重试）足够复杂，独立模块便于测试和优化调度算法。

## Risks / Trade-offs

- [模块边界可能过细] → 12 个模块中有 4 个是共享包（shared、db、agent-core、ui），实现体量较小。如果开发中发现某个模块过于单薄，可在实现阶段合并。
- [并行开发冲突] → 共享包（shared-types、ui-components）可能成为瓶颈。策略：优先完成 shared-types，让所有团队可以并行后续开发。
- [Orchestrator 设计复杂度] → 多 Agent 调度是系统的核心差异化能力。策略：先实现一个简单顺序调度版本，二期再优化为并行 DAG 调度。
- [SSE 和 WS 的稳定性] → 长连接在弱网环境可能断开。策略：前端实现自动重连 + 指数退避，消息有幂等 ID 防重复。
