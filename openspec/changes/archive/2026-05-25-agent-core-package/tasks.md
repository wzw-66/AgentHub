## 1. 包脚手架搭建

- [x] 1.1 创建 `packages/agent-core/package.json`，name 为 `@agenthub/agent-core`，声明 `@agenthub/shared: workspace:*` 依赖，标记 `"type": "module"`
- [x] 1.2 创建 `packages/agent-core/tsconfig.json`，继承 `tooling/tsconfig/node.json`
- [x] 1.3 创建 `packages/agent-core/tsup.config.ts`，配置 ESM + CJS 双输出和 dts 生成
- [x] 1.4 创建 `packages/agent-core/vitest.config.ts`
- [x] 1.5 创建 `packages/agent-core/src/index.ts` 统一导出入口

## 2. Chunk 数据块解析工具

- [x] 2.1 实现 `createChunk(type, content, metadata?)` 工厂函数，自动生成 ISO timestamp
- [x] 2.2 实现 `isDoneChunk(chunk)` 判断函数
- [x] 2.3 实现 `parseClaudeStreamJson(line)` 解析 Claude stream-json 事件行
- [x] 2.4 实现 `parseOpenCodeEvent(line)` 解析 OpenCode NDJSON 事件行
- [x] 2.5 实现 `parseOpenAIStreamEvent(line)` 解析 OpenAI SSE data: 行
- [x] 2.6 实现 `parseEventLine(provider, line)` 统一入口，按 provider 分发到对应解析器
- [x] 2.7 编写 Chunk 解析工具的单元测试
- [x] 2.8 确认解析器不依赖 Node.js 特有 API（可在浏览器中复用，供未来 RemoteAdapter 使用）

## 3. ClaudeAdapter 实现

- [x] 3.1 实现 `ClaudeAdapter` 类，通过 `spawn("claude", ["--bare", "-p", prompt, "--output-format", "stream-json", "--include-partial-messages", "--dangerously-skip-permissions"])` 启动子进程
- [x] 3.2 `execute()` 通过 stdin pipe 传递 context（历史消息），逐行读取 stdout 并调用 `parseClaudeStreamJson` 解析为 Chunk 后 yield
- [x] 3.3 `abort()` 发送 `SIGTERM`，5 秒宽限后 `SIGKILL`
- [x] 3.4 `healthCheck()` 执行 `claude --version`，检查退出码和延迟
- [x] 3.5 编写 ClaudeAdapter 单元测试（mock child_process.spawn）

## 4. OpenCodeAdapter 实现

- [x] 4.1 实现 `OpenCodeAdapter` 类，通过 `spawn("opencode", ["run", "--format", "json", "-m", model, prompt])` 启动子进程
- [x] 4.2 `execute()` 逐行读取 stdout 并调用 `parseOpenCodeEvent` 解析为 Chunk 后 yield
- [x] 4.3 `abort()` 发送 `SIGTERM`，5 秒宽限后 `SIGKILL`
- [x] 4.4 `healthCheck()` 执行 `opencode --version`，检查退出码和延迟
- [x] 4.5 支持可配置的 `cliPath`、`args`、`timeout` 参数
- [x] 4.6 编写 OpenCodeAdapter 单元测试（mock child_process.spawn）

## 5. CustomAgentAdapter 实现

- [x] 5.1 实现 `CustomAgentAdapter` 类，接收 `endpoint`、`apiKey`、`model`、`timeout` 配置
- [x] 5.2 `execute()` 构建 OpenAI Chat Completions 格式请求体（含 messages、stream: true），通过 `fetch()` 发送 POST 请求
- [x] 5.3 使用 SSE `data:` 行解析器逐行读取响应体，调用 `parseOpenAIStreamEvent` 解析为 Chunk 后 yield
- [x] 5.4 `abort()` 通过 `AbortController` 取消 HTTP 请求
- [x] 5.5 `healthCheck()` 发送 `max_tokens: 1` 的轻量请求验证端点可用性
- [x] 5.6 编写 CustomAgentAdapter 单元测试（mock fetch/HTTP）

## 6. 工厂函数和验证

- [x] 6.1 实现 `createAdapter(provider, config)` 工厂函数，switch 匹配 `AgentProvider` 返回对应适配器
- [x] 6.2 不支持的 provider 抛出明确错误
- [x] 6.3 编写工厂函数单元测试
- [x] 6.4 验证 `pnpm build` 编译通过
- [x] 6.5 验证 `pnpm test` 所有测试通过
