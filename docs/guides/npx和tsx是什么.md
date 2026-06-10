# npx 和 tsx 的作用详解

在现代 JavaScript/TypeScript 开发中，`npx` 和 `tsx` 是两个非常高频使用的命令行工具。它们分别解决了“工具运行”和“脚本执行”的痛点。

---

## 1. npx (Node Package Executor)

`npx` 是 npm 5.2.0 版本后内置的一个包运行器。它的核心作用是**运行那些你不想全局安装，或者只想临时运行一次的 CLI 工具**。

### 核心能力

| 功能             | 说明                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| **免安装运行**   | 如果本地没有某个包，`npx` 会自动从 npm 仓库下载并运行，运行完后不会占用磁盘空间。                |
| **调用本地依赖** | 优先运行项目 `node_modules/.bin` 下的工具，无需写冗长的路径（如 `./node_modules/.bin/eslint`）。 |
| **指定版本运行** | 可以运行特定版本的工具，例如 `npx cowsay@1.5.0 "hello"`。                                        |

### 常见场景

- **初始化项目**: `npx create-next-app@latest`
- **临时检查**: `npx license-checker` (检查项目依赖协议)
- **运行构建工具**: `npx prisma migrate dev` (在本项目中常用于数据库迁移)

---

## 2. tsx (TypeScript Execute)

`tsx` 是一个现代化的 TypeScript 运行器（Runtime）。它是 `ts-node` 的替代品，底层基于极快的 [esbuild](https://esbuild.github.io/)。

### 核心能力

| 功能             | 说明                                                            |
| ---------------- | --------------------------------------------------------------- |
| **直接运行 TS**  | 无需手动执行 `tsc` 编译成 JS，直接 `tsx script.ts` 即可运行。   |
| **极速响应**     | 由于使用 esbuild，其冷启动和执行速度比传统的 `ts-node` 快得多。 |
| **原生支持 ESM** | 完美支持现代 JavaScript 的模块化 (ESM) 和 CommonJS (CJS)。      |
| **Watch 模式**   | 内置监听功能，文件保存即重启：`tsx watch script.ts`。           |

### 常见场景

- **开发脚本**: 运行项目中的初始化脚本或数据处理脚本。
- **本地测试**: 快速验证某个 TypeScript 文件的逻辑。
- **替代 node**: 在开发环境下，将 `node` 替换为 `tsx` 以直接运行 TypeScript 应用。

---

## 3. npx 与 tsx 的结合

在本项目中，你可能会经常看到两者的组合使用：

```bash
npx tsx scripts/seed.ts
```

- **npx**: 确保即使你的环境中没有全局安装 `tsx`，也能通过 npm 找到并运行它。
- **tsx**: 负责实时编译并运行 `scripts/seed.ts` 这个 TypeScript 脚本。

## 总结

- **npx** 是“**工具的搬运工**”：让你随手拿来一个 npm 工具就能用，用完即走。
- **tsx** 是“**TS 的加速器**”：让你像运行 JS 一样，毫无负担地直接运行 TypeScript 代码。
