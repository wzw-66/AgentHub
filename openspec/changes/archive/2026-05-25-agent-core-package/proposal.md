## Why

AgentHub 产品需要在三种场景下调用 AI Agent：

```
场景 A：调用用户本地的 CLI    → Web/Desktop 端
场景 B：调用项目后端的 CLI    → Web/Desktop/Mobile 端
场景 C：调用外部 LLM API     → Web/Desktop 端
```

当前缺乏统一的 Agent 调用抽象层。如果每个场景各写一套，会导致重复代码、难以扩展新 Agent 类型。需要一个核心执行引擎 `@agenthub/agent-core`，在 Node.js 环境中统一管理 CLI 子进程和 HTTP 调用。

## 产品拓扑（三种调用方式）

```
┌──────────────────────────────────────────────────────────────────────┐
│                        AgentHub 产品架构                              │
│                                                                      │
│   ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────────────┐ │
│   │ Desktop  │  │ Web          │  │ Mobile   │  │ Backend        │ │
│   │(Electron)│  │(Browser)     │  │(RN)      │  │ Server         │ │
│   │          │  │              │  │          │  │                │ │
│   │Node.js ✓ │  │  Node.js ✗  │  │No Node   │  │ Node.js ✓      │ │
│   │          │  │              │  │          │  │                │ │
│   │┌───────┐ │  │ ┌─────────┐ │  │          │  │ ┌────────────┐ │ │
│   ││agent  │ │  │ │Bridge   │ │  │          │  │ │ agent-core │ │ │
│   ││core   │ │  │ │Daemon   │ │  │          │  │ │  execution │ │ │
│   │└──┬────┘ │  │ │agent-   │ │  │          │  │ │  engine    │ │ │
│   │   │      │  │ │core     │ │  │          │  │ └─────┬──────┘ │ │
│   │   │ A    │  │ └──┬──────┘ │  │          │  │       │ B      │ │
│   │┌──▼────┐ │  │   │ A      │  │          │  │ ┌─────▼──────┐ │ │
│   ││claude │ │  │┌──▼────┐   │  │          │  │ │ claude     │ │ │
│   ││open-  │ │  ││claude │   │  │          │  │ │ opencode   │ │ │
│   ││code   │ │  ││open-  │   │  │          │  │ │ (服务端)   │ │ │
│   │└───────┘ │  ││code   │   │  │          │  │ └────────────┘ │ │
│   └────┬─────┘  │└───────┘   │  │          │  └───────┬────────┘ │
│        │        └─────┬──────┘  └─────┬────┘          │          │
│        │              │               │               │          │
│        │   C          │  B            │  B            │          │
│   ┌────▼──────────────▼───────────────▼───────────────▼──────┐   │
│   │               外部 API（OpenAI / 其他 LLM）                │   │
│   └───────────────────────────────────────────────────────────┘   │
│                                                                      │
│   调用方式标记：                                                      │
│   A = 本地 CLI 调用  B = 后端 CLI 调用  C = 外部 API 调用            │
└──────────────────────────────────────────────────────────────────────┘
```

**关键分层原则：**
- `@agenthub/agent-core` 是 **Node.js 执行引擎**，只负责在当前环境中 spawn CLI 或发起 HTTP 请求
- 它运行在三个位置：**Backend Server**、**Desktop Electron**、**本地 Bridge Daemon**
- **Bridge Daemon** — 用户本地的轻量常驻服务，为 Web 浏览器提供本地 CLI 调用能力（后续模块实现）
- 后端通过 **API Server**（模块 6）将 agent-core 的执行能力暴露为 REST/WS 接口，供 Web/Mobile 调用
- 客户端侧的远程调用适配器（`RemoteAdapter`）在 API Server 模块中实现

## What Changes

- 创建 `packages/agent-core/` 包，Node.js 环境的 Agent 执行引擎
- `ClaudeAdapter` — 通过 `claude --output-format stream-json` 子进程调用 Claude Code CLI
- `OpenCodeAdapter` — 通过 `opencode run --format json` 子进程调用 OpenCode CLI
- `CustomAgentAdapter` — 通过 HTTP fetch 调用用户配置的 LLM 端点（兼容 OpenAI 格式）
- `createAdapter` 工厂函数，按 `AgentProvider` 枚举创建对应适配器
- Chunk 事件流标准化解析层，统一处理三种来源的 NDJSON/SSE 事件
- 所有适配器支持健康检查和 abort 中止操作

## Capabilities

### New Capabilities

- `agent-core-package`: `@agenthub/agent-core` 包 — Node.js 环境下的 Agent 执行引擎，包含三种 CLI/HTTP 适配器实现、工厂函数和事件流解析工具

### Modified Capabilities

<!-- No existing capabilities to modify. -->

## Impact

- 新增 `packages/agent-core/` 目录，约 15 个源文件
- 依赖: `@agenthub/shared: workspace:*`（纯类型包，零运行时依赖）
- 无外部 SDK 依赖，所有通信通过 CLI 子进程或标准 HTTP
- 本模块只实现执行引擎；不涉及以下后续模块：
  - **api-server 模块**（模块 6）：后端 Agent Execution API + 客户端 RemoteAdapter
  - **Bridge Daemon 模块**（远期）：本地常驻服务，使 Web 浏览器可调用本地 CLI
