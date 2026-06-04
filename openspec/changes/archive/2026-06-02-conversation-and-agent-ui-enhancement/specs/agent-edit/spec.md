## ADDED Requirements

### Requirement: Agent 编辑
系统 SHALL 允许用户在 Agent 详情页编辑自己创建的 Agent 的名称和系统提示词。

#### Scenario: Agent 详情页显示编辑按钮
- **WHEN** 用户查看 Agent 详情页
- **THEN** 在操作区域显示 Edit 按钮

#### Scenario: 打开编辑弹窗
- **WHEN** 用户点击 Edit 按钮
- **THEN** 弹出编辑弹窗，预填当前 name 和 systemPrompt，只读展示 provider 和 model

#### Scenario: 编辑名称
- **WHEN** 用户在编辑弹窗中修改 name 字段并保存
- **THEN** 调用 `PATCH /api/contacts/:id/update` 更新，成功后关闭弹窗并刷新详情页

#### Scenario: 编辑 System Prompt
- **WHEN** 用户在编辑弹窗中修改 systemPrompt 字段并保存
- **THEN** 调用 `PATCH /api/contacts/:id/update` 更新

#### Scenario: 空名称校验
- **WHEN** 用户将 name 清空后保存
- **THEN** 弹窗显示校验错误，不提交

#### Scenario: 编辑取消
- **WHEN** 用户在编辑弹窗中点击取消
- **THEN** 弹窗关闭，不做任何修改

### Requirement: Provider 只读
系统 SHALL 在编辑模式中禁止修改 Agent 的 provider。

#### Scenario: Provider 字段只读展示
- **WHEN** 编辑弹窗打开
- **THEN** Provider 字段以纯文本或禁用状态展示，不可编辑

#### Scenario: 尝试修改 Provider
- **WHEN** 用户发送 `PATCH /api/contacts/:id/update` 请求且 body 包含 `provider`
- **THEN** 服务端忽略或拒绝 provider 字段的修改
