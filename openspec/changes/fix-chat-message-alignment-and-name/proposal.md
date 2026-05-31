## Why

当前聊天界面中，用户消息和 Contact 消息都采用左对齐，视觉上无法区分消息来源；同时用户消息显示 "YOU" / "你"，Contact 消息在 contacts 查找失败时回退显示 senderId（类似 ID 的字符串），体验不佳。需要修复对齐和显示名称两个问题，让会话界面更清晰自然。

## What Changes

- 修复消息对齐：用户消息右对齐，Contact 消息左对齐，系统消息居中
- 修复用户显示名称：用户消息显示当前用户的 `username`（即 name 字段），替代硬编码的 "YOU"
- 修复 Contact 显示名称：确保 Contact 消息正确使用 `Contact.name` 字段显示，消除 senderId 回退
- 修复 streaming 消息的 senderId 硬编码问题
- 修复 SSE 前端监听事件名不匹配问题

## Capabilities

### New Capabilities
- `chat-message-alignment`: 消息对齐规范——用户右对齐、Contact 左对齐、系统居中
- `chat-sender-name`: 消息发送者显示名称规范——用户显示 username，Contact 显示 name

### Modified Capabilities

<!-- No existing specs are being modified -->

## Impact

- `apps/web/components/ChatPanel.tsx` — 对齐方式、名称显示逻辑
- `apps/web/lib/chat-context.tsx` — streaming message senderId
- `apps/web/hooks/useSSEStream.ts` — SSE 事件监听
- `packages/ui/src/components/MessageBubble/MessageBubble.tsx` — 内部对齐属性
