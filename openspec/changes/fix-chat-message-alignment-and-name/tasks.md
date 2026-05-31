## 1. 消息对齐修复

- [x] 1.1 移除 ChatPanel 中 `textAlign` + `display: inline-block` 的包装层
- [x] 1.2 在外层 `.message-bubble` div 上使用 `alignSelf` 控制对齐（user: flex-end, contact: flex-start, system: center）
- [x] 1.3 移除 MessageBubble 组件内部无用的 `alignSelf` 属性（父级非 flex 容器）

## 2. 用户显示名称修复

- [x] 2.1 在 ChatPanel 中引入 `useAuth()`，获取当前用户信息
- [x] 2.2 用户消息显示 `user.username`，替代 `t("chat").you`
- [x] 2.3 添加 null fallback：user 为 null 时回退显示 "YOU" / "你"

## 3. SenderType 大小写不匹配修复

- [x] 3.1 修复 `packages/shared/src/enums/sender.ts`：`SenderType.User` 的值从 `"user"` 改为 `"User"`（匹配 Prisma schema）
- [x] 3.2 前端 ChatPanel 使用 `.toLowerCase()` 做大小写不敏感比较，兼容新旧数据
- [x] 3.3 修复 SSE 事件监听：前端监听正确的 chunk 事件名
- [x] 3.4 修复 `chat-context.tsx` 中 streaming message 的硬编码 `senderId: "agent"`，改为从 SSE 事件的 agentId 获取
- [x] 3.5 确保 `useSSEStream.ts` 将 agentId 传递给 appendMessageChunk/finalizeMessage
- [x] 3.6 修复 streaming 消息渲染中的 senderId 显示（ChatPanel 第 403-427 行）
