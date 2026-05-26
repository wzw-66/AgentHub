# WebSocket 在 AgentHub 中的具体作用：一个完整场景

## 场景设定

你正在 AgentHub 的一个群聊里和三个 Agent（Claude、OpenCode、CustomGPT）一起解决一个 Bug。这是你第一次体验 WebSocket 带来的"灵异事件"——页面从来不用刷新，却什么都知道。

---

## 第一幕：在线状态

```
时间: T=0
动作: 你打开 AgentHub 网页
```

打开页面后，浏览器和后端建立了两条连接：

```
你的浏览器                         服务器
  │                                 │
  │── GET /ws?token=<JWT> ────────▶│  ← WebSocket 连接
  │                                 │
  │◀── {"type":"status:update",     │  ← 服务器广播
  │     "payload":{"userId":"你",    │     "你 上线了"
  │     "status":"online"}}         │
  │                                 │
  │◀── {"type":"status:update",     │  ← 另外三个 Agent
  │     "payload":{"userId":"Claude",│     也在线
  │     "status":"online"}}         │
  │                                 │
  │◀── {"type":"status:update",     │
  │     "payload":{"userId":"OpenCode",
  │     "status":"online"}}         │
  │                                 │
  │◀── {"type":"status:update",     │
  │     "payload":{"userId":"CustomGPT",
  │     "status":"online"}}         │
```

**UI 效果**：聊天栏顶部显示四个绿灯，四个成员都在线。

**如果没有 WebSocket**：页面加载后看不到任何人的在线状态，除非你手动刷新或等轮询。

---

## 第二幕：对方正在输入

```
时间: T=1min
动作: 你在聊天框输入 "看看这个 Bug..."

但还没按发送
```

```
你的浏览器                         服务器
  │                                 │
  │── {"type":"typing:start",       │  ← JS 检测到你在打字
  │     "payload":{"conversationId":
  │     "conv-123"}}                │
  │                                 │
  │                                 │── 广播给群聊其他人
  │                                 │
                                 Claude 收到:
  │                                 │◀── {"type":"typing:indicator",
  │                                 │      "payload":{
  │                                 │        "conversationId":"conv-123",
  │                                 │        "userId":"你",
  │                                 │        "isTyping":true}}
  │                                 │
  │                                 OpenCode 收到: (同上)
  │                                 CustomGPT 收到: (同上)
```

你停止打字 3 秒后：

```
你的浏览器                         服务器
  │                                 │
  │── {"type":"typing:end",         │
  │     "payload":{"conversationId":
  │     "conv-123"}}                │
  │                                 │── 广播停止输入给其他人
```

**UI 效果**：你打字时，群聊底部显示 "对方正在输入..."（但由于这里是你自己在输入，不显示给你自己）。如果其他 Agent 在输入，你会看到 "Claude 正在输入..."。

**如果没有 WebSocket**：永远不知道对方是不是正在回复你。你以为冷场了，其实对方刚打了 500 字。

---

## 第三幕：发消息 + 即时通知

```
时间: T=2min
动作: 你发了一条消息
```

```
你的浏览器                         服务器
  │                                 │
  │── POST /messages/create ──────▶│  ← 这是 HTTP，不是 WS
  │   { content: "帮我看看这个      │
  │     Bug: 页面白屏了" }          │
  │                                 │
  │◀── 201 { message } ───────────│  ← 消息已保存
  │                                 │
  │                                 │── WS 广播通知其他人
  │                                 │
  │                                 Claude 收到:
  │                                 │◀── {"type":"notification",
  │                                 │      "payload":{
  │                                 │        "conversationId":"conv-123",
  │                                 │        "senderId":"你",
  │                                 │        "preview":"帮我看看这个..."}}
  │                                 │
  │                                 OpenCode 收到: (同上)
  │                                 CustomGPT 收到: (同上)
```

**关键点**：你自己**不会**收到这条 notification（因为 excludeUserId 排除了你）。只有群聊里**其他人**会收到。

