## ADDED Requirements

### Requirement: ToolCall 自动 artifact 检测
系统 SHALL 在 Agent 执行流中调用 `processChunk()`，自动检测 ToolCall chunk 是否包含可渲染的 artifact。

#### Scenario: ToolCall 含文件写入
- **WHEN** chunk 类型为 ToolCall，内容含 `{name:"write_file", input:{path:"index.html", content:"<html>..."}}`
- **THEN** `processChunk()` 返回类型为 Text 的 chunk，内容包含 `~~~artifact:web_preview:index.html~~~` 标记

#### Scenario: ToolCall 不含文件
- **WHEN** chunk 类型为 ToolCall 但 input 不匹配任何 artifact 特征
- **THEN** `processChunk()` 返回原始 chunk，不做任何修改

#### Scenario: 非 ToolCall chunk 透传
- **WHEN** chunk 类型为 Text、Code、Error、Done
- **THEN** `processChunk()` 返回原始 chunk

#### Scenario: finalResponse 累积包含标记
- **WHEN** `processChunk()` 返回的 Text chunk 含标记内容
- **THEN** `finalResponse` 正常累积，标记随 content 一起存入 DB

### Requirement: ChunkType.Artifact 移除
系统 SHALL 移除 `ChunkType.Artifact` 枚举值，相关推送代码同步清理。

#### Scenario: 枚举值移除
- **WHEN** 项目编译
- **THEN** `packages/shared/src/enums/chunk.ts` 中不再包含 `Artifact = "artifact"`

#### Scenario: artifact_status 事件清理
- **WHEN** `pushChunk()` 处理消息
- **THEN** 不再有 `case ChunkType.Artifact` 分支，`artifact_status` 事件不再由此处触发

#### Scenario: 引用清理
- **WHEN** 搜索整个项目对 `ChunkType.Artifact` 的引用
- **THEN** 所有引用已移除或替换
