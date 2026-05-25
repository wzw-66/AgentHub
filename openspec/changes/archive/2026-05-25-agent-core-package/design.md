## Context

AgentHub 需要与多种 AI Agent 通信，涉及三种不同的调用方式：

| 调用方式 | 适用端 | 实现方式 | 谁执行 agent-core |
|----------|--------|---------|-----------------|
| **A. 本地 CLI** | Desktop (Electron)、Web (通过 Bridge Daemon) | 当前 Node.js 进程 spawn CLI | Electron 主进程 / Bridge Daemon |
| **B. 后端 CLI** | Web、Desktop、Mobile | 客户端 → API Server → spawn CLI | Backend Server |
| **C. 外部 API** | Web、Desktop | HTTP fetch 直接调用 LLM API | 浏览器或 Node.js |

`@agenthub/agent-core` 是 **Node.js 环境下的 Agent 执行引擎**。它不关心调用者是谁，只负责在当前进程中执行 CLI 子进程或 HTTP 请求。agent-core 运行在三个位置：

| 宿主 | 用途 | 所属模块 |
|------|------|---------|
| **Backend Server** | 服务端执行 CLI + 代理外部 API | api-server（模块 6） |
| **Desktop Electron** | 桌面端本地执行 CLI | desktop app |
| **Bridge Daemon** | 为 Web 浏览器提供本地 CLI 调用能力 | 远期独立模块 |

当前 `@agenthub/shared` 已在 `types/adapter.ts` 中定义了 `AgentAdapter` 接口契约，但尚无具体实现。

上游依赖已就绪：
- `@agenthub/shared` — `AgentAdapter`、`Chunk`、`AgentContext`、`HealthStatus` 等类型
- `@agenthub/db` — Agent 配置的持久化（provider、model、apiKey 等）

## Goals / Non-Goals

**Goals:**
- 实现 `AgentAdapter` 接口的三种适配器：ClaudeAdapter、OpenCodeAdapter、CustomAgentAdapter
- 统一的 CLI 子进程生命周期管理（spawn、stdin/stdout 流式读取、中止、清理）
- 统一的 NDJSON/SSE 事件流解析层，将三种不同来源的原始事件统一映射为 `Chunk` 类型
- `createAdapter` 工厂函数，支持按 `AgentProvider` 枚举创建对应适配器
- 每个适配器支持健康检查和 abort 中止操作
- 完整的单元测试套件，所有外部依赖（CLI 子进程、HTTP）均被 mock
- 包设计为 isomorphic：同一份代码可运行在 Backend Server 和 Desktop Electron 中

**Non-Goals:**
- 不实现远程调用适配器（RemoteAdapter）— 属于 api-server 模块（模块 6）
- 不实现 Bridge Daemon — 属于远期独立模块，本模块只提供 agent-core 执行引擎供其使用
- 不引入外部 SDK（如 `@anthropic-ai/sdk`）
- 不实现 Agent 的配置管理（由 db 层和上层模块负责）
- 不处理 Agent 的调度路由逻辑（由 orchestrator 模块负责）
- 不处理对话历史管理（由上层模块将 history 传入 AgentContext）

## 架构总览

