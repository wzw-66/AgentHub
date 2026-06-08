## Context

经代码审计，后端（Fastify API）已有完整逻辑支持 Pin/Regenerate/Credential/Market Publish/Conversation Archive 等操作，但前端（Next.js）未连接这些功能。同时 Diff/Preview/Artifact 消息类型在 DB 和 shared 包中已定义，前端 ChatPanel 未渲染。

这属于"后端就绪、前端断连"的情况——无需修改后端代码，纯前端工作。

## Goals / Non-Goals

**Goals:**
- 连接所有未使用的前端按钮到后端 API
- 渲染所有已定义的消息类型（Diff/Preview/Artifact）
- 支持多 Agent 并行流式输出展示
- 补齐对话管理（置顶/归档/删除）UI 入口
- 补齐 Marketplace 发布流程 UI
- 增加凭据管理页面
- 增加附件上传功能
- 增加产物内联预览

**Non-Goals:**
- 不修改后端 API 或 DB schema
- 不修改 packages/shared 或 packages/db
- 不修改 packages/agent-core
- 不新增后端路由（已有 API 全覆盖）
- P2 功能（Desktop/Mobile 端、完整部署工作流）暂不包含

## Decisions

### D1: 多 Agent 流式消息展示策略
- **方案**: 保持 `streamingMessages` Map 结构，在 ChatPanel 中遍历 Map.values() 同时渲染所有 agent 的流式消息
- **理由**: 现有 Map<string, StreamingMessage> 结构已支持多 key，只是 ChatPanel 只取了第一个值
- **替代方案**: 不使用 Map 而使用数组 → 否决，Map 更自然支持 agentId → message 的映射
- **风险**: 群聊消息过多时渲染开销 → 通过 `max-width` 和虚拟化控制

### D2: Conversation 管理 UI 位置
- **方案**: Sidebar 每个对话项的 hover 状态下弹出操作菜单（Pin / Archive / Delete）
- **理由**: 不破坏现有布局，用户习惯类 IM 的右键/悬停操作
- **替代方案**: 长按弹出菜单 → 否决，Web 端 hover 更自然；额外设置页面 → 否决，操作路径太长

### D3: 附件上传实现
- **方案**: 输入框左侧添加附件按钮，调起文件选择器，选中后通过 `FormData` 或 Base64 编码后作为消息发送
- **理由**: 最简单实现，不引入新的存储依赖
- **注意**: 附件存为 `MessageType.Text` + Markdown 图片链接，或新增后端文件上传端点（可选）

### D4: 产物预览
- **方案**: 使用 iframe srcDoc 或 blob URL 渲染产物 HTML 内容，右侧面板和全屏模态框两种模式
- **理由**: 不依赖外部服务，零成本实现内联预览
- **替代方案**: 使用 sandbox 属性增强安全性

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 多 Agent 流式消息过多导致性能下降 | 限制 streamingMessages Map 大小（最多 10 个并发流） |
| 附件上传导致请求体过大 | 限制文件大小（前端 5MB，后端 nginx 10MB），或使用 presigned URL |
| iframe 预览 XSS 风险 | 使用 sandbox 属性限制脚本执行 |
| 修改 ChatPanel 渲染逻辑可能影响现有单聊 | 保持向后兼容：单聊行为不变，仅群聊展示多流 |
