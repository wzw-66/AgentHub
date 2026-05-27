## Context

AgentHub 的 8 个后端模块（monorepo-foundation、shared-types、database、agent-adapter、user-auth、api-server、real-time-communication、orchestrator）已全部实现，但目前没有任何前端代码。下一个阶段需要构建前端界面，而共享 UI 组件库是所有前端应用的基础依赖。

当前已有基础设施：
- Turborepo monorepo，pnpm workspaces
- `@agenthub/shared` 提供完整的类型定义（Agent、Message、Artifact 等）
- tsup 构建 ESM + CJS 双输出
- Vitest 测试框架
- 严格的 TypeScript 配置（`exactOptionalPropertyTypes: true`）

本项目是前端 UI 组件库，将被 `chat-ui`（apps/web）、`agent-market`、`artifact-preview` 三个模块消费。

## Goals / Non-Goals

**Goals:**
- 创建 `packages/ui` 包，使用 tsup 构建 ESM + CJS + dts
- 实现 6 个 React 组件：AgentAvatar、MessageBubble、CodeBlock、DiffCard、PreviewCard、ArtifactCard
- 每个组件有关联的 Props 类型定义、CSS Modules 样式、React Testing Library 测试
- 建立设计令牌系统（CSS 变量），确保视觉一致性
- 组件应支持 className prop 透传以允许消费者覆盖样式
- 组件为"纯展示"组件，不包含数据获取逻辑

**Non-Goals:**
- 不包含页面布局或路由逻辑（属于 chat-ui）
- 不包含状态管理（React Context、Zustand 等）
- 不包含数据获取逻辑（API 调用属于消费方）
- 不包含 Storybook 等文档工具（可后续添加）
- 不处理服务端渲染（SSR）兼容性（消费者处理）

## Decisions

### Decision 1: CSS Modules 作为样式方案

选择 CSS Modules 而非 Tailwind CSS、styled-components 或 Emotion。

**备选方案考虑：**
- **Tailwind CSS**：需要在组件库和消费者应用中重复配置，且 Tailwind 在共享组件库中会导致消费者必须安装 Tailwind 并包含组件库的样式路径
- **styled-components / Emotion**：运行时开销，且与 Next.js SSR 配合需要额外配置
- **CSS-in-JS 零运行时（Linaria）**：需要额外构建配置

**理由**：CSS Modules 零运行时开销、Next.js 原生支持、无需额外依赖、类型安全（可通过 `.module.css` 声明）。作为共享组件库，不强制消费者选择特定样式方案。

### Decision 2: 组件为无状态展示组件

所有组件通过 props 接收数据，不直接调用 API、不访问全局状态、不管理副作用。

```typescript
// 正确：纯展示组件，通过 props 接收数据
<MessageBubble message={message} variant="user" />

// 避免：组件内获取数据
// <MessageBubble messageId="123" />  ← 不采用
```

**理由**：让消费方灵活控制数据获取方式。chat-ui 可能从 SSE 流获取消息，agent-market 可能从 REST API 获取 Agent 列表，数据来源不同但组件可复用。

### Decision 3: prism-react-renderer 作为语法高亮方案

**备选方案：**
- **shiki**：高亮质量最高（VS Code 引擎），但包体积大（~5MB），不适合组件库
- **highlight.js**：轻量但 React 集成不够原生

**理由**：prism-react-renderer 体量适中（~50KB gzip），React 原生渲染器，支持自定义主题，TypeScript 类型完善，社区广泛使用。

### Decision 4: 构建只 external react/react-dom，内联其他依赖

tsup 的 `external` 只声明 `react` 和 `react-dom`，prism-react-renderer 等运行时依赖将被打入组件库 bundle。

**理由**：减少消费者安装负担。prism-react-renderer 等是组件库的内部实现细节，消费者不应需要关心。

### Decision 5: 设计令牌以 CSS 变量形式提供

```css
:root {
  --ui-color-primary: #2563eb;
  --ui-color-bg-user: #3b82f6;
  --ui-color-bg-contact: #f3f4f6;
  --ui-color-text-primary: #111827;
  --ui-color-border: #e5e7eb;
  --ui-font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --ui-radius-sm: 4px;
  --ui-radius-md: 8px;
  --ui-radius-lg: 16px;
  --ui-space-1: 4px;
  --ui-space-2: 8px;
  --ui-space-3: 12px;
  --ui-space-4: 16px;
}
```

**理由**：CSS 变量可被消费者覆盖以实现主题化，无需 JavaScript 运行时，且与 CSS Modules 天然兼容。

## Risks / Trade-offs

- [组件粒度不够细] → 如果消费者需要更细粒度的子组件（如 MessageBubble 内的 Header/Timestamp 单独导出），可在后续拆分。当前先保持粗粒度减少前期设计开销。
- [CSS Modules 类型安全] → TypeScript 默认不支持 `.module.css` 导入类型。方案：使用 `tsconfig.json` 中的 `include` 配合全局类型声明，或使用 `*.module.css` 的 wildcard 声明文件。
- [prism-react-renderer 版本兼容性] → React 19 可能引入 breaking changes。策略：将 react 声明为 peerDependency，测试时覆盖 React 18/19。
- [构建产物体积] → 如果 prism-react-renderer 导致包体积过大，后续可考虑懒加载或动态导入语法高亮器。当前先评估实际构建产物大小。
