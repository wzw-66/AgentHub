## 1. Shared: ChunkType.Interactive

- [x] 1.1 在 `packages/shared/src/enums/chunk.ts` 中新增 `Interactive = "interactive"` 枚举值
- [x] 1.2 更新 `Chunk` interface 的 metadata 类型注释，支持 `toolUseId`、`options`、`multiSelect` 等交互字段
- [x] 1.3 新增 `InteractiveChunkData` 类型定义（在 `packages/shared/src/types/chunk.ts`）：`{ type: "interactive"; content: string; metadata: { toolUseId: string; prompt: string; options?: { label: string; description: string }[]; multiSelect?: boolean } }`

## 2. Server: ConnectionManager pending interaction

- [x] 2.1 在 `apps/server/src/realtime/connection-manager.ts` 中新增 `PendingInteraction` 类型和 `pendingInteractions` Map
- [x] 2.2 实现 `createInteraction(convId, data): Promise<string>` 方法：创建 Promise，推交互事件到前端，设超时
- [x] 2.3 实现 `resolveInteraction(convId, response): boolean` 方法：resolve Promise，清除超时
- [x] 2.4 实现 `cancelInteraction(convId): boolean` 方法：reject Promise，清除超时

## 3. Server: WebSocket 入站消息

- [x] 3.1 在 `apps/server/src/realtime/types.ts` 的 `WSClientMessage` 中新增 `user:interact` 类型：`{ type: "user:interact"; payload: { conversationId: string; response: string } }`
- [x] 3.2 在 `apps/server/src/routes/ws.ts` 的 `wsHandlers` 中新增 `"user:interact"` handler：调用 `cm.resolveInteraction()`

## 4. Server: SSE/WS 事件类型

- [x] 4.1 在 `apps/server/src/realtime/types.ts` 中新增 `SSEInteractiveData` 类型：`{ type: "interactive"; toolUseId: string; prompt: string; options?: { label: string; description: string }[]; multiSelect?: boolean; agentId: string }`
- [x] 4.2 在 `WSServerMessage` 中新增对应的交互事件类型

## 5. Server: runAgentExecution 交互处理

- [x] 5.1 在 `apps/server/src/routes/messages.ts` 的 `runAgentExecution` 中，在 `for await (const chunk of harness.execute(context))` 循环内检测 `AskUserQuestion` 的 ToolCall
- [x] 5.2 检测到交互时：通过 `cm.createInteraction()` 创建挂起 Promise，await 用户回复
- [x] 5.3 用户回复后：将回复文本写入 `adapter` 的 stdin（通过 `ClaudeAdapter` 新增的 `writeStdin(text)` 方法）
- [x] 5.4 继续 for-await 循环，读取后续 stdout 输出
- [x] 5.5 处理超时异常：捕获 reject，推 error 事件，abort adapter
- [x] 5.6 在其他 ToolCall 进入时正常走现有处理路径（非 AskUserQuestion 的依然自动执行）

## 6. Agent-Core: ClaudeAdapter stdin 写入支持

- [x] 6.1 在 `packages/agent-core/src/adapters/claude.adapter.ts` 中删除 `this.process.stdin?.end()` 行
- [x] 6.2 新增 `writeStdin(text: string): void` 公开方法：写入文本到 `this.process.stdin`
- [x] 6.3 确保 stdin 写入在子进程退出时不会抛异常（添加错误处理）

## 7. Web: ChatContext 交互状态

- [x] 7.1 在 `apps/web/lib/chat-context.tsx` 中新增 `pendingInteraction` 状态：`{ prompt: string; options?: { label: string; description: string }[]; multiSelect?: boolean } | null`
- [x] 7.2 在 WebSocket 事件处理器中新增 `"interactive"` case：存储交互状态，触发 UI 渲染
- [x] 7.3 新增 `respondToInteraction(response: string): void` 方法：通过 WebSocket 发送 `user:interact` 消息到服务器
- [x] 7.4 新增 `cancelInteraction(): void` 方法：关闭交互卡片，终止执行

## 8. Web: ChatPanel 交互 UI

- [x] 8.1 在 `apps/web/components/ChatPanel.tsx` 中新增交互卡片区域（在消息列表和输入框之间）
- [x] 8.2 渲染带选项的按钮组（选项列表：每个选项渲染为按钮，点击后发送回复）
- [x] 8.3 渲染确认对话框模式（单问题无选项时：显示确认/取消按钮）
- [x] 8.4 渲染文本输入模式（允许用户自定义输入）
- [x] 8.5 渲染超时/错误状态
- [x] 8.6 处理交互取消：关闭卡片、终止执行

## 9. Server: REST 备选通道

- [x] 9.1 在 `apps/server/src/routes/messages.ts` 中新增 `POST /api/conversations/:id/interact/respond` 端点
- [x] 9.2 验证请求的 conversationId 和响应内容
- [x] 9.3 调用 `cm.resolveInteraction()` 恢复执行
