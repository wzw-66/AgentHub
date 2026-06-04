## 1. Windows 命令行闪烁修复

- [x] 1.1 `claude.adapter.ts` 的 `spawn()` 调用中增加 `windowsHide: true`
- [x] 1.2 `opencode.adapter.ts` 的 `spawn()` 调用中增加 `windowsHide: true`

## 2. ToolCall → artifact 标记插入（服务端）

- [x] 2.1 实现 `detectArtifact()` 函数：双通道检测（文件扩展名优先 + 内容嗅探测回退），返回 `{ type, language }` 或 null
- [x] 2.2 文件扩展名通道：从 ToolCall input 的 `file`/`filename`/`path` 字段提取扩展名，映射到 artifact type（.html → web_preview, .java → code, .json → code 等）
- [x] 2.3 内容嗅探通道：无文件名时通过内容特征判断（`<html` → web_preview, `public class` → java, `#include` → c, `diff --git` → diff 等）
- [x] 2.4 实现 `extractArtifactContent()` 函数：从 ToolCall input 中提取展示内容
- [x] 2.5 实现 `insertArtifactMarker()` 函数：构造 `~~~artifact:type:title~~~` / `~~~artifact:end:type~~~` 标记对并插入 content
- [x] 2.6 在 `runAgentExecution` 和 `handleRegenerate`（messages.ts）中拦截 ToolCall chunk，调用 `processChunk()` 替换
- [x] 2.7 在 `SubTaskExecutor.execute()`（executor.ts）中拦截 ToolCall chunk，调用 `processChunk()` 替换

## 3. messageId 持久化修复

- [x] 3.1 修改 `onTaskCompleted` 回调签名：返回 `Promise<string | undefined>`
- [x] 3.2 `dispatcher.ts` 的 `dispatchAll` 中 await `onTaskCompleted` 拿到真实 messageId
- [x] 3.3 `done` SSE 事件中传入真实 messageId 而非空串
- [x] 3.4 `messages.ts` 的 `runOrchestration` 中 `onTaskCompleted` 返回 `saved.id`

## 4. 前端多流状态

- [x] 4.1 `chat-context.tsx`：`streamingMessage` 改为 `streamingMessages: Map<string, StreamingMessage>`
- [x] 4.2 `appendMessageChunk` 按 `agentId` 路由到对应 streaming message
- [x] 4.3 `finalizeMessage` 只 finalize 指定 agent 的流，不影响其他
- [x] 4.4 `ChatPanel.tsx`：遍历 `streamingMessages` 渲染多个独立气泡
- [x] 4.5 `ChatPanel.tsx`：每条 streaming 消息底部可渲染 artifact 卡片

## 5. 前端 artifact 标记渲染

- [x] 5.1 实现 `parseArtifactMarkers()`：将 content 按 `~~~artifact:type:title~~~` 分割为文本段和 artifact 段
- [x] 5.2 实现 `renderArtifactBlock()`：根据 type 渲染 iframe（web_preview）或文本卡片（document）
- [x] 5.3 在 `ChatPanel.tsx` 的 `MessageContent` 中集成标记解析渲染
- [x] 5.4 SSE chunk 到达时同步更新标记解析（new chunks 可能完成一个 artifact 块）

## 6. 验证

- [x] 6.0 编译检查通过（server lint 无新增错误，web typecheck 无新增错误）
- [ ] 6.1 启动 dev 环境，创建群聊 @ 两个 Agent，确认双方并行输出
- [ ] 6.2 Agent 产出 HTML 时确认标记插入 → iframe 渲染
- [ ] 6.3 刷新页面后确认消息和 artifact 卡片位置正确保留
- [ ] 6.4 Windows 上确认无命令行弹出
- [ ] 6.5 单聊模式回归测试：不受改动影响
