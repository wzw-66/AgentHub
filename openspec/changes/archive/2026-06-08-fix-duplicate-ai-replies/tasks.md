## 1. ChatPanel 发送防重守卫

- [x] 1.1 在 ChatPanel 中添加 `sendingRef = useRef(false)` 同步守卫
- [x] 1.2 修改 `handleSend`：用 `sendingRef.current` 替代 `sending` 做防重检查
- [x] 1.3 在 `setSending(true/false)` 处同步设置 `sendingRef.current`

## 2. 群聊 onTaskCompleted 返回 messageId

- [x] 2.1 修改 `messages.ts` 中 `runOrchestration` 的 `onTaskCompleted` 回调，返回 `createMessage` 的 `msg.id`

## 3. 移除 done 事件冗余 fetchMessages

- [x] 3.1 移除 `chat-context.tsx` 中 `done` 事件处理里的 `fetchMessages` 调用，只保留 `finalizeMessage`
