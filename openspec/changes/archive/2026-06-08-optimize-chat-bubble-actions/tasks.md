## 1. CSS 清理

- [x] 1.1 在 `apps/web/src/app/globals.css` 中移除 `.hover-actions` 样式定义

## 2. ChatPanel 重构

- [x] 2.1 添加 `lastAgentMsgIds` useMemo 计算（单聊取最后一条 contact 消息，群聊按每个 senderId 取最后一条）
- [x] 2.2 移除 Agent 消息的 Fork 按钮（hover-actions 中的 handlePin 调用）
- [x] 2.3 移除 hover-actions 绝对定位层，将所有按钮合并到气泡下方的 flex 容器
- [x] 2.4 Agent 消息按钮居右下角：条件显示 Regenerate（仅 lastAgentMsgIds 中的消息）+ Copy + Reply
- [x] 2.5 User 消息按钮居左下角：条件显示 Edit（仅最后一条用户消息）+ Copy + Reply
- [x] 2.6 移除 User 消息的 Delete 按钮及相关的确认弹窗逻辑
- [x] 2.7 在 globals.css 中添加按钮淡入淡出动画（替代旧的 hover-actions 样式）
