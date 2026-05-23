## Context

AgentHub 项目当前仅有规划和文档文件（`.claude/`、`docs/`、`openspec/`），尚无任何可运行的代码或工程配置。项目采用 Turborepo 多包架构，包含 3 个应用（web/Next.js、desktop/Electron、server/Fastify）和 4 个共享包（shared、db、agent-core、ui），但缺少 monorepo 基础骨架。本次设计为整个项目搭建工程基础，使后续模块可以独立开发、构建和测试。

## Goals / Non-Goals

**Goals:**
- 建立 pnpm + Turborepo 驱动的 monorepo，支持多包工作空间
- 创建共享 TypeScript 配置（base、nextjs、node），确保类型安全
- 创建共享 ESLint 配置，统一代码风格
- 定义 turbo.json 构建流水线（build、dev、lint、test）
- 确保 `pnpm install` 可成功安装所有依赖

**Non-Goals:**
- 不创建任何应用或包的源代码（仅搭建骨架）
- 不部署或配置 CI/CD 流水线
- 不处理数据库初始化或迁移
- 不涉及任何运行时依赖的选择（typescript、eslint 等为开发依赖）

## Decisions

### Decision 1: 包管理器选择 pnpm

使用 pnpm 作为包管理器，通过 `pnpm-workspace.yaml` 定义工作空间。

**Why**: pnpm 比 npm/yarn 更快，支持严格的依赖隔离（避免幽灵依赖），且 Turborepo 官方推荐与 pnpm 配合使用。

### Decision 2: Turborepo 作为构建编排器

在 `turbo.json` 中定义 `build`、`dev`、`lint`、`test` 四个流水线任务，通过 `dependsOn` 控制模块间构建顺序。

**Why**: Turborepo 提供增量构建、远程缓存、并行执行能力，且与 pnpm 工作空间原生集成。

### Decision 3: TypeScript 配置分层设计

采用三层 tsconfig 结构：
- `base.json`：严格模式的基础配置（strict: true、exactOptionalPropertyTypes 等）
- `nextjs.json`：继承 base，添加 JSX 支持（jsx: preserve）、next.js 类型
- `node.json`：继承 base，添加 Node.js 类型（@types/node）

**Why**: 分层设计避免重复配置，每个包只需继承对应配置并添加路径映射。与 Turborepo 的 tsconfig 官方示例一致。

### Decision 4: ESLint 配置独立为 tooling 包

将 `tooling/eslint-config` 创建为独立的 pnpm 工作空间包，导出共享 ESLint 配置。

**Why**: 独立包可以被所有 apps 和 packages 直接引用，版本管理清晰，更新一处即可同步到所有工作空间。

### Decision 5: 使用 pnpm `-w` 标志安装根依赖

根目录的开发依赖（turbo、typescript、eslint 等）使用 `pnpm add -wD` 安装。

**Why**: `-w` 标志明确将依赖安装到根 `node_modules`，避免被子包意外引用，符合 pnpm 的工作空间最佳实践。

## Risks / Trade-offs

- [Turborepo 版本兼容性] → 使用 `turbo@latest` 稳定版，锁定主版本号避免 breaking change 影响构建
- [Windows 路径兼容性] → 在 `turbo.json` 的 `outputs` 路径中使用 `/` 分隔符而非 `\`，确保跨平台兼容
- [TypeScript 配置过于严格] → base 配置启用全部严格选项，个别包可通过 `compilerOptions` 覆盖（如宽松日期解析）
