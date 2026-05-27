## Why

AgentHub 的后端核心模块（auth、API、实时通信、编排器）已全部完成，但前端界面仍是空白。下一个关键步骤是构建共享 UI 组件库 `@agenthub/ui`，为后续聊天界面（chat-ui）、Agent 市场（agent-market）和产物预览（artifact-preview）提供基础。独立出 UI 组件包可以避免多个前端应用之间复制代码，保证视觉一致性，并支持独立版本迭代。

## What Changes

- 创建 `packages/ui` 包，作为 AgentHub 的共享 React 组件库
- 实现 6 个核心 UI 组件：AgentAvatar、MessageBubble、CodeBlock、DiffCard、PreviewCard、ArtifactCard
- 建立设计令牌系统（颜色、间距、字体、圆角 CSS 变量）
- 使用 CSS Modules 实现组件样式，零运行时开销
- 每个组件附带完整的 React Testing Library 测试
- 组件包采用 tsup 构建，输出 ESM + CJS + dts，与 monorepo 现有构建体系一致

## Capabilities

### New Capabilities

- `ui-components`: 共享 React 组件库，包含 AgentAvatar、MessageBubble、CodeBlock、DiffCard、PreviewCard、ArtifactCard 六个组件，以及设计令牌系统和组件测试套件

### Modified Capabilities

<!-- 无现有能力变更 -->

## Impact

- 新增 `packages/ui/` 目录，包含组件源码、样式和测试
- 新增依赖：react、react-dom（peerDeps）、@testing-library/react、@testing-library/jest-dom、jsdom、prism-react-renderer、@vitejs/plugin-react
- 更新 `pnpm-lock.yaml`
- 不影响已有 8 个模块的代码和测试
- 为后续 chat-ui、agent-market、artifact-preview 三个前端模块提供基础依赖
