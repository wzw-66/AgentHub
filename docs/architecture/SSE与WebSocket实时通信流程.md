# SSE 与 WebSocket 实时通信流程

## 一、概念

### 为什么需要两条通道？

| 通道 | 方向 | 用途 | 类比 |
|------|------|------|------|
| **SSE** (Server-Sent Events) | 服务端 → 客户端（单向） | Agent 流式输出推送 | 对方发来的语音消息内容 |
| **WebSocket** | 双向 | 在线状态、typing 指示器、消息通知 | "对方正在输入..."、红点提示 |

```
SSE：只管"内容推送"——Agent 在说什么
WS：只管"状态交互"——Agent 在不在、在干嘛、有没有新消息
```

### 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                       @agenthub/server                            │
│                                                                   │
│  ┌──────────────┐    ┌─────────────────────────────────────────┐  │
│  │  REST API    │    │          实时通信模块                      │  │
│  │              │    │                                           │  │
│  │  /messages   │    │  ┌─────────────────┐                    │  │
│  │  /create     │────┼──▶  SSE端点         │                    │  │
│  │  /execute    │    │  │  GET /sse/...     │  Server → Client   │  │
│  │              │    │  └─────────────────┘                    │  │
│  │              │    │                                           │  │
│  │              │    │  ┌─────────────────┐                    │  │
│  │              │    │  │  WebSocket端点   │  双向               │  │
│  │              │    │  │  GET /ws         │                    │  │
│  │              │    │  └─────────────────┘                    │  │
│  └──────────────┘    └─────────────────────────────────────────┘  │
│                           │                                       │
│                           ▼                                       │
│                    ┌──────────────┐                               │
│                    │ConnectionMgr │  统一管理所有长连接              │
│                    │  SSE Map     │  Map<conversationId, Set<>>    │
│                    │  WS Map      │  Map<userId, Set<>>           │
│                    └──────────────┘                               │
└──────────────────────────────────────────────────────────────────┘
```

***

## 二、SSE 创建流程

### 2.1 连接建立

```
客户端                                           服务端
  │                                               │
  │── GET /sse/conversations/:convId/stream ──────▶
  │   ?token=<JWT>                                │
  │                                               │── verifyQueryToken(query)
  │                                               │   ├─ 有效 → 继续
  │                                               │   └─ 无效 → 401
  │                                               │
  │                                               │── writeHead(200, {
  │                                               │     Content-Type: text/event-stream
  │                                               │     Cache-Control: no-cache
  │                                               │     Connection: keep-alive
  │                                               │   })
  │                                               │
  │                                               │── cm.addSSEConnection(convId, reply)
  │                                               │
  │◀──── event: connected ───────────────────────│
  │      data: { "userId": "..." }               │
  │                                               │
  │        连接保持打开，等待后续事件推送              │
```

### 2.2 SSE 事件格式

标准 SSE 协议格式：

```
event: <事件类型>
data: <JSON 字符串>


```

每条事件以双换行结尾。支持的事件类型：

| 事件名 | 触发时机 | data 内容 |
|--------|---------|-----------|
| `connected` | 连接刚建立 | `{ userId }` |
| `chunk` | Agent 输出文本/代码/tool_call | `{ type, content, timestamp }` |
| `artifact_status` | Agent 构建产物状态变更 | `{ id, status, title }` |
| `done` | Agent 执行完成 | `{ messageId, tokenUsage }` |
| `error` | 执行出错 | `{ message, code }` |

### 2.3 断线检测

```
客户端异常断开:
  request.raw.on("close")
         │
         ▼
  cm.removeSSEConnection(convId, reply)
  → 该连接从连接池中移除
  → 后续 pushToConversation 不再推送给它

