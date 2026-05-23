## Why

AgentHub 项目采用多包 Monorepo 架构（3 个 app + 4 个共享包 + tooling），但目前工作目录仅有规划和文档文件，缺少 monorepo 基础骨架。没有统一的构建流水线、TypeScript 配置和 ESLint 规则，开发者无法开始编码。本变更建立整个项目的工程基础，让后续所有模块可以并行开发。

## What Changes

- 初始化 pnpm + Turborepo 驱动的 monorepo 根目录
- 创建 `turbo.json` 定义 build/dev/lint/test 流水线
- 配置 `pnpm-workspace.yaml` 将 `apps/*`、`packages/*`、`tooling/*` 注册为工作空间
- 创建 `tooling/tsconfig/` 共享 TypeScript 配置（base、nextjs、node）
- 创建 `tooling/eslint-config` 共享 ESLint 配置包
- 添加 `.npmrc`、`.gitignore` 等基础设施文件
- 验证 `pnpm install` 和 turbo 流水线可正常运行

## Capabilities

### New Capabilities
- `monorepo-foundation`: Turborepo monorepo 基础骨架，包含根 package.json、构建流水线、pnpm 工作空间

### Modified Capabilities

无（此为初始搭建，尚无已有模块需要修改）。

## Impact

- **根目录**: 创建 `package.json`、`turbo.json`、`pnpm-workspace.yaml`、`.npmrc`、`.gitignore`
- **tooling 目录**: 创建 `tooling/tsconfig/base.json`、`tooling/tsconfig/nextjs.json`、`tooling/tsconfig/node.json`、`tooling/eslint-config/` 包
- **依赖新增**: turbo、typescript、eslint、prettier、@typescript-eslint/* 等开发依赖
- **工作空间**: 目录结构预留 `apps/`、`packages/`、`tooling/` 三个工作空间入口