**UI 效果**：
- Claude 浏览器标签页闪烁："conv-123 有新消息"
- OpenCode 侧边栏 conv-123 出现红点 + 消息预览

**如果没有 WebSocket**：其他人需要手动刷新页面才能看到你的新消息，或者每 3 秒发一个 HTTP 轮询请求去问"有新消息吗？"——费流量、费电池、有延迟。

---

## 第四幕：Agent 流式输出（SSE 部分）

```
时间: T=2min10s
动作: 你触发 Agent 执行
```

```
你的浏览器                         服务器
  │                                 │
  │── POST /messages/:id/execute ─▶│  ← 触发执行
  │◀── 202 { status:"executing" }  │
  │                                 │
  │                                 │── 服务器调用 Agent
  │◀── SSE: chunk ────────────────│
  │   "让我看看这个问题..."          │  ← SSE 推流
  │◀── SSE: chunk ────────────────│
  │   "找到了！第 42 行的..."       │
  │                                 │
  │◀── SSE: done ─────────────────│
  │   { tokenUsage: {in:100,out:50}}
```

（这里 SSE 负责推送 Agent 的内容输出，WebSocket 不参与——各司其职。）

---

## 第五幕：已读回执

```
时间: T=5min
动作: Claude 看完了你的 Bug 描述
```

```
Claude 浏览器                       服务器
  │                                 │
  │── {"type":"message:read",       │  ← Claude 已读
  │     "payload":{                 │
  │       "conversationId":"conv-123",
  │       "messageId":"msg-456"     │
  │     }}                          │
```

**UI 效果**：你的消息旁边出现 "Claude 已读"。

---

## 第六幕：心跳保活

```
时间: T=10min
动作: 你切到其他页面，但 AgentHub 页面没关
```

连接如果不用会断。所以每 30 秒：

```
你的浏览器                         服务器
  │                                 │
  │── {"type":"ping"} ────────────▶│
  │◀── {"type":"pong"} ───────────│
  │                                 │
  │  服务器重置 60 秒心跳定时器      │
```

**如果没有心跳**：
- 你切出去 2 分钟回来，连接已经断了
- 你不知道，还在等消息
- 服务器也不知道你断了，以为你还活着
- 消息推送失败，没人知道

---

## 第七幕：断线清理

```
时间: T=30min
动作: 你不小心关掉了 AgentHub 页面
```

```
服务器检测到 socket 关闭:
  │
  │── clearTimeout(heartbeatTimer)   ← 清除心跳
  │── removeWSConnection(userId)     ← 移除连接
  │── broadcastStatus(userId, "offline")  ← 广播离线
  │
  │ 群聊其他人收到:
  │◀── {"type":"status:update",
  │      "payload":{"userId":"你",
  │      "status":"offline"}}
```

**UI 效果**：群里你的头像变灰，显示"离线"。

**如果没有 WebSocket**：你离开 30 分钟，头像还是绿的，别人以为你在装死。

---

## 总结：WebSocket 在 AgentHub 里到底做了什么？

| 没有 WebSocket 的世界 | 有 WebSocket 的世界 |
|---------------------|-------------------|
| 不知道谁在线 | 一打开页面就看到所有成员在线/离线 |
| 不知道对方是否在回复 | 实时看到"Claude 正在输入..." |
| 每 3 秒发 HTTP 轮询查新消息 | 新消息即时推送，零延迟 |
| 不知道消息是否被读了 | 已读回执实时反馈 |
| 断了连接没人知道 | 心跳检测 + 自助修复 |
| 人走了头像还绿着 | 断线秒变灰色 |

**一句话总结**：

> HTTP 像寄信——你发一封信，等回信，来回有延迟。
> SSE 像收音机——服务器单向广播，你只能听。
> WebSocket 像电话——两边随时可以说话，知道对方还在不在。
>
> AgentHub 用 SSE 播报 Agent 的"输出内容"，用 WebSocket 传递所有人的"状态"。
