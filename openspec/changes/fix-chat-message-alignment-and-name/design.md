## Context

当前 ChatPanel 消息渲染使用两层定位：外层 div 的 `textAlign` 控制内层 `inline-block` div 的位置，同时 MessageBubble 内部也声明了 `alignSelf`。两套机制存在冲突，导致消息对齐不可靠（用户消息没有正确右对齐）。名称显示方面，用户消息硬编码 "YOU"，contact 消息在联系人查找失败时回退显示 senderId（类似 ID 的字符串），streaming 消息的 senderId 被硬编码为 "agent"。

## Goals / Non-Goals

**Goals:**
- 所有消息正确对齐：用户右、Contact 左、系统居中
- 用户消息显示当前用户的 username，替代 "YOU"
- Contact 消息始终显示 contact 的 name，避免 senderId 回退
- 统一使用 flex 容器原生定位，去除脆弱的 textAlign + inline-block 组合
- 修复 streaming 消息中硬编码的 senderId 问题

**Non-Goals:**
- 不修改消息存储模型或 API 数据结构
- 不涉及 MessageBubble 组件样式改造（保持现有样式）
- 不涉及 SSE 服务端改造（只修前端监听）

## Decisions

### Decision 1: 使用 alignSelf 替代 textAlign + inline-block

**方案**：直接在外层 `.message-bubble` div 上使用 `alignSelf`，利用父容器 `flex flex-col` 的 flex 定位能力。

```
之前：
  div.message-bubble [textAlign: right]     ← 在 flex 容器中只控制文本对齐
    div[inline-block, maxWidth:70%]          ← 需要 inline-block 配合 textAlign
      MessageBubble [alignSelf: flex-end]    ← 父级不是 flex，此属性无效

之后：
  div.message-bubble [alignSelf: flex-end]   ← 直接利用 flex 容器定位
    MessageBubble                            ← 需要去掉内部 alignSelf
```

**理由**：
- 代码更简洁，去掉一层无用的 `inline-block` 包装
- 利用 flex 容器原生的 `alignSelf` 属性，语义清晰且浏览器支持稳定
- MessageBubble 内部的 `alignSelf` 在当前结构中实际上不生效，移除不会影响现有功能

### Decision 2: 用户消息使用 useAuth 显示 username

**方案**：在 ChatPanel 中引入 `useAuth()` hook，获取当前用户信息。用户消息显示 `user.username` 替代 `t("chat").you`。

**理由**：
- `user.username` 映射自服务端返回的 `name` 字段（auth-context.tsx:71），是用户注册时填写的名称
- `useAuth()` 在 provider 栈中位于 ChatProvider 上层，ChatPanel 中可直接调用
- 添加 fallback：当 user 为 null 时仍回退显示 "YOU"

### Decision 3: 修复 streaming 消息 senderId

**方案**：
- `chat-context.tsx` 中 `appendMessageChunk` 和 `finalizeMessage` 不再硬编码 `senderId: "agent"`
- 改为从 SSE chunk/done 事件中携带的 agentId 获取
- `useSSEStream.ts` 中保存当前活动的 agentId，传给 appendMessageChunk 和 finalizeMessage

**理由**：
- 服务端 dispatcher 发送 `agent:${sub.agentId}:chunk` 事件，其中 agentId 是对应 contact 的真实 ID
- 但前端监听的事件名是 "chunk"（与 "agent:xxx:chunk" 不匹配），需要同时修复事件名
- 修复后，streaming 消息的 senderId 能正确匹配 contacts 数组中的 contact

### Decision 4: 修复 SSE 事件监听

**方案**：`useSSEStream.ts` 中监听 `agent:${agentId}:chunk` 动态事件名，而非 "chunk"。

但实际上 SSE 用 EventSource 无法动态监听通配符事件名。替代方案：
- 前端改为监听 "chunk" 事件，服务端也发送 "chunk" 事件（修改 dispatcher）
- 或者在连接管理器层将 `agent:xxx:chunk` 统一转为 `chunk` 事件转发

**选择**：使用连接管理器层统一转发，保持服务端 dispatcher 的细粒度事件名不变。

## Risks / Trade-offs

- [SSE 事件名不匹配] → 当前 streaming 功能可能完全不可用，修复后可正常工作
- [移除 inline-block 包装可能影响布局] → 需验证 MessageBubble 自身的 maxWidth 和 borderRadius 在新结构下正确渲染
- [useAuth 引入 ChatPanel] → ChatPanel 需要感知用户状态，但目前已经是 CMS 组件，添加 auth 依赖合理
