## Why

2026-06-03 前端重构后，大量旧组件和 UI 库组件变为未使用状态，造成代码维护负担和混淆。需要系统性清理：被重构取代的组件直接删除，功能完整但未接入消息流的组件重新集成。

## What Changes

### 删除（被重构取代）
- **ArtifactContent** — 旧 artifact marker 解析组件，ChatPanel 已改用 MarkdownRenderer 直接渲染
- **useNebulaCanvas** — 星云背景动画 hook，决定不用
- **@agenthub/ui 组件**: MessageBubble, ArtifactCard, DiffCard, PreviewCard — 重构后 ChatPanel 内联渲染消息，不再使用这些共享组件

### 接入消息流（功能完整但未使用）
- **ThemeSwitcher** — 亮/暗主题切换按钮，接入 Sidebar 底部
- **MentionPopup** — @提及 Agent 弹窗，接入 ChatPanel 输入区
- **GroupSection** — 群组成员管理面板，接入 RightPanel，配合现有 `isGroupChat` 检测
- **DeployCard** — 部署状态卡片，agent 产生部署消息时在消息流渲染
- **HesitateBubble** — Agent 犹豫选项气泡，agent 产生犹豫消息时渲染
- **DebateTable** — 多 Agent 辩论对比表格，多 agent 对比结果时渲染
- **SilentAlertCard** — 安全/代码告警卡片，告警消息时渲染

## Capabilities

### New Capabilities
- `dead-code-cleanup`: 清理前端重构后未使用的组件，删除被取代的代码，接入功能完整的组件到消息流

### Modified Capabilities
无 — 不涉及 spec 级别的行为变更，纯 UI 清理和重新集成

## Impact

- **apps/web/components/**: 删除 2 个文件（`ArtifactContent.tsx`, `PublishAgentModal.tsx` 确认后），删除 1 个 hook（`useNebulaCanvas.ts`）
- **packages/ui/src/components/**: 删除 4 个组件目录（MessageBubble, ArtifactCard, DiffCard, PreviewCard）
- **apps/web/components/**: 接入 7 个组件（ThemeSwitcher->Sidebar, MentionPopup->ChatPanel, GroupSection->RightPanel, DeployCard/HesitateBubble/DebateTable/SilentAlertCard->消息流）
- **apps/web/lib/i18n/translations/**: 清理与 PublishAgentModal 关联的死翻译键
