# Lint（代码检查）的作用

## 什么是 Lint

Lint 是**静态代码检查**工具，在不运行代码的前提下分析源代码，发现潜在问题。

## 核心作用

| 作用 | 说明 |
|------|------|
| **发现语法错误** | 检测拼写错误、缺少括号、类型误用等低级错误 |
| **捕获潜在 Bug** | 未使用变量、无效的条件判断、可能的空指针访问 |
| **统一代码风格** | 缩进、引号、分号、命名规范等，团队协作时风格一致 |
| **强制执行最佳实践** | 禁止 deprecated API、强制错误处理、限制复杂度 |
| **前置反馈** | 在代码提交或 CI 阶段尽早发现问题，降低修复成本 |

## 在 AgentHub 项目中的配置

- **工具**: ESLint + TypeScript ESLint 插件
- **配置包**: `tooling/eslint-config/`（`@agenthub/eslint-config`）
- **规则**:
  - 继承 `eslint:recommended` 和 `plugin:@typescript-eslint/recommended`
  - 继承 `prettier`（与代码格式化工具协作）
  - `no-unused-vars` 设为 warn，忽略以 `_` 开头的参数
  - `no-explicit-any` 设为 warn，限制随意使用 `any` 类型
- **执行方式**: 通过 Turborepo 流水线执行 `pnpm lint` → `turbo lint`
- **与构建的关系**: lint 任务依赖 `build`，确保先编译再检查

## Lint vs 其他质量手段

```
Lint（静态检查）  → 编译前发现问题
TypeScript（类型检查） → 编译时发现问题
Test（测试）      → 运行时验证行为
```

三者互补，Lint 是最早的反馈环节，成本最低。
