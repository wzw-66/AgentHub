# AgentHub 项目概述

以下内容适用于简历项目经验描述，按照指定格式组织。

---

AgentHub 2026年05月 - 2026年06月

项目介绍：AgentHub 是以 IM 群聊为核心的多智能体协作平台，用户像使用微信/飞书一样将多个 AI 智能体（Claude、OpenCode 等）拉入群组协同工作，而非与单一机器人对话。内置 DAG 编排引擎通过统一适配层将意图自动分解为子任务，并行分配给最适智能体执行并汇聚结果。自研执行引擎不依赖第三方框架，配合跨会话长期记忆与双模沙箱（本地/Docker），实现知识复用与安全隔离，解决多智能体任务拆解、调度编排与结果聚合等核心工程问题。

技术栈：TypeScript、Node.js、Fastify、Next.js 14、Prisma、PostgreSQL、SQLite (FTS5)、Turborepo、WebSocket、SSE、Tailwind CSS

---

1. **多智能体 DAG 编排引擎**：基于有向无环图（DAG）与 Kahn 拓扑排序实现多智能体任务调度。LLM 驱动意图分析模块（默认 DeepSeek）自动将用户消息分解为子任务并构建依赖图，支持同层子任务 `Promise.allSettled` 并发执行与跨层结果注入。内置循环检测与失败依赖跳过机制，保障复杂工作流的可靠并行编排。

2. **统一 Agent 适配层与交互式执行**：设计插件式 `AgentAdapter` 接口（抽象策略模式），统一封装 Claude CLI、OpenCode CLI 及 OpenAI 兼容 HTTP API 三种执行后端，通过工厂函数按 `AgentProvider` 枚举路由。适配器层支持 `AsyncIterable<Chunk>` 流式输出与 `writeStdin()` 交互式反问，实现智能体与用户的双向实时对话（含选项选择、确认等交互模式）。

3. **双通道实时通信架构**：SSE 流式推送智能体输出与编排器状态事件，WebSocket 处理在线状态、打字指示及交互响应。`ConnectionManager` 单例统一管理双通道连接与适配器生命周期，支持断连自动中止。

4. **自研 Agent Harness 多轮执行引擎**：不依赖 LangChain/LangGraph 等第三方框架，完全自研 Agent 执行循环。内置可插拔中间件管道实现上下文压缩与状态共享、统一工具注册中心支撑 30+ 种跨 CLI 工具别名映射、全生命周期事件系统支撑前端实时渲染，形成完整的 Agent 执行基础设施。

5. **"Agent = Contact" 统一数据模型**：摒弃独立的 Agent 表，以 `Contact` 模型的 `provider` 字段（Claude/OpenCode/Custom）承载智能体。Prisma 8 模型 6 枚举，关键设计包括 `PublishedAgent` 独立市场表、`Message` 自引用 `parentId` 实现消息树、游标分页（消息列表）与偏移分页（会话列表）、仓库模式实现可选 `PrismaClient` 参数实现测试 DI。

6. **面向操作的 API 命名与 JWT 双令牌认证**：API 路径显式使用动词后缀（`/messages/create`、`/messages/list`、`/messages/detail`），不依赖 HTTP Method 表达语义。认证层基于 jsonwebtoken 实现访问令牌（15min）+ 刷新令牌（7d）双令牌体系，刷新令牌存于 `RefreshToken` 表并支持吊销轮转，密码经 bcryptjs（10 轮盐）哈希存储，SSE/WS 通过查询参数令牌认证。

7. **LLM 驱动跨会话长期记忆系统**：基于 SQLite + FTS5 全文索引构建持久化记忆库。Agent 执行完成后异步触发 LLM 自动提取五类结构化记忆（事实/偏好/决策/错误/上下文），按 1-10 重要性评分并建立全文索引，后续编排器通过 FTS5 检索相关记忆注入 Agent 上下文，实现跨会话知识自动沉淀与复用。

8. **双模可插拔沙箱架构**：设计 `SandboxProvider` 工厂接口 + 全局单例模式，提供本地沙箱（路径白名单 + 越界检测 + 超时保护）与 Docker 沙箱（容器级隔离 + 资源限制 + 空闲自动回收）两种后端，通过配置文件反射驱动，开发/生产环境可一键切换而无需修改代码。

---

## 架构亮点

- **Monorepo 治理**：Turborepo + pnpm workspace 管理 6 个包（shared/db/agent-core/ui/server/web），tsup 双格式输出（ESM + CJS），严格的依赖顺序构建
- **CSS 自定义属性主题系统**：基于 `theme-accent`/`theme-surface` 等 CSS 变量的亮暗主题切换，配合 DM Sans/DM Mono 字体系统与细腻的关键帧动画
- **双通道工件检测**：通过文件扩展名映射（~50 种）与内容嗅探双重机制自动检测代码工件，以 `~~~artifact:type:title~~~` 标记嵌入流供前端渲染
- **国际化**：React Context 驱动的 zh/en 翻译系统，LanguageSwitcher 组件
