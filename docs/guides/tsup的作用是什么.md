# tsup 的作用与配置详解

`tsup` 是一个基于 [esbuild](https://esbuild.github.io/) 的极简、极快的 TypeScript 库打包工具。它旨在以最少的配置帮助你将 TypeScript 源码打包成多种格式（如 ESM、CommonJS），并自动生成类型定义文件（.d.ts）。

## 核心作用

| 作用              | 说明                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| **极速构建**      | 底层使用 Go 编写的 esbuild，构建速度比传统的 Webpack 或 Rollup 快 10-100 倍         |
| **多格式输出**    | 轻松输出 ESM (`.mjs`) 和 CommonJS (`.cjs`)，确保库在 Node.js 和浏览器环境下的兼容性 |
| **自动生成类型**  | 内置支持生成 `.d.ts` 类型定义文件，无需额外配置复杂的 `tsc` 流程                    |
| **零配置/少配置** | 对于简单的库，几乎可以做到零配置运行；对于复杂需求，提供简单的配置文件支持          |
| **现代特性支持**  | 原生支持 TypeScript、JSX、CSS 以及最新的 JavaScript 语法                            |

## 在 AgentHub 项目中的应用

在本项目中，`tsup` 主要用于 [packages/shared](file:///d:/code/github/AgentHub/packages/shared) 等子包的构建。

### 配置文件解析

查看 [tsup.config.ts](file:///d:/code/github/AgentHub/packages/shared/tsup.config.ts)：

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"], // 入口文件
  format: ["esm", "cjs"], // 同时输出 ESM 和 CommonJS 格式
  dts: true, // 自动生成 .d.ts 类型文件
  clean: true, // 每次构建前清理 dist 目录
  sourcemap: true, // 生成 sourcemap 方便调试
});
```

## 为什么选择 tsup 而不是直接用 tsc？

1. **打包能力**: `tsc` 只负责编译，不会将多个文件合并（Bundle）。`tsup` 可以将代码及其依赖打包成单文件或指定的块。
2. **速度**: `tsc` 的编译速度相对较慢，尤其是对于大型项目。`tsup` 利用 `esbuild` 的并发优势，几乎是瞬时完成。
3. **易用性**: `tsup` 处理了各种复杂的模块化问题（如 Node.js 的 CJS/ESM 混用），让开发者专注于业务代码。

## 常用命令

- `tsup`: 执行一次性构建。
- `tsup --watch`: 监听模式，文件变化时自动重新构建。
- `tsup --minify`: 压缩输出代码，减小体积。

## 总结

`tsup` 是现代 TypeScript 库开发的“标配”工具。它结合了 `esbuild` 的速度和库开发所需的各种实用特性（类型生成、多格式支持），大大提升了开发效率和库的维护质量。
