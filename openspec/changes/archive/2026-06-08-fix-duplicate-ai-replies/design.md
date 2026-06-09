## Context

AI 回复重复 bug 涉及客户端到服务端的完整消息链路。用户发送消息后，客户端 POST /messages/create，服务端创建用户消息并触发后台 AI 执行。AI 流式输出通过 WebSocket 推送 chunk，完成后保存到 DB 并发送 done 事件。

问题链路：
```
用户双击发送 → 2× POST /create → 2条用户消息 → 2次 AI 执行
→ 2个流写入同个 streamingMessages key（相同 agentId）
→ 流式内容合并翻倍 → 2条 AI 消息存入 DB
```

## Goals / Non-Goals

**Goals:**
- 杜绝客户端重复发送消息导致的 AI 回复重复
- 修复群聊 done 事件 messageId 为空的问题，使客户端去重生效
- 消除 done 事件处理中冗余的 API 调用

**Non-Goals:**
- 不改变数据库 Schema 或 API 接口
- 不引入服务端幂等性机制（后续可单独优化）
- 不修改消息渲染或 WebSocket 链路

## Decisions

| 决策 | 方案 | 备选方案 | 理由 |
|------|------|---------|------|
| 发送守卫机制 | `useRef` 同步标记 + `useState` UI 状态 | 仅用 `useState`（当前方案）、节流、防抖 | `useRef` 在当前闭包中即时生效，`useState` 继续提供 UI 反馈。节流/防抖影响用户体验 |
| onTaskCompleted 返回值 | 直接返回 `createMessage` 的 `msg.id` | 无（当前返回 void） | `dispatcher.ts` 类型定义已支持 `Promise<string \| undefined>`，仅需补齐返回值 |
| done 事件 fetchMessages | 移除 | 保留 | `finalizeMessage` 已用正确 messageId 添加消息到 state，`fetchMessages` 冗余且加载旧数据 |

## Risks / Trade-offs

- **[低风险] 移除 fetchMessages 后消息一致性**：`finalizeMessage` 用 done 事件的 messageId 创建消息，与 DB 一致。页面刷新会从服务端重新加载完整消息列表
- **[低风险] useRef 不会触发重渲染**：UI 禁用状态仍由 `sending` useState 驱动，ref 仅作逻辑守卫，两者互补