```
                   ┌─────────────────────────────────────┐
                   │          @agenthub/shared            │
                   │  AgentAdapter (interface)            │
                   │  AgentContext / Chunk / HealthStatus │
                   │  AgentProvider (enum)                │
                   └──────────────┬──────────────────────┘
                                  │ implements
                   ┌──────────────▼──────────────────────┐
                   │      @agenthub/agent-core            │
                   │      (Node.js 执行引擎)              │
                   │                                     │
                   │  ┌─────────────────────────────────┐│
                   │  │       事件流解析层               ││
                   │  │ parseClaudeStreamJson()         ││
                   │  │ parseOpenCodeEvent()            ││
                   │  │ parseOpenAIStreamEvent()         ││
                   │  └──────────┬──────────────────────┘│
                   │             │                        │
                   │  ┌──────────▼──────────────────────┐│
                   │  │        createAdapter()          ││
                   │  │    (工厂函数, 按 provider 分发)  ││
                   │  └──────┬──────┬──────┬───────────┘│
                   │         │      │      │             │
                   │  ┌──────┴┐ ┌───┴───┐ ┌┴──────────┐ │
                   │  │Claude │ │Open  │ │Custom     │ │
                   │  │Adapter│ │Code  │ │Adapter    │ │
                   │  │       │ │Adptr │ │           │ │
                   │  │claude │ │open- │ │HTTP fetch │ │
                   │  │CLI    │ │code  │ │外部API    │ │
                   │  │spawn  │ │CLI   │ │           │ │
                   │  └───────┘ └──────┘ └───────────┘ │
                   └─────────────────────────────────────┘
                               │          │
              ┌────────────────┘          └──────────────┐
              │                                            │
    ┌─────────▼──────────┐  ┌──────────┐  ┌─────────────▼─────────┐
    │  Backend Server    │  │ Bridge   │  │  Desktop Electron     │
    │                    │  │ Daemon   │  │                       │
    │  api-server 模块   │  │ (远期)   │  │  IPC main process     │
    │  POST /api/agent/* │  │          │  │  → agent-core         │
    │  → agent-core      │  │ agent-   │  │  → 本地 CLI           │
    │  → 服务端 CLI      │  │ core     │  │                       │
    │                    │  │          │  │  Web 端也可通过        │
    │  Web/Mobile 客户端  │  │ 本地CLI  │  │  Bridge Daemon        │
    │  → 调用此 API      │  │          │  │  或直接请求后端       │
    └────────────────────┘  └──────────┘  └───────────────────────┘
```

## Decisions

### Decision 1: agent-core 仅负责本地执行，不包含远程调用逻辑

`@agenthub/agent-core` 只做一件事：**在当前 Node.js 进程中执行 Agent 调用**。它不区分"本地 CLI"还是"后端 CLI"——CLI 在哪台机器上，它就 spawn 哪台的 CLI。

远程调用（Web/Mobile 通过 API 调用后端）由两个独立组件处理：
- **api-server 模块**（模块 6）：将 agent-core 的执行能力暴露为 REST/WS 接口
- **客户端 RemoteAdapter**（模块 6 的一部分或独立 client 包）：实现 `AgentAdapter` 接口，通过 HTTP/WS 与后端通信

**Why**: 关注点分离。agent-core 保持纯粹的"执行引擎"职责，部署位置无关。远程通信是 api-server 层的职责。

### Decision 2: ClaudeAdapter 使用 `claude --output-format stream-json` 而非解析纯文本

`claude -p` 支持三种输出格式：`text`（默认纯文本）、`json`（结构化 JSON）、`stream-json`（NDJSON 事件流）。

选用 `stream-json`：
- 事件流中包含 `content_block_delta.text_delta`，实时逐 token 推送
- 原生区分 text/code/tool_call 等内容类型
- 事件包含 `session_id` 和 `usage` 元数据
- 支持 `--include-partial-messages`

启动命令：`claude --bare -p <prompt> --output-format stream-json --include-partial-messages --dangerously-skip-permissions`

**备选方案及原因**：
- ❌ 解析纯文本 stdout：无法区分内容类型，丢失结构化信息
- ❌ 使用 `@anthropic-ai/sdk`：引入额外依赖，且与 Claude Code CLI 能力重复

### Decision 3: OpenCodeAdapter 使用 `opencode run --format json` 而非 ACP 协议

OpenCode 提供两种非交互模式：
- `opencode run --format json`：单次执行，NDJSON 逐行输出到 stdout
- `opencode acp`：持久子进程，JSON-RPC 2.0 双向 stdio

选用 `run --format json`：
- 语义简单：生成子进程 → 读取 stdout → 进程退出，无需维护连接状态
- 每个事件包含完整文本（非 delta），解析成本低
- 事件类型明确（`text`、`tool_use`、`step_finish`、`error`），映射 Chunk 自然

