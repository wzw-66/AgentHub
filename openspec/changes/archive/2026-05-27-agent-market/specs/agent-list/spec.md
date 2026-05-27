## ADDED Requirements

### Requirement: Agent 列表页面
系统应在 `/agents` 显示所有可用 Agent 的列表。

#### Scenario: 加载 Agent 列表
- **WHEN** 用户导航到 `/agents`
- **THEN** 系统调用 `GET /api/agents/list` 加载 Agent 列表
- **THEN** 列表显示 loading 骨架屏状态下在加载完成后替换为实际内容

#### Scenario: 显示 Agent 卡片
- **WHEN** Agent 列表加载完成
- **THEN** 每个 Agent 以卡片形式展示头像、名称和提供商
- **THEN** 点击 Agent 卡片导航到 `/agents/:id`

#### Scenario: 内置 Agent 优先显示
- **WHEN** Agent 列表包含内置和用户创建的 Agent
- **THEN** 内置 Agent 显示在用户创建的 Agent 之前

#### Scenario: 列表为空状态
- **WHEN** 系统中没有任何 Agent
- **THEN** 显示空状态提示"暂无可用 Agent"

#### Scenario: 列表加载失败
- **WHEN** API 请求失败
- **THEN** 显示错误提示和重试按钮

### Requirement: Agent 市场导航入口
系统应在聊天界面的 Sidebar 提供进入 Agent 市场的入口。

#### Scenario: Sidebar 导航按钮
- **WHEN** 用户在聊天界面
- **THEN** Sidebar 用户信息区下方显示"Agent 市场"导航按钮
- **THEN** 点击按钮导航到 `/agents`
