## 1. 根目录初始化

- [ ] 1.1 创建根目录 `package.json`，包含 `name: "agenthub"`、`private: true`，定义 `dev`、`build`、`lint`、`test` 脚本委托给 turbo
- [ ] 1.2 安装核心开发依赖：`pnpm add -wD turbo typescript`
- [ ] 1.3 创建 `pnpm-workspace.yaml`，包含 `apps/*`、`packages/*`、`tooling/*` 工作空间条目
- [ ] 1.4 创建 `.npmrc`，配置 `shamefully-hoist=false` 等 pnpm 行为
- [ ] 1.5 创建 `.gitignore`，忽略 `node_modules/`、`.turbo/`、`dist/`、`.next/` 等目录

## 2. Turborepo 流水线配置

- [ ] 2.1 创建 `turbo.json`，定义 pipeline 包含 `build`、`dev`、`lint`、`test` 四个任务
- [ ] 2.2 配置 build 任务的 `dependsOn: ["^build"]`，确保按依赖顺序构建
- [ ] 2.3 配置 dev 任务的 `persistent: true`，支持长时间运行
- [ ] 2.4 配置 lint 和 test 任务的 `dependsOn` 依赖关系

## 3. 共享 TypeScript 配置

- [ ] 3.1 创建 `tooling/tsconfig/base.json`，启用 strict、exactOptionalPropertyTypes、noUncheckedIndexedAccess 等严格选项
- [ ] 3.2 创建 `tooling/tsconfig/nextjs.json`，继承 base 并添加 jsx: preserve 和 moduleResolution: bundler
- [ ] 3.3 创建 `tooling/tsconfig/node.json`，继承 base 并添加 @types/node 和 moduleResolution: node

## 4. 共享 ESLint 配置

- [ ] 4.1 创建 `tooling/eslint-config/package.json`，包名为 `@agenthub/eslint-config`
- [ ] 4.2 创建 `tooling/eslint-config/index.js`，继承 `@typescript-eslint/recommended` 和 `prettier`
- [ ] 4.3 安装 ESLint 相关依赖：`pnpm add -wD eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier`

## 5. 验证

- [ ] 5.1 执行 `pnpm install` 验证工作空间解析正常
- [ ] 5.2 执行 `pnpm lint` 验证 ESLint 配置可用
- [ ] 5.3 执行 `pnpm build` 验证 turbo 流水线可正常启动
