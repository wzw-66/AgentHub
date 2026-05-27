## ADDED Requirements

### Requirement: Agent 详情页面
系统应在 `/agents/:id` 显示特定 Agent 的详细信息。

#### Scenario: 加载 Agent 详情
- **WHEN** 用户导航到 `/agents/:id`
- **THEN** 系统调用 `GET /api/agents/:id/detail` 获取 Agent 信息
- **THEN** 页面显示 Agent 的头像、名称、提供商、模型和系统提示词

#### Scenario: Agent 不存在
- **WHEN** Agent ID 无效或不存在
- **THEN** 显示"Agent 未找到"错误页面

#### Scenario: 从详情页开始聊天
- **WHEN** 用户在 Agent 详情页点击"开始聊天"
- **THEN** 系统调用 `POST /api/conversations/create` 创建与该 Agent 的单聊会话
- **THEN** 页面跳转到 `/chat` 并自动激活新会话

#### Scenario: 从详情页添加到联系人
- **WHEN** 用户在 Agent 详情页点击"添加到联系人"
- **THEN** 系统调用 `POST /api/contacts/create` 将 Agent 添加为联系人

#### Scenario: 重复添加联系人
- **WHEN** Agent 已是用户的联系人
- **THEN** "添加到联系人"按钮显示为"已是联系人"禁用状态

### Requirement: RightPanel Agent 详情展示
系统应在聊天界面的右侧面板展示 Agent 详细信息。

#### Scenario: RightPanel 展示 Agent
- **WHEN** 用户在聊天界面通过 `onShowAgent` 触发展示 Agent
- **THEN** 右侧面板显示 Agent 的头像、名称、提供商、模型和描述
- **THEN** 面板包含"开始聊天"和"添加到联系人"操作按钮