浏览器 EventSource 会自动重连（原生 SSE 能力）
```

### 2.4 核心代码路径

```typescript
// src/routes/sse.ts
async function handleSSEStream(request, reply) {
  // ① 认证
  const user = verifyQueryToken(request.query);
  if (!user) return reply.status(401).send({ error: "invalid_token" });

  // ② 设置 SSE 响应头
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // ③ 注册连接
  cm.addSSEConnection(conversationId, reply);

  // ④ 发送初始 connected 事件
  reply.raw.write(formatSSEEvent("connected", { userId: user.userId }));

  // ⑤ 监听断线
  request.raw.on("close", () => {
    cm.removeSSEConnection(conversationId, reply);
  });
}
```

### 2.5 Agent 执行推送流程

```
POST /messages/:messageId/execute
         │
         ▼
  handleExecute()
    ├─ getMessage(messageId) → 验证消息存在
    ├─ 返回 202 { status: "executing" } 给客户端
    │
    └─ runAgentExecution()  (后台异步执行)
          │
          ├─ getConversation(convId)
          ├─ 获取 contact → agent → provider
          ├─ createAdapter(provider)
          ├─ adapter.execute(context)
          │     │
          │     ▼
          │  异步遍历 AsyncIterable<Chunk>
          │     │
          │     ▼
          │  pushChunk(cm, convId, chunk)
          │     │
          │     ├─ ChunkType.Text     → SSE event: chunk
          │     ├─ ChunkType.Code     → SSE event: chunk
          │     ├─ ChunkType.ToolCall → SSE event: chunk
          │     ├─ ChunkType.Artifact → SSE event: artifact_status
          │     ├─ ChunkType.Error    → SSE event: error
          │     └─ ChunkType.Done     → SSE event: done
          │
          └─ 完成 →
              cm.pushToConversation(convId, "done", {
                messageId, tokenUsage: { input, output }
              })
```

***

## 三、WebSocket 创建流程

### 3.1 连接建立

```
客户端                                           服务端
  │                                               │
  │── GET /ws?token=<JWT> ───────────────────────▶
  │   (WebSocket Upgrade 握手)                     │
  │                                               │
  │  @fastify/websocket 自动处理 HTTP Upgrade      │
  │                                               │
  │                                               │── verifyQueryToken({ token })
  │                                               │   ├─ 无效 → socket.close(4001, "invalid_token")
  │                                               │   └─ 有效 → 继续
  │                                               │
  │                                               │── cm.addWSConnection(userId, socket)
  │                                               │
  │                                               │── broadcastStatus(online)
  │                                               │   → 广播给其他用户: { type: "status:update",
  │                                               │       payload: { userId, status: "online" } }
  │                                               │
  │                                               │── 启动心跳计时器 (60s)
  │                                               │
  │◀──── 连接成功 ────────────────────────────────│
```

### 3.2 WebSocket 消息协议

所有消息统一 JSON 格式：

```typescript
{
  type: string;        // 事件类型
  payload: unknown;     // 事件数据
  timestamp: string;    // ISO 时间戳（服务端发送时自动添加）
}
```

### 3.3 事件类型总表

#### 客户端 → 服务端

| type | payload | 说明 |
|------|---------|------|
| `typing:start` | `{ conversationId }` | 用户开始输入 |
| `typing:end` | `{ conversationId }` | 用户停止输入 |
| `message:read` | `{ conversationId, messageId }` | 用户阅读消息 |
| `ping` | — | 心跳检测 |

#### 服务端 → 客户端

| type | payload | 说明 |
|------|---------|------|
| `typing:indicator` | `{ conversationId, userId, isTyping }` | 广播某人正在输入 |
| `status:update` | `{ userId, status: "online"\|"offline" }` | 在线/离线状态变更 |
| `notification` | `{ conversationId, senderId, preview }` | 新消息通知 |
| `pong` | — | 心跳回复 |

### 3.4 消息分发机制

```
WebSocket.on("message", raw)
         │
         ▼
  JSON.parse(raw) → 得到 msg: { type, payload }
         │
         ▼
  wsHandlers[msg.type] → 按 type 分发到不同 handler
         │
         ├─ "typing:start" → broadcast typing:indicator(true)
         ├─ "typing:end"   → broadcast typing:indicator(false)
         ├─ "message:read" → acknowledge（当前不处理）
         └─ "ping"         → reply pong
