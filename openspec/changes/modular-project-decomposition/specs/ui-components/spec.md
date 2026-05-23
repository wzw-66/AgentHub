## 新增需求

### 需求：MessageBubble 组件
`ui` 包应提供一个 `MessageBubble` 组件，根据发送者类型渲染消息。

#### 场景：渲染文本内容
- **当** `MessageBubble` 接收到文本内容
- **则** 应以正确的样式渲染文本

#### 场景：支持不同的发送者样式
- **当** `senderType` 为 "user"
- **则** 气泡应样式化为用户消息（左对齐）
- **当** `senderType` 为 "contact"
- **则** 气泡应样式化为 Agent 消息（右对齐）

### 需求：CodeBlock 组件
`ui` 包应提供一个 `CodeBlock` 组件，支持语法高亮和复制功能。

#### 场景：代码渲染带语法高亮
- **当** `CodeBlock` 接收到带有语言提示的代码内容
- **则** 应以语法高亮方式渲染

#### 场景：复制按钮存在
- **当** `CodeBlock` 渲染完成
- **则** 应显示复制到剪贴板的按钮

### 需求：DiffCard 组件
`ui` 包应提供一个 `DiffCard` 组件，用于渲染代码差异。

#### 场景：差异内容内联渲染
- **当** `DiffCard` 接收差异内容
- **则** 新增内容以绿色显示，删除内容以红色显示

### 需求：PreviewCard 组件
`ui` 包应提供一个 `PreviewCard` 组件，用于渲染产物预览。

#### 场景：预览在 iframe 中渲染
- **当** `PreviewCard` 接收到 URL
- **则** 应在 iframe 缩略图中渲染内容

### 需求：ArtifactCard 组件
`ui` 包应提供一个 `ArtifactCard` 组件，显示产物构建状态。

#### 场景：构建中状态
- **当** 产物的 `status` 为 "building"
- **则** 应显示加载指示器

#### 场景：已完成状态
- **当** 产物的 `status` 为 "done"
- **则** 应显示内容

#### 场景：失败状态
- **当** 产物的 `status` 为 "failed"
- **则** 应显示错误消息

### 需求：AgentAvatar 组件
`ui` 包应提供一个 `AgentAvatar` 组件，用于显示 Agent 头像。

#### 场景：带兜底显示渲染
- **当** `AgentAvatar` 没有图片 URL
- **则** 应显示带颜色的首字母兜底
