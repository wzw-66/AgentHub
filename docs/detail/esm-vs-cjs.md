# ESM vs CJS 模块系统

## 基本概念

| | CJS (CommonJS) | ESM (ECMAScript Modules) |
|---|---|---|
| 标准 | Node.js 原生标准（2009） | ECMAScript 官方标准（ES2015） |
| 关键词 | `require()` / `module.exports` | `import` / `export` |
| 文件后缀 | `.js`（默认）、`.cjs` | `.js`（需 `"type": "module"`）、`.mjs` |
| 加载时机 | 同步、运行时加载 | 异步、编译时解析 |
| 浏览器 | 不支持（需打包工具） | 原生支持（`<script type="module">`） |

## 核心区别

### 1. 加载机制

**CJS —— 同步、运行时、拷贝输出：**

```js
// math.js
const add = (a, b) => a + b;
module.exports = { add };

// app.js
const math = require("./math"); // 执行到这一行才加载
console.log(math.add(1, 2));     // 3
```

- `require()` 是同步的——会阻塞后续代码
- `module.exports` 是一个普通的 JS 对象赋值
- 导出的值是**值的拷贝**（基础类型是副本，对象是引用）

**ESM —— 异步、编译时、实时绑定：**

```js
// math.js
export const add = (a, b) => a + b;

// app.js
import { add } from "./math.js"; // 在代码执行之前就解析了
console.log(add(1, 2));           // 3
```

- `import` 在代码**执行之前**就被解析和绑定
- 支持**静态分析**——打包工具可以 tree-shake
- 导出的值是**实时绑定**（live binding）——导入方引用的是原始模块的变量，而不是拷贝

### 2. 实时绑定示例

```js
// counter.cjs
let count = 0;
module.exports = { count, increment: () => count++ };

// app.cjs
const { count, increment } = require("./counter");
console.log(count); // 0
increment();
console.log(count); // 0 ← CJS 拷贝了基础类型的值
```

```js
// counter.mjs
export let count = 0;
export const increment = () => count++;

// app.mjs
import { count, increment } from "./counter.mjs";
console.log(count); // 0
increment();
console.log(count); // 1 ← ESM 是实时绑定
```

### 3. 异步 / Top-level await

CJS 不支持 top-level await（只能在 async 函数内使用）：

```js
// ❌ CJS 语法错误
const data = await fetch("/api");
module.exports = { data };
```

ESM 原生支持 top-level await：

```js
// ✅ ESM 合法
export const data = await fetch("/api");
```

### 4. 循环依赖处理

**CJS** 遇到循环依赖时返回**未完成的部分导出**（可能拿到 `undefined`）：

```js
// a.cjs
const b = require("./b");
console.log("a 中 b 的值:", b); // { val: undefined }
module.exports = { val: "A" };

// b.cjs
const a = require("./a"); // 此时 a 还没执行完
module.exports = { val: "B" };
```

**ESM** 通过实时绑定可以正确处理循环依赖：

```js
// a.mjs
import { b } from "./b.mjs";
export const a = "A";
console.log("a 中 b:", b);

// b.mjs
import { a } from "./a.mjs";
export const b = "B";
console.log("b 中 a:", a);
```

### 5. `__dirname` / `import.meta`

| | CJS | ESM |
|---|---|---|
| 当前目录 | `__dirname` | `import.meta.dirname`（Node 21+）或 `fileURLToPath(import.meta.url)` |
| 当前文件 | `__filename` | `import.meta.url` |
| package.json | 不需要配置 | 需 `"type": "module"` 或使用 `.mjs` |

```js
// CJS
const path = require("path");
console.log(__dirname); // /app/src

// ESM
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
```

## tsup 双格式输出

`tsup` 配置 `format: ["esm", "cjs"]` 会同时生成两个文件：

```
dist/index.js      ← ESM 格式（import 引入）
dist/index.cjs     ← CJS 格式（require 引入）
```

同时在 `package.json` 中声明导出路径：

```json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

这样不管消费者用 `import` 还是 `require`，都能正确加载。

## 何时需要双格式

**需要双格式（库包）：** 消费者不确定是 CJS 还是 ESM 项目。例如 npm 上发布的工具库、组件库。

**只需 ESM（应用包）：** 该包不打算被外部 import/require——它是执行的入口。例如 Node.js 后端服务、CLI 工具。

### 由依赖链决定

是否需要双格式取决于该包在依赖链中的位置——**被引用的包需要兼容消费者，链末端的应用不需要**。

```
shared ──→ db ──→ server  ←── agent-core
  │                      ↑
  └──────────────────────┘
       被引用（需双格式）       无人引用（仅 ESM）
```

- 图中左侧的包（shared, db, agent-core, ui）处于被引用位置，消费者可能是 CJS 或 ESM，所以必须输出双格式
- 链末端的 server 是应用入口，没有其他包引用它，只通过 `node dist/index.js` 直接执行，无需兼容任何人

**那为什么现在全是 `import` 引用，还要保留 CJS？** 因为作为 npm 包，你不能假设所有消费者都和自己一样用 ESM。典型场景：如果某个 Electron 主进程脚本用 `require("@agenthub/db")` 连接数据库，没有 CJS 输出就直接报错了。双格式的意义就是——**让消费者选择，而不是替消费者决定**。

| 本项目的包 | 类型 | 输出格式 | 原因 |
|---|---|---|---|
| `@agenthub/shared` | 库 | ESM + CJS | 被 db、server、agent-core 引用 |
| `@agenthub/db` | 库 | ESM + CJS | 被 server 引用 |
| `@agenthub/agent-core` | 库 | ESM + CJS | 被 server 引用 |
| `@agenthub/ui` | 库 | ESM + CJS | 被 web 引用（React 组件库） |
| `@agenthub/server` | **应用** | ESM 即可 | 无人引用，`node dist/index.js` 直接启动 |
| `@agenthub/web` | **应用** | Next.js 管理 | 无需 tsup |

## 桌面端/移动端兼容性

| 平台 | 模块系统 | 说明 |
|---|---|---|
| Electron (主进程) | CJS（默认）或 ESM（Node 22+） | Electron 28+ 支持 ESM |
| Electron (渲染进程) | ESM | 浏览器标准 |
| React Native | ESM（通过 Metro 打包） | 默认支持 import/export |
| Tauri (Rust 后端) | 无关 | 前端是 WebView |
| Flutter | 无关 | 不涉及 JS 模块 |

所以本项目在不暴露 server 作为库的前景下，只保留 ESM 不会有兼容性问题。**真正影响桌面/移动端兼容性的是库包（shared, db, agent-core, ui）**，这些已经保留了双格式。
