## ADDED Requirements

### Requirement: 消息内容支持 GFM Markdown 渲染
系统 SHALL 在聊天消息中渲染 GFM (GitHub Flavored Markdown) 格式内容，包括标题、粗体、斜体、列表、表格、链接、内联代码和代码块。

#### Scenario: 渲染粗体和斜体
- **WHEN** 消息内容包含 `**粗体**` 或 `*斜体*`
- **THEN** 内容以相应的粗体/斜体样式显示

#### Scenario: 渲染标题
- **WHEN** 消息内容包含 `# `、`## ` 等标题语法
- **THEN** 内容按对应级别的标题样式显示

#### Scenario: 渲染有序和无序列表
- **WHEN** 消息内容包含 `- ` 或 `1. ` 列表语法
- **THEN** 内容以列表形式显示

#### Scenario: 渲染表格
- **WHEN** 消息内容包含 GFM 表格语法
- **THEN** 内容以 HTML 表格形式显示

#### Scenario: 渲染内联代码
- **WHEN** 消息内容包含 `` `code` `` 语法
- **THEN** 内联代码以等宽字体和特殊背景色显示

#### Scenario: 渲染代码块
- **WHEN** 消息内容包含 fenced code block ```` ``` ````
- **THEN** 代码块使用 `CodeBlock` 组件渲染（带语法高亮和语言标签）

#### Scenario: 渲染链接
- **WHEN** 消息内容包含 `[text](url)` 语法
- **THEN** 链接以可点击形式显示，在新标签页打开

#### Scenario: 纯文本不受影响
- **WHEN** 消息内容不含 markdown 语法
- **THEN** 内容以纯文本形式显示

## MODIFIED Requirements

### Requirement: 消息气泡渲染
消息 SHALL 以气泡形式显示，按发送者类型区分样式和位置。

#### Scenario: 用户消息右对齐
- **WHEN** `senderType` 为 "user"
- **THEN** 消息显示为右对齐气泡，彩色背景，上方显示 "你" 标签

#### Scenario: Agent 消息左对齐
- **WHEN** `senderType` 为 "contact"
- **THEN** 消息显示为左对齐气泡，深色背景配左侧彩色强调线，上方显示 Agent 名称标签

#### Scenario: 系统消息居中
- **WHEN** `senderType` 为 "system"
- **THEN** 消息居中显示，灰色文字，小字号

#### Scenario: 消息内容渲染
- **WHEN** 消息包含 markdown 格式内容
- **THEN** 使用 `react-markdown` 渲染为格式化内容（代码块使用 `CodeBlock` 组件）
- **WHEN** 消息包含 diff 或 artifact
- **THEN** 分别使用 DiffCard、ArtifactCard 组件渲染
