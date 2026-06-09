## Context

AgentHub 的 Agent 执行是纯单向的。当前架构中：
- **ClaudeAdapter** 用 `for await (const line of rl)` 消费 stdout，stdin 在 spawn 后立即关闭
- **AgentHarness** 消费 `AsyncIterable<Chunk>`，仅处理 Text/Code/ToolCall/Done/Error 类型
- **runAgentExecution** 在后台 fire-and-forget，无等待用户输入的机制

实验验证（2026-06-09）：
- 去掉 `--dangerously-skip-permissions` 后 `permissionMode` 变为 `"default"`，但沙箱自动拦截危险命令，不产生 stdin 阻塞
- **AskUserQuestion 工具可用**，发出标准 `tool_use` block，然后阻塞 stdin 等待文本输入
- **不加 `--input-format stream-json`** 时，写纯文本到 stdin 即可被 Claude 理解为用户回复
- 加 `--input-format stream-json` 会导致进程挂起（等初始 user 消息）

因此方案的约束是：**保持普通 stdin 文本模式，不要开启 `--input-format stream-json`**。

## Goals / Non-Goals

**Goals:**
- Agent 执行过程中，检测 `AskUserQuestion` 的 `tool_use`，暂停执行，推送给前端
- 前端展示交互 UI（按钮组/确认框/输入框），用户选择后回复给 Agent
- Agent 收到回复后继续执行，流式返回后续输出
- 支持超时和取消机制，防止 Agent 无限等待

**Non-Goals:**
- 不修改编排层（intent-analyzer、dispatcher、aggregator）— 交互仅在单 Agent 执行路径生效
- 不修改 `--input-format stream-json` 相关逻辑 — 保持普通 stdin 模式
- 不处理 `--dangerously-skip-permissions` 的 stdin 权限确认 — 当前模型配置下无此行为
- 暂不处理 CustomAdapter / OpenCodeAdapter 的交互（后续可扩展）

## Decisions

### Decision 1: 不在 Adapter 层处理交互，在 Harness 层处理

**选项 A（Harness 层）**：`AgentHarness.execute()` 的 `for await` 循环中检测 `ChunkType.ToolCall` 且 name 为 `AskUserQuestion` 时，不继续执行工具，而是抛出一个可暂停的信号给上层。

**选项 B（Adapter 层）**：在 `ClaudeAdapter.execute()` 中直接检测 AskUserQuestion，通过回调等待回复。

**选择：A**。理由是：
- Harness 已经有了多轮 tool call 处理逻辑（第 199-313 行），拦截 AskUserQuestion 自然融入
- Adapter 层应保持纯粹（只做 stdin/stdout 的解析转换），交互逻辑属于编排范畴
- 未来其他 adapter（Custom/OpenCode）也可以复用 Harness 层的交互机制

### Decision 2: 使用 Promise-based pending interaction，不改造 AsyncIterable

**问题**：`AsyncIterable<Chunk>` 是拉取流，一旦 `for await` 开始消费就一路到底，无法"暂停继续"。

**方案**：在 `runAgentExecution()` 函数中，遇到交互时：
1. 不 break for-await 循环
2. 通过 `ConnectionManager.createInteraction()` 创建一个 Promise
3. await 这个 Promise（会阻塞 for-await 的下一次迭代）
4. 用户回复后 Promise resolve
5. 将回复写入 Claude 的 stdin
6. 循环继续读取下一行

**为什么可行**:
- `runAgentExecution` 是在 `.catch()` 中 fire-and-forget 的，阻塞不会影响 HTTP 响应
- for-await 消费 stdout 时，Claude 在 AskUserQuestion 后阻塞 stdin，此时 stdout 无更多数据，循环自然"暂停"在 `await next line`
- 写入 stdin 后 Claude 继续输出，readline 继续产生行

### Decision 3: 交互数据走文本 stdin，不走 structured NDJSON

**理由**：实验验证 `--input-format stream-json` 会导致进程在启动时挂起。保持文本 stdin 更简单可靠。

Claude 发出 AskUserQuestion 后在 stdin 上等文本输入。我们写入用户的回复文本（如 "选第一个" 或 "Yes"），Claude 会将其视为下一轮对话的 user message，自动与 AskUserQuestion 关联。

**限制**：用户回复不能是 structured JSON。但 Claude 处理自然语言理解，文本形式完全足够。

### Decision 4: 新增 `ChunkType.Interactive` 作为 Chunk 类型，而非定义全新接口

**理由**：保持与现有 stream 管道兼容。现有的 `pushChunk()`、`processChunk()`、前端 `chat-context.tsx` 的 switch 语句都基于 `ChunkType`。新增交互类型后：
- 服务器端：`pushChunk()` 中新增 case，通过 ConnectionManager 推送到前端
- 前端：ChatContext 中新增 case，渲染交互 UI

### Decision 5: ConnectionManager 管理 pending interaction

```typescript
class ConnectionManager {
  private pendingInteractions = new Map<string, {
    resolve: (value: string) => void;
    reject: (err: Error) => void;
    prompt: string;
    options?: { label: string; description: string }[];
    timer: NodeJS.Timeout;
  }>();

  createInteraction(convId: string, data: InteractivePrompt): Promise<string> {
    // 推交互事件给前端
    this.pushToConversation(convId, "interactive", data);
    this.broadcastToConversation(this.getConnectedUserIds(), "interactive", data);
    // 返回 Promise，executor await 这个 Promise
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingInteractions.delete(convId);
        reject(new Error("Interaction timeout"));
      }, 120_000); // 2 分钟超时
      this.pendingInteractions.set(convId, { resolve, reject, prompt: data.prompt, options: data.options, timer });
    });
  }

  resolveInteraction(convId: string, response: string): boolean {
    const p = this.pendingInteractions.get(convId);
    if (!p) return false;
    clearTimeout(p.timer);
    p.resolve(response);
    this.pendingInteractions.delete(convId);
    return true;
  }
}
```

**超时设计**：120 秒。用户长时间不回复时，Promise reject 导致 for-await 循环抛异常，走 `.catch()` 流程推 `"error"` 事件给前端。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| Claude 在 AskUserQuestion 后长时间等待 stdin，后台进程挂起 | 120 秒超时 → reject Promise → 终止执行 |
| 用户回复写到 stdin 时 Claude 还没完成 tool_use 输出（竞态条件） | Claude 的行为是：发出完整 assistant message 后才阻塞 stdin。收到 tool_use 事件即可确保已阻塞 |
| `for await` 循环在 await interaction Promise 时被异常中断 | try-catch 包围 await，捕获后推 error 事件 |
| 多个交互同时触发（多 Agent 场景） | pendingInteractions Map 以 conversationId 为 key，同一 conversation 只有一个 pending interaction |
| 前端 WebSocket 断连后无法收到交互事件 | 备选 REST 端点 `POST /api/conversations/:id/interact/respond` |
| Agent 在交互超时 reject 后仍处于阻塞状态 | abort adapter 清理子进程 |
