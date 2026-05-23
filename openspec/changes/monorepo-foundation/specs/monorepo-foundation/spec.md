## ADDED Requirements

### Requirement: 初始化 Turborepo Monorepo
系统应提供基于 Turborepo 的 monorepo，使用 pnpm 作为包管理器，支持多包工作空间管理。

#### Scenario: 根目录 package.json 已创建
- **WHEN** 执行 `pnpm create` 或手动初始化根目录 package.json
- **THEN** 根目录 `package.json` 应包含 `turbo` 和 `typescript` 作为 devDependencies，并定义 `dev`、`build`、`lint`、`test` 脚本委托给 turbo 执行

#### Scenario: pnpm-workspace.yaml 已配置
- **WHEN** 工作空间配置完成
- **THEN** `pnpm-workspace.yaml` 应包含 `apps/*`、`packages/*` 和 `tooling/*` 作为工作空间条目

#### Scenario: turbo.json 定义了流水线
- **WHEN** 构建流水线配置完成
- **THEN** `turbo.json` 应定义 `build`、`dev`、`lint` 和 `test` 四个流水线任务，并通过 `dependsOn` 指定任务依赖顺序

#### Scenario: 包脚本正常工作
- **WHEN** 执行 `pnpm dev`
- **THEN** turbo 应并行运行所有工作空间的 dev 脚本
- **WHEN** 执行 `pnpm build`
- **THEN** turbo 应按依赖顺序构建所有工作空间

### Requirement: 共享 TypeScript 配置
系统应在 `tooling/` 目录下提供可复用的 TypeScript 配置，支持分层继承。

#### Scenario: 基础 tsconfig 已创建
- **WHEN** 工具链设置完成
- **THEN** `tooling/tsconfig/base.json` 应存在，并包含 `strict: true`、`exactOptionalPropertyTypes: true`、`noUncheckedIndexedAccess: true` 等严格 TypeScript 配置

#### Scenario: Next.js tsconfig 继承基础配置
- **WHEN** Next.js 应用需要 TypeScript 配置
- **THEN** `tooling/tsconfig/nextjs.json` 应继承 `base.json` 并包含 `jsx: preserve` 和 `moduleResolution: bundler`

#### Scenario: Node tsconfig 继承基础配置
- **WHEN** Node.js 包需要 TypeScript 配置
- **THEN** `tooling/tsconfig/node.json` 应继承 `base.json` 并包含 `@types/node` 和 `moduleResolution: node`

### Requirement: 共享 ESLint 配置
系统应在 `tooling/eslint-config` 包中提供共享 ESLint 配置。

#### Scenario: ESLint 配置包已创建
- **WHEN** `tooling/eslint-config` 包初始化完成
- **THEN** 其 `package.json` 应包含包名 `@agenthub/eslint-config`，并导出 `index.js` 配置文件

#### Scenario: ESLint 规则已定义
- **WHEN** ESLint 配置完成
- **THEN** `index.js` 应继承 `@typescript-eslint/recommended` 和 `prettier`，并配置 TypeScript 解析器

### Requirement: .npmrc 已配置
系统应通过 `.npmrc` 配置 pnpm 行为。

#### Scenario: .npmrc 配置文件已创建
- **WHEN** monorepo 初始化完成
- **THEN** `.npmrc` 应存在，并启用 `shamefully-hoist=false`（或默认不提升依赖层次）

### Requirement: .gitignore 已配置
系统应包含 `.gitignore` 忽略不必要的文件和目录。

#### Scenario: node_modules 已被忽略
- **WHEN** 查看 `.gitignore` 内容
- **THEN** `node_modules/`、`.turbo/`、`dist/`、`.next/` 等构建产物目录应被忽略
