## 1. 删除被重构取代的组件

- [x] 1.1 删除 `apps/web/components/ArtifactContent.tsx`
- [x] 1.2 删除 `apps/web/hooks/useNebulaCanvas.ts`
- [x] 1.3 删除 `packages/ui/src/components/MessageBubble/` 目录及测试文件
- [x] 1.4 删除 `packages/ui/src/components/ArtifactCard/` 目录及测试文件
- [x] 1.5 删除 `packages/ui/src/components/DiffCard/` 目录及测试文件
- [x] 1.6 删除 `packages/ui/src/components/PreviewCard/` 目录及测试文件
- [x] 1.7 更新 `packages/ui/src/index.ts` 移除上述 4 个组件的导出

## 2. ThemeSwitcher 接入 Sidebar

- [x] 2.1 在 `Sidebar.tsx` 中导入 `ThemeSwitcher`，插入到用户信息区域上方
- [x] 2.2 验证主题切换功能正常工作

## 3. MentionPopup 接入 ChatPanel

- [x] 3.1 在 `ChatPanel.tsx` 中导入 `MentionPopup`，替换现有内联 mention UI 逻辑
- [x] 3.2 验证 @ 输入触发的提及弹窗交互

## 4. GroupSection 接入 RightPanel

- [x] 4.1 在 `RightPanel.tsx` 中导入 `GroupSection`，在 `isGroupChat` 时渲染
- [x] 4.2 验证群聊对话中成员管理面板显示

## 5. 消息流分发渲染

- [x] 5.1 在 `ChatPanel.tsx` 的 `MessageContent` 组件中增加 type 分发逻辑
- [x] 5.2 接入 `DeployCard`（type=deploy）
- [x] 5.3 接入 `HesitateBubble`（type=hesitate）
- [x] 5.4 接入 `DebateTable`（type=debate）
- [x] 5.5 接入 `SilentAlertCard`（type=alert）

## 6. 验证

- [x] 6.1 `pnpm build` 所有包无错误
- [x] 6.2 应用代码无 TypeScript 错误
- [x] 6.3 测试通过（shared: 9/9）
- [x] 6.4 提交清理后的代码
