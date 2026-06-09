## Why

AI 回复在单聊和群聊中会出现内容重复：同一段回复文本被拼接成两倍长度显示，数据库中也会产生重复的消息记录。原因是前端发送消息的竞态条件（双击/双回车绕过 sending 守卫）导致 POST /messages/create 被调用两次，触发两次独立的 AI 执行流程。

## What Changes

- **修复 ChatPanel 发送防重守卫**：将 `sending` 从 `useState` 改为 `useRef`，实现同步防重检查，杜绝双击/双回车导致的重复发送
- **修复群聊 `onTaskCompleted` 回调**：返回创建的 message ID，使 `done` 事件携带有效 ID，让客户端去重逻辑能正常工作
- **移除 done 事件中冗余的 `fetchMessages` 调用**：`finalizeMessage` 已正确处理消息添加，后续的 `fetchMessages` 会产生竞态状态和不必要的 API 请求
- **无需修改数据库模式或 API 接口**

## Capabilities

### New Capabilities
- `message-send-guard`: 消息发送防重复机制，防止客户端重复提交

### Modified Capabilities
<!-- 无现有 spec 变更 -->

## Impact

- `apps/web/components/ChatPanel.tsx` — handleSend 函数使用 sendingRef + sending state 双重机制
- `apps/server/src/routes/messages.ts` — onTaskCompleted 回调返回 message id
- `apps/web/lib/chat-context.tsx` — done 事件处理逻辑简化
