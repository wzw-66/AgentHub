## ADDED Requirements

### Requirement: 自定义 Agent 创建
系统应允许用户创建自定义 Agent。

#### Scenario: 打开创建表单
- **WHEN** 用户在 Agent 列表页点击"创建 Agent"按钮
- **THEN** 弹出创建 Agent 表单 Modal

#### Scenario: 表单字段
- **WHEN** 创建 Agent 表单打开
- **THEN** 表单包含名称（必填）、系统提示词（textarea，可选）、模型（可选，默认值由前端设置）字段

#### Scenario: 表单验证
- **WHEN** 用户提交空名称
- **THEN** 显示"名称不能为空"错误提示
- **THEN** 不提交表单

#### Scenario: 创建自定义 Agent
- **WHEN** 用户填写有效表单并提交
- **THEN** 调用 `POST /api/agents/create` 创建 Agent
- **THEN** 创建成功后关闭 Modal
- **THEN** Agent 列表自动刷新并显示新创建的 Agent
- **THEN** 新 Agent 显示在列表末尾（自定义 Agent 区域）

#### Scenario: 创建失败
- **WHEN** API 返回错误
- **THEN** 显示错误提示
- **THEN** 表单保持打开，用户可重试