**备选方案及原因**：
- ❌ ACP 协议：需要实现 JSON-RPC 2.0 客户端，进程常驻消耗资源。适合 IDE 集成，不适合服务端批量调用。

### Decision 4: CustomAgentAdapter 默认兼容 OpenAI Chat Completions API

OpenAI 格式是 LLM 领域事实标准，被 Ollama、Together AI、Groq、vLLM 等广泛兼容。

**跨端注意事项**：
- 在 **Desktop Electron** 中：直接从 Node.js 进程发起 HTTP fetch
- 在 **Backend Server** 中：同样从 Node.js 进程发起 HTTP fetch（可附加 API key 管理、用量审计）
- 在 **Web 浏览器** 中：可以直接从浏览器 fetch（如果 CORS 允许），也可以通过后端代理
- 本模块只实现 Node.js 环境的 HTTP 调用，浏览器端调用由 Web 应用自行处理

### Decision 5: 统一事件流解析层

三种 Adapter 的事件流格式各不相同，但核心模式一致：逐行读取 → 解析为结构化数据 → 映射为 Chunk。

```
Claude stream-json:  stream_event.delta.text_delta → Chunk{type: Text}
OpenCode NDJSON:     type:text + content            → Chunk{type: Text}
Custom SSE:          data: choices[0].delta.content  → Chunk{type: Text}
```

设计三个独立解析函数 + 一个统一入口，便于单元测试和未来扩展。解析层不依赖 Node.js 特有 API，可在浏览器中复用（供未来 RemoteAdapter 使用）。

### Decision 6: 子进程中止使用 SIGTERM → 5s 宽限 → SIGKILL 二级策略

- 第一级：`SIGTERM` 给进程优雅退出的机会
- 第二级：5 秒后 `SIGKILL` 强制终止，防止僵尸进程导致资源泄漏

## 各调用方式的端到端链路

```
场景 A：用户本地 CLI（Desktop Electron）
────────────────────────────────────────
Electron 渲染进程 → IPC → 主进程
  → ClaudeAdapter.execute(context)
    → spawn("claude", ["-p", ...])
      → stdout stream → Chunk
    → 进程退出
  → IPC → 渲染进程

场景 A2：用户本地 CLI（Web 浏览器 → Bridge Daemon）
────────────────────────────────────────
Web 浏览器 → HTTP/WS → Bridge Daemon（本地 localhost）
  → ClaudeAdapter.execute(context)
    → spawn("claude", ["-p", ...])
      → stdout stream → Chunk
    → 进程退出
  → HTTP/WS → Web 浏览器
注: Bridge Daemon 是远期独立模块，agent-core 提供执行能力

场景 B：后端 CLI（Web / Desktop / Mobile）
────────────────────────────────────────
客户端 → WebSocket / HTTP → API Server
  → POST /api/agents/execute
    → ClaudeAdapter.execute(context)
      → spawn("claude", ["-p", ...])
        → stdout stream → Chunk
      → 进程退出
    → HTTP 200 / WebSocket push
  → 客户端接收 Chunk 流

场景 C：外部 API（Web / Desktop）
────────────────────────────────────────
Desktop: Electron 主进程 / Bridge Daemon
  → CustomAdapter.execute(context)
    → fetch("https://api.openai.com/...")
      → SSE stream → Chunk
    → 完成

Web: 浏览器
  → fetch("https://api.openai.com/...")
  → 直接解析 SSE（不使用 agent-core）
```

## Risks / Trade-offs

- [Claude Code CLI 需要预先安装] → 健康检查通过 `claude --version` 预先验证
- [OpenCode CLI 命令可能有差异] → `cliPath`、`args` 参数可配置
- [长 prompt 超出命令行长度] → 通过 stdin pipe 传递 prompt，避免 shell 转义和长度限制
- [子进程执行时间过长] → 每个 Adapter 支持超时配置，超时后 abort
- [stream-json 输出可能包含非 JSON 行] → 告警日志行跳过不解析，容错处理
- [agent-core 在浏览器中不可用] → 这是刻意设计。浏览器端通过 API Server 或直接 HTTP 调用外部 API
