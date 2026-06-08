## ADDED Requirements

### Requirement: 删除被重构取代的组件
系统 SHALL 删除以下被重构取代的组件文件及关联代码：
- ArtifactContent.tsx
- useNebulaCanvas.ts
- @agenthub/ui 中的 MessageBubble、ArtifactCard、DiffCard、PreviewCard 组件

#### Scenario: 组件文件被删除
- **WHEN** 检查 `apps/web/components/` 目录
- **THEN** ArtifactContent.tsx 不存在

#### Scenario: UI 库导出被清理
- **WHEN** 检查 `packages/ui/src/index.ts`
- **THEN** 不再导出 MessageBubble、ArtifactCard、DiffCard、PreviewCard

#### Scenario: 关联测试文件同步删除
- **WHEN** 检查被删除组件的测试文件
- **THEN** 对应的 `__tests__/` 目录一同被清理

### Requirement: 接入未使用的功能组件
系统 SHALL 将 7 个功能完整但未使用的组件接入现有 UI 插槽：
- ThemeSwitcher 接入 Sidebar
- MentionPopup 接入 ChatPanel
- GroupSection 接入 RightPanel
- DeployCard、HesitateBubble、DebateTable、SilentAlertCard 接入消息流

#### Scenario: ThemeSwitcher 在 Sidebar 中可操作
- **WHEN** 在 Sidebar 底部点击主题切换按钮
- **THEN** 页面主题在亮色/暗色之间切换

#### Scenario: MentionPopup 在 ChatPanel 输入 @ 时显示
- **WHEN** 在 ChatPanel 输入框中输入 `@`
- **THEN** 弹出 MentionPopup 显示可用 Agent 列表

#### Scenario: GroupSection 在群聊 RightPanel 中显示
- **WHEN** 当前对话类型为 group
- **THEN** RightPanel 显示 GroupSection 展示群组成员

#### Scenario: 消息按类型分发渲染
- **WHEN** 消息 type 为 "deploy"/"hesitate"/"debate"/"alert"
- **THEN** 使用对应的专用组件渲染，而非 MarkdownRenderer
