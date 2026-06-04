## MODIFIED Requirements

### Requirement: 新建聊天（群聊模式扩展）
用户 SHALL 在新建聊天时选择单聊或群聊模式。

#### Scenario: 新建聊天弹出模式选择
- **WHEN** 用户点击新建聊天按钮
- **THEN** 弹出对话框顶部显示 [单聊] [群聊] 模式切换，默认单聊

#### Scenario: 单聊模式选择 Agent
- **WHEN** 模式为单聊
- **THEN** Agent 列表显示为单选（点击即选），选后立即创建 type="single" 的 conversation

#### Scenario: 群聊模式选择 Agent
- **WHEN** 模式为群聊
- **THEN** Agent 列表显示为多选（checkbox），需选择至少 3 个 Agent 才能创建
- **AND** 创建时 type="group"，contactIds 包含所有选中 Agent 的 ID

#### Scenario: 群聊标题
- **WHEN** 创建群聊时未填写标题
- **THEN** 自动生成标题如 "Group: AgentA, AgentB..."

### MODIFIED Requirements

### Requirement: 会话列表显示类型标识
侧边栏 SHALL 在会话列表中显示单聊/群聊的区分标识。

#### Scenario: 单聊显示单人图标
- **WHEN** 侧边栏渲染 type="single" 的会话
- **THEN** 使用单人头像图标

#### Scenario: 群聊显示多人图标
- **WHEN** 侧边栏渲染 type="group" 的会话
- **THEN** 使用多人/群组图标

### Requirement: 聊天面板头部显示会话类型
聊天面板顶部 SHALL 清晰显示当前是单聊还是群聊。

#### Scenario: 单聊头部显示 Direct Channel
- **WHEN** 查看 type="single" 的会话
- **THEN** 头部显示绿色状态点 + "Direct Channel" 标签（已有，保持不变）

#### Scenario: 群聊头部显示 Group Session + 成员
- **WHEN** 查看 type="group" 的会话
- **THEN** 头部显示群组图标 + "Group Session" 标签 + 成员数量

### ADDED Requirements

### Requirement: SSE CORS 支持
SSE endpoint SHALL 返回正确的 CORS 头以允许跨域连接。

#### Scenario: SSE 连接通过 CORS
- **WHEN** 前端从 `http://localhost:3002` 发起 EventSource 连接到后端 SSE endpoint
- **THEN** 服务端返回 `Access-Control-Allow-Origin` 头匹配请求 origin
- **AND** 连接成功建立，收到 `connected` 事件

#### Scenario: SSE OPTIONS 预检
- **WHEN** 浏览器在 SSE 连接前发送 OPTIONS 请求
- **THEN** 服务端正确响应 204 + CORS 头

### Requirement: Agent 详情页 Start Chat 修复
Agent 详情页的 Start Chat SHALL 使用正确的字段名 `contactIds` 而非 `agentIds`。

#### Scenario: Start Chat 使用正确字段
- **WHEN** 用户在 Agent 详情页点击 Start Chat
- **THEN** POST 请求体包含 `contactIds: [agentId]` 而非 `agentIds: [agentId]`
- **AND** 创建的 conversation 的 contactIds 数组不为空
