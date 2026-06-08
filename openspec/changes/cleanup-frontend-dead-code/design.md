## Context

2026-06-03 前端重构后，ChatPanel 全面改用 MarkdownRenderer + 内联 JSX 渲染消息，导致大量旧组件和共享 UI 组件未被使用。

### Current State
- 8 个 `apps/web/components/` 组件零引用
- 4 个 `packages/ui/src/components/` 组件已导出但未被 web app 消费
- 1 个 hooks 文件零引用
- ChatPanel 已有 `mentionState` 管理但未使用 MentionPopup UI 组件
- Sidebar 和 RightPanel 有群组检测逻辑但未使用 GroupSection

## Goals / Non-Goals

**Goals:**
- 删除被重构取代的组件和 hook（6个文件/目录）
- 将 7 个功能完整的组件接入现有的 UI 插槽
- 清理关联的测试文件和翻译死键

**Non-Goals:**
- 不修改后端或数据库
- 不改变消息存储格式
- 不新增组件功能（只接入现有组件）

## Decisions

### 删除策略
- **直接删除文件**，无需 git mv 到 archive
- 关联测试文件同步删除
- UI 库组件同时从 `packages/ui/src/index.ts` 移除导出

### 接入策略

| 组件 | 接入点 | 方式 |
|------|--------|------|
| ThemeSwitcher | Sidebar 用户区域上方 | 直接插入 JSX，theme-context 已存在 |
| MentionPopup | ChatPanel 输入区 | 替换现有内联 mention UI，props 已匹配 |
| GroupSection | RightPanel | 在 `isGroupChat` 时渲染，从 contacts 构建 members |
| DeployCard | 消息流 | 在 ChatPanel 的 `MessageContent` 中增加类型判断 |
| HesitateBubble | 消息流 | 同上，根据 message type 分发 |
| DebateTable | 消息流 | 同上 |
| SilentAlertCard | 消息流 | 同上 |

### 消息流分发设计

ChatPanel 中现有的 `MessageContent` 组件目前统一使用 `<MarkdownRenderer>`。改造后：

```typescript
function MessageContent({ message }: { message: Message }) {
  switch (message.type) {
    case "deploy":    return <DeployCard {...} />;
    case "hesitate":  return <HesitateBubble {...} />;
    case "debate":    return <DebateTable {...} />;
    case "alert":     return <SilentAlertCard {...} />;
    default:          return <MarkdownRenderer content={message.content} />;
  }
}
```

## Risks / Trade-offs

- **[数据格式不匹配]** 如果服务器实际发送的消息类型字段名与组件 props 不一致，接入后可能渲染异常 → 接入时检查一次实际消息数据格式
- **[Sidebar 布局变化]** 添加 ThemeSwitcher 可能挤压现有 UI → 保持紧凑布局，使用和退出按钮相同的行内样式
- **[MentionPopup 冲突]** ChatPanel 已有内联 mention UI 逻辑 → 彻底替换为 MentionPopup 组件，删除重复逻辑
