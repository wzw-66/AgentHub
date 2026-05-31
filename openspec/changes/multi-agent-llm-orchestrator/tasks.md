## 1. 配置层

- [x] 1.1 在 `config/env.ts` 新增 LLM 配置项 (`apiKey`, `baseUrl`, `model`)，从 .env 读取 `API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`
- [x] 1.2 验证配置读取：添加 LLM 配置的单元测试

## 2. LLM 意图分析器

- [x] 2.1 在 `intent-analyzer.ts` 新增 `LLMIntentAnalyzer` 类，使用 `fetch` 调用 DeepSeek API（OpenAI 兼容格式）
- [x] 2.2 设计并实现 LLM prompt（system prompt 包含群成员列表 + 格式约束 + 规则说明）
- [x] 2.3 实现 `response_format: json_object` 和 JSON 解析
- [x] 2.4 实现 LLM 调用超时和错误处理（fallback 到所有群成员并行执行）
- [x] 2.5 实现 `analyze()` 方法，返回 `LLMIntentResult`（assignedAgents, instructions, order）
- [x] 2.6 重写 `decomposeMessage()`：调用 LLMIntentAnalyzer，将结果构建为 SubTask 列表
- [x] 2.7 保留 `buildLayers` 和拓扑排序，根据 order 设置 dependsOn 后调用
- [x] 2.8 添加 `LLMIntentAnalyzer` 的单元测试（mock fetch）

## 3. 群成员过滤修复

- [x] 3.1 修改 `runOrchestration`：使用 `getConversation` 获取 `contactIds`，再逐个 `getContact` 查询
- [x] 3.2 移除 `listContacts(ownerId)` 调用和模糊 `.includes()` 匹配逻辑
- [x] 3.3 移除 `messages.ts` 中的 `extractMentions` 函数（不再需要正则提取）

## 4. SSE 事件名统一

- [x] 4.1 修改 `dispatcher.ts` 的 `pushAgentChunk`：事件名从 `agent:${id}:chunk` 改为 `chunk`，data 中添加 agentId
- [x] 4.2 同理修改 done / artifact_status / error 事件名
- [x] 4.3 保持 `orchestrator:decomposition` / `orchestrator:task-status` / `orchestrator:aggregated` 事件名不变

## 5. Workspace 路径传递

- [x] 5.1 修改 `SubTaskExecutor.createAdapterForAgent`：增加 `cwd` 参数
- [x] 5.2 在 `execute()` 中查询 `conversation.workspacePath`，组装 `cwd` 传给 adapter
- [x] 5.3 引入 `getConversation` 依赖（从 `@agenthub/db` 导入）

## 6. 触发条件放宽

- [x] 6.1 修改 `handleCreate`：群聊消息总是尝试触发 orchestrator，不再要求 `mentions.length >= 2`
- [x] 6.2 移除 `runOrchestration` 中的 `mentionedAgents.length < 2` 提前返回
- [x] 6.3 orchestrator 判断无任务时（LLM 返回空 assignedAgents）静默结束

## 7. 清理

- [x] 7.1 移除 `intent-analyzer.ts` 中的 `extractMentions` / `resolveMentions` / `assignInstructions` 等规则函数（已由 LLM 替代）
- [x] 7.2 移除 `detectExecutionOrder` 和 `containsSequenceWord` 函数
- [x] 7.3 更新 `/opsx:explore` 对应的 orchestrator 测试文件
