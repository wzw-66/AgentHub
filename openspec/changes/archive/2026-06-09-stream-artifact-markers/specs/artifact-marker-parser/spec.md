## ADDED Requirements

### Requirement: 前端标记解析器
系统 SHALL 提供 `parseArtifactMarkers()` 函数，将字符串内容按 `~~~artifact` 标记分割为文本块和 artifact 块。

#### Scenario: 解析纯文本（无标记）
- **WHEN** 输入内容不包含任何 `~~~artifact` 标记
- **THEN** 返回单一文本块，内容为原始字符串

#### Scenario: 解析单个 artifact
- **WHEN** 输入为 `"说明\n~~~artifact:code:main.ts~~~\nconst x=1\n~~~artifact:end:code~~~\n结束"`
- **THEN** 返回三个块：`[{type:"text", content:"说明\n"}, {type:"code", title:"main.ts", content:"\nconst x=1\n"}, {type:"text", content:"\n结束"}]`

#### Scenario: 解析多个 artifact
- **WHEN** 输入包含多个连续的 `~~~artifact` 标记块
- **THEN** 正确分割所有块，保持顺序

#### Scenario: 未闭合的标记
- **WHEN** 输入包含 `~~~artifact:type:title~~~` 但缺少对应的 `~~~artifact:end:type~~~`
- **THEN** 整个未闭合的标记范围作为普通文本块处理

#### Scenario: 标记内容跨多行
- **WHEN** artifact 内容包含换行符
- **THEN** 正确解析到闭合标记为止，包含所有换行

### Requirement: 块级渲染调度
系统 SHALL 根据解析后的块类型，调度不同的 React 组件渲染。

#### Scenario: 文本块渲染
- **WHEN** 块类型为 `text`
- **THEN** 使用 `MarkdownRenderer` 组件渲染

#### Scenario: code 类型 artifact 渲染
- **WHEN** 块类型为 `code`
- **THEN** 使用 `CodeBlock` 组件渲染（语法高亮 + 文件标题）

#### Scenario: web_preview 类型 artifact 渲染
- **WHEN** 块类型为 `web_preview`
- **THEN** 使用 `<iframe sandbox="allow-scripts">` 渲染内容

#### Scenario: diff 类型 artifact 渲染
- **WHEN** 块类型为 `diff`
- **THEN** 使用 `DiffCard` 组件渲染

#### Scenario: document 类型 artifact 渲染
- **WHEN** 块类型为 `document`
- **THEN** 使用 `MarkdownRenderer` 组件渲染

#### Scenario: 未知类型 fallback
- **WHEN** 块类型无法识别
- **THEN** 降级为 `<pre>` 纯文本渲染

### Requirement: stream 兼容
解析器 SHALL 兼容流式积累后的完整消息内容解析。

#### Scenario: 完整消息解析
- **WHEN** SSE stream 完成、消息存入 state 后
- **THEN** 对完整 `message.content` 调用 `parseArtifactMarkers()` 进行渲染
