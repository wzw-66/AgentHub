## Why

当前项目需要应对赛题评审。经代码审计发现，后端已有大量完整逻辑（Pin/Regenerate/Credential/Market Publish 等），但前端未连接展示；同时部分赛题要求的关键功能（Diff/Preview/Artifact 卡片渲染、多 Agent 流式展示、产物预览）两端均未实现。需要在评审前补齐这些断点，确保功能完整度和用户体验流畅度。

## What Changes

**修复现有交互断点：**
- Sidebar 联系人药片点击使用 agent.id 而非 conversationId 的 bug
- Regenerate 按钮连接到后端 API
- Pin 按钮连接到后端 API
- Agent 详情页 "添加联系人" 参数错误
- **BREAKING**: Sidebar 与 chat-context 的交互逻辑修正

**补齐缺失渲染：**
- MessageContent 支持 Diff / Preview / Artifact 三种消息类型的富媒体渲染
- 复用 `@agenthub/ui` 包的 DiffCard、ArtifactCard 组件
- 多 Agent 群聊时同时展示多个 StreamingMessage

**补齐 UI 入口：**
- Sidebar 对话项增加置顶/归档/删除操作
- Agent 详情页增加"发布到市场"按钮
- 增加凭据管理页面（/credentials）
- 增加"我的发布"页面（/market/my-listings）
- 增加附件上传入口

**新增功能：**
- 产物内联预览（iframe 嵌入）
- 全屏预览/编辑器模式
- 图片/文件附件消息发送

## Capabilities

### New Capabilities
- `fix-broken-interactions`: 修复 Sidebar、Regenerate、Pin 等现有前端组件的连接断点
- `rich-message-rendering`: 渲染 Diff/Preview/Artifact 消息类型，支持多 Agent 流式并行展示
- `conversation-management-ui`: 对话列表的置顶/归档/删除操作
- `marketplace-publish-flow`: 从 Agent 详情页发布到市场、取消发布、我的发布列表
- `artifact-preview`: 产物内联 iframe 预览和全屏操作
- `credential-management-ui`: API 凭据管理页面
- `file-attachment`: 图片/文件附件上传与消息发送

### Modified Capabilities
- （无，现有 spec 无需修改）

## Impact

- **apps/web/components/**: ChatPanel.tsx（消息渲染、多 Agent 流式）、Sidebar.tsx（置顶/归档/删除）
- **apps/web/src/app/**: 新增 credentials 页面、market/my-listings 页面
- **apps/web/lib/**: chat-context.tsx（流式消息管理增强）
- **apps/server/src/routes/**: 无后端变更（现有 API 已支持全部需求）
- **packages/ui/**: DiffCard、ArtifactCard 已存在，无需修改