```

### 3.5 心跳保活

```
客户端                                    服务端
  │                                        │
  │── { type: "ping" } ──────────────────▶│
  │                                        │── 回复 pong
  │◀── { type: "pong" } ─────────────────│
  │                                        │── 重置心跳计时器
  │                                        │
  │   (每 30s 发一次 ping)                 │
  │                                        │
  │   (如果 60s 没收到任何消息)              │
  │                                        │── socket.close(4002, "heartbeat_timeout")
  │                                        │── broadcastStatus(offline)
```

### 3.6 连接生命周期

```
建立连接:
  addWSConnection(userId, socket)
  → broadcastStatus(online)
  → 启动心跳

活跃期间:
  收到 message → 重置心跳
  各 handler 处理业务逻辑

断开连接:
  socket.on("close")
  → 清除心跳定时器
  → removeWSConnection(userId, socket)
  → broadcastStatus(offline)
```

### 3.7 在线状态广播流程

```
用户 A 连接 WS:
  addWSConnection("user-A", socketA)
  broadcastStatus("user-A", "online")
    → broadcastToConversation(所有用户, "status:update",
        { userId: "user-A", status: "online" }, exclude: "user-A")
    → 此时只有 user-A 在线，无人收到

用户 B 连接 WS:
  addWSConnection("user-B", socketB)
  broadcastStatus("user-B", "online")
    → broadcastToConversation(所有用户, "status:update",
        { userId: "user-B", status: "online" }, exclude: "user-B")
    → user-A 收到 → UI 显示 "user-B 在线"

用户 B 断开:
  removeWSConnection("user-B", socketB)
  broadcastStatus("user-B", "offline")
    → user-A 收到 → UI 显示 "user-B 离线"
```

***

## 四、新消息通知联动流程

```
客户端 A                          服务端                         客户端 B
  │                                │                                │
  │── POST /messages/create ──────▶│                                │
  │   { content: "你好" }          │                                │
  │                                │── 创建消息到 DB                │
  │◀── 201 { message } ──────────│                                │
  │                                │                                │
  │                                │── cm.broadcastToConversation(   │
  │                                │     "notification",             │
  │                                │     { conversationId,           │
  │                                │       senderId, preview },      │
  │                                │     exclude: A)                 │
  │                                │              │                  │
  │                                │◀─────────────┘                  │
  │                                │                                │
  │                                │── WS 推送 ───────────────────▶│
  │                                │   { type: "notification",       │
  │                                │     payload: { ... } }          │
  │                                │                                │
  │                                │                     UI 显示红点 + 预览
```

***

## 五、ConnectionManager 核心设计

```typescript
class ConnectionManager {
  // SSE 连接池: Map<conversationId, Set<FastifyReply>>
  private sseConnections

  // WS 连接池: Map<userId, Set<WebSocket>>
  private wsConnections

  // ─── SSE 操作 ───────────────────────────────
  addSSEConnection(convId, reply)       // 注册 SSE 连接
  removeSSEConnection(convId, reply)    // 移除 SSE 连接
  pushToConversation(convId, event, data)  // 向会话所有 SSE 客户端推送

  // ─── WS 操作 ────────────────────────────────
  addWSConnection(userId, socket)       // 注册 WS 连接
  removeWSConnection(userId, socket)    // 移除 WS 连接
  broadcastToConversation(ids, type, payload, excludeUserId?)  // 广播给指定用户
  broadcastToUser(userId, message)      // 推送给某个用户的所有设备
  getConnectedUserIds()                // 获取所有在线用户
}
```

### 为什么不需要 Redis？

当前阶段单实例部署，ConnectionManager 直接在内存中维护连接池。后续多实例时，需要用 Redis Pub/Sub 做跨节点广播：

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│ Server 1 │    │ Server 2 │    │ Server 3 │
│  CM内存   │    │  CM内存   │    │  CM内存   │
└────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │
     └───────────────┼───────────────┘
                     ▼
              ┌──────────────┐
              │  Redis Pub/Sub│
              └──────────────┘
```

***

## 六、完整时序图

