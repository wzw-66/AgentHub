## 新增需求

### 需求：初始化 Turborepo Monorepo
系统应提供基于 Turborepo 的 monorepo，使用 pnpm 作为包管理器。

#### 场景：根目录 package.json 已创建
- **当** monorepo 初始化完成
- **则** 根目录 `package.json` 应包含 `turbo` 和 `typescript` 开发依赖

#### 场景：pnpm-workspace.yaml 已配置
- **当** 工作空间配置完成
- **则** `pnpm-workspace.yaml` 应包含 `apps/*`、`packages/*` 和 `tooling/*` 作为工作空间条目

#### 场景：turbo.json 定义了流水线
- **当** 构建流水线配置完成
- **则** `turbo.json` 应定义 `build`、`dev`、`lint` 和 `test` 流水线任务，并设置正确的 `dependsOn`

### 需求：共享 TypeScript 和 ESLint 配置
系统应在 `tooling/` 目录下提供可复用的 TypeScript 和 ESLint 配置。

#### 场景：基础 tsconfig 已创建
- **当** 工具链设置完成
- **则** `tooling/tsconfig/base.json` 应存在，并包含严格的 TypeScript 设置

#### 场景：Next.js tsconfig 继承基础配置
- **当** Next.js 应用配置完成
- **则** `tooling/tsconfig/nextjs.json` 应继承 `base.json` 并包含 `jsx: preserve`

#### 场景：Node tsconfig 继承基础配置
- **当** Node.js 包配置完成
- **则** `tooling/tsconfig/node.json` 应继承 `base.json` 并包含 `@types/node`

#### 场景：ESLint 配置已创建
- **当** ESLint 配置完成
- **则** `tooling/eslint-config/index.js` 应继承 `@typescript-eslint/recommended` 和 `prettier`

### 需求：包脚本可用
根目录 `package.json` 应提供 `dev`、`build`、`lint` 和 `test` 脚本，委托给 turbo 执行。

#### 场景：dev 脚本正常工作
- **当** 执行 `pnpm dev`
- **则** turbo 应并行运行所有工作空间的 dev 脚本

#### 场景：build 脚本正常工作
- **当** 执行 `pnpm build`
- **则** turbo 应按依赖顺序构建所有工作空间
