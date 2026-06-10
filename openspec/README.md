# OpenSpec — Change Management

OpenSpec 是本项目的变更管理系统，采用 spec-driven 工作流来追踪所有功能开发与架构改造。

## Directory Structure

```
openspec/
├── config.yaml              # 项目配置（schema 版本、技术栈上下文等）
├── changes/                 # 所有变更（active + archive）
│   ├── <change-name>/       #   活跃变更（进行中）
│   │   ├── .openspec.yaml   #     元数据（创建时间、schema 版本）
│   │   ├── proposal.md      #     提案——为什么改、改什么
│   │   ├── design.md        #     设计方案——架构、数据流、接口
│   │   ├── tasks.md         #     任务列表——具体实现步骤
│   │   └── specs/           #     详细规格说明书
│   │       └── <spec-name>/
│   │           └── spec.md
│   └── archive/             # 已归档变更（已完成或废弃）
│       └── <yyyy-mm-dd>-<name>/
└── specs/                   # 提取的通用规格文件（供参考）
```

## Active Changes

| Change | Created | Description |
|--------|---------|-------------|
| `agent-interactive-mode` | 2026-06-09 | Agent 执行过程中反问、选项、确认的双向交互能力 |
| `agent-market-publish-import` | — | Agent 市场发布与跨实例导入导出 |
| `modular-project-decomposition` | — | 整体项目模块化拆分（初始架构） |
| `multi-agent-llm-orchestrator` | — | LLM 驱动的多 Agent 编排器（意图分析、任务图、分发执行） |
| `parallel-agent-output` | — | 多 Agent 并行输出的流式合并与内联产物渲染 |
| `sidebar-multi-view-redesign` | — | 侧边栏多视图重构（对话列表、Agent 管理、市场等） |

## Archived Changes

归档变更按日期组织，涵盖从 monorepo 搭建到各功能模块的完整开发历史：

| Date Range | Changes |
|------------|---------|
| 2026-05-23 — 2026-05-27 | 基础设施搭建：monorepo、shared types、database、Prisma ORM、Fastify API server、realtime (SSE/WS)、UI 组件库、Chat UI、Orchestrator、Agent market |
| 2026-05-30 | 架构修正：Agent-Contact 模型合并、workspace path 解析修复 |
| 2026-06-02 | UI 增强与修复：聊天消息渲染、对齐、消息编辑、Agent 创建、会话管理 |
| 2026-06-08 | 大规模功能完善：群聊、埋点交互修复、死代码清理、消息防重复、聊天气泡优化 |
| 2026-06-09 | 流产物标记解析与管线 |

## Change Lifecycle

1. **Proposal** — 明确 Why（为什么改）和 What（改什么），生成 `proposal.md`
2. **Design** — 架构设计、数据流、接口定义，生成 `design.md`
3. **Spec** — 每个子模块的详细规格说明，放在 `specs/<spec-name>/spec.md`
4. **Tasks** — 分解为可执行的实现步骤，生成 `tasks.md`
5. **Implementation** — 按 tasks.md 逐项实现
6. **Archive** — 完成后移至 `archive/` 目录

## Convention

- 变更名称使用 `kebab-case`
- 归档名称前缀日期 `yyyy-mm-dd-`
- 每个变更至少包含 `proposal.md` + `design.md` + `tasks.md`
- spec-driven schema 由 `config.yaml` 统一管理
