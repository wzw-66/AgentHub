## Context

当前系统有两套工作目录逻辑：

1. **Agent 级别** — 创建 Contact (Agent) 时生成 `agent-workspace/{邮箱}/{Agent名}/` 目录，存入 `Contact.workspacePath`
2. **Conversation 级别** — 创建对话时生成 `agent-workspace/{邮箱}/conversations/{对话ID}/` 目录，存入 `Conversation.workspacePath`

运行时 cwd 解析优先级均为 `conversation.workspacePath` → `agent.workspacePath` → `undefined`。由于所有对话创建时都会设置 `workspacePath`，`agent.workspacePath` 的 fallback 逻辑永远不会被触发，Agent 级别的目录也从未被使用。

## Goals / Non-Goals

**Goals:**
- 移除 Agent 创建时的 workspace 目录生成和存储
- 移除所有运行时对 `agent.workspacePath` 的 fallback 读取
- 移除前端 Agent 创建工作区路径预览
- 删除对话时清理对应的磁盘工作目录

**Non-Goals:**
- 不修改 DB schema（保留 `Contact.workspacePath` 字段，向后兼容）
- 不修改 Conversation 级别的工作目录创建逻辑
- 不清理已有数据（已有 Agent 的 workspacePath 字段保留，只是不再读取）

## Decisions

| # | 决策 |  rationale |
|---|------|-----------|
| 1 | 只删运行时逻辑，不删 DB 字段 | 已有数据可能依赖该字段存在（虽然不会被读取），删字段需要 migration，风险大于收益 |
| 2 | `resolveWorkspace()` 去掉 `agent` 参数 | 不再需要 fallback，简化接口 |
| 3 | 前端 CreateAgentModal 移除工作区路径 | 路径不再生成，展示无意义 |
| 4 | 删除对话时 `rm` 对应的磁盘工作目录 | 避免遗留垃圾目录堆积，与 DB 删除保持同步 |

## Risks / Trade-offs

- **[低风险] 旧 Conversation 没有 workspacePath 的场景** → 如果将来有不存在 workspacePath 的旧对话（早期数据），cwd 会变成 `undefined`。这和当前的 fallback 行为不同（之前会 fallback 到 agent.workspacePath）。但这类旧数据概率极低，且 cwd 为 undefined 时适配器仍然正常工作（只是没有指定工作目录）。
- **[低风险] 删除目录时数据丢失** → 用户可能在 workspace 目录里存了重要文件。**Mitigation:** 先删除文件内容（`rm -rf` 目录内文件）而非直接删目录？保持简单——对话删除本身就意味着数据废弃，rm -rf 整个目录即可。