```
用户客户端                           服务端                         Agent
  │                                  │                             │
  │══════════ 一、建立 SSE 连接 ═══════│                             │
  │── GET /sse/conv/stream?token= ──▶│                             │
  │◀── event: connected ────────────│                             │
  │                                  │                             │
  │══════════ 二、建立 WS 连接 ════════│                             │
  │── GET /ws?token= (Upgrade) ────▶│                             │
  │◀── WS 连接建立 ─────────────────│                             │
  │◀── status:update (online) ─────│                             │
  │                                  │                             │
  │══════════ 三、发消息 ═══════════════│                             │
  │── POST /messages/create ───────▶│                             │
  │   { content: "帮我写个排序" }     │                             │
  │◀── 201 { message } ────────────│                             │
  │                                  │                             │
  │◀── WS: notification ──────────│                             │
  │   (其他客户端收到新消息通知)       │                             │
  │                                  │                             │
  │══════════ 四、触发 Agent 执行 ═══════│                             │
  │── POST /messages/:id/execute ──▶│                             │
  │◀── 202 { status: "executing" } │                             │
  │                                  │                             │
  │                                  │── createAdapter(provider)  │
  │                                  │── execute(context) ──────▶│
  │                                  │                             │
  │══════════ 五、SSE 流式推送 ═════════│                             │
  │◀── SSE: chunk (text) ──────────│◀─── AsyncIterable<Chunk> ──│
  │   "我来为你写一个快速排序..."      │                             │
  │◀── SSE: chunk (code) ──────────│                             │
  │   "function quickSort(..."      │                             │
  │◀── SSE: artifact_status ──────│                             │
  │   { status: "building" }       │                             │
  │◀── SSE: chunk (text) ──────────│                             │
  │   "这个算法的时间复杂度是..."     │                             │
  │◀── SSE: done ─────────────────│◀─── 执行完成 ──────────────│
  │   { tokenUsage: { input, output }}                           │
  │                                  │                             │
  │══════════ 六、实时状态交互 ═════════│                             │
  │── WS: typing:start ───────────▶│                             │
  │   { conversationId: "..." }     │                             │
  │                                  │── WS: typing:indicator ──▶│
  │                                  │   (广播给会话其他成员)       │
  │                                  │                             │
  │── WS: ping ───────────────────▶│                             │
  │◀── WS: pong ──────────────────│                             │
  │                                  │                             │
  │══════════ 七、断线清理 ════════════│                             │
  │   客户端断开 WS                   │                             │
  │                                  │── removeWSConnection       │
  │                                  │── WS: status:update (offline)
  │                                  │   (广播给其他用户)           │
```

***

## 七、常见问题

### Q: 为什么 SSE 和 WebSocket 同时存在，不只用一种？

SSE 天然适合服务端 → 客户端的单向流式数据推送：
- 原生支持断线重连（浏览器 `EventSource`）
- 有标准的事件类型（`event:` 字段）
- 协议开销小

WebSocket 适合双向交互：
- typing 指示器需要客户端 → 服务端方向
- 心跳检测需要双向
- 在线状态广播需要服务端主动推

所以 SSE 管"内容"，WS 管"状态"，各司其职。

### Q: Token 为什么放在查询参数里？

SSE 和 WebSocket 在建立连接时无法设置自定义 HTTP Header。浏览器 `EventSource` API 和 WebSocket API 都只支持 URL。所以 token 通过 `?token=<JWT>` 传递，服务端用 `verifyQueryToken()` 验证。

### Q: 一个用户打开多个浏览器标签页，会有多个 WS 连接吗？

会。`ConnectionManager` 的 `wsConnections` 是 `Map<userId, Set<WebSocket>>`，同一个 userId 的多个连接全部保留。推送时遍历 Set，给所有设备都发。

### Q: SSE 断线了怎么办？

浏览器原生 `EventSource` 会自动重连。服务端不需要额外处理——客户端重连时会新建 SSE 连接，重新注册到 ConnectionManager。

### Q: 服务端如何知道某个 SSE/WS 客户端断开了？

- **SSE**: `request.raw.on("close")` 事件
- **WS**: `socket.on("close")` 事件

两个都在事件回调中调用 ConnectionManager 的 remove 方法清理资源。
