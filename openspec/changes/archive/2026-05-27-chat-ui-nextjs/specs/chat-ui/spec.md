## ADDED Requirements

### Requirement: 用户认证
系统 SHALL 提供登录和注册页面，用户通过 JWT token 认证后访问聊天界面。

#### Scenario: 用户注册
- **WHEN** 用户在注册页面填写 username、email、password 并提交
- **THEN** 系统调用 `POST /auth/register`，成功后跳转到登录页

#### Scenario: 用户登录
- **WHEN** 用户在登录页面填写 credential 并提交
- **THEN** 系统调用 `POST /auth/login`，接收到 access token 和 refresh token 并存储到 localStorage

#### Scenario: Token 过期自动刷新
- **WHEN** HTTP 请求返回 401
- **THEN** 系统自动调用 `POST /auth/refresh` 刷新 token，重试原请求

#### Scenario: 未登录重定向
- **WHEN** 用户未登录（无有效 token）访问 `/chat`
- **THEN** 系统重定向到 `/login`

### Requirement: 三栏聊天布局
系统 SHALL 在 `/chat` 路由渲染三栏 IM 布局：侧边栏、聊天面板、右侧面板。

#### Scenario: 三栏布局渲染
- **WHEN** 用户导航到 `/chat`
- **THEN** 显示侧边栏（w-72）、聊天面板（flex-1）和右侧面板（默认隐藏）

#### Scenario: 右侧面板按需显示
- **WHEN** 用户查看产物或 Agent 详情
- **THEN** 右侧面板显示对应内容

### Requirement: 侧边栏会话列表
侧边栏 SHALL 显示用户信息、搜索框和会话列表。

#### Scenario: 显示用户信息
- **WHEN** 侧边栏加载
- **THEN** 在顶部显示当前用户头像和用户名

#### Scenario: 会话列表加载
- **WHEN** 侧边栏加载
- **THEN** 从 `GET /api/conversations` 获取数据，每项显示 AgentAvatar、会话名称、最后消息预览

#### Scenario: 搜索过滤会话
- **WHEN** 用户在搜索框中输入
- **THEN** 会话列表按名称实时过滤（300ms 防抖）

#### Scenario: 新建聊天
- **WHEN** 用户点击新建聊天按钮
- **THEN** 弹出对话框显示 Agent 列表，选择后调用 `POST /api/conversations` 创建会话

#### Scenario: 切换活跃会话
- **WHEN** 用户点击会话列表中的某一项
- **THEN** 该项高亮显示，聊天面板切换到对应会话

### Requirement: 消息列表
聊天面板 SHALL 显示当前会话的消息列表，支持分页和历史加载。

#### Scenario: 加载历史消息
- **WHEN** 用户进入会话
- **THEN** 从 `GET /api/conversations/:id/messages` 加载最近消息

#### Scenario: 滚动加载更多
- **WHEN** 用户滚动到消息列表顶部
- **THEN** 加载更早的消息（cursor 分页）

#### Scenario: 新消息自动滚动
- **WHEN** 用户位于消息列表底部且新消息到达
- **THEN** 列表自动滚动到底部

#### Scenario: 不自动滚动
- **WHEN** 用户已向上滚动查看历史消息
- **THEN** 新消息到达时不自动滚动，显示"新消息"提示

### Requirement: 消息气泡渲染
消息 SHALL 以气泡形式显示，按发送者类型区分样式。

#### Scenario: 用户消息左对齐
- **WHEN** `senderType` 为 "user"
- **THEN** 消息显示为左对齐气泡，蓝色背景

#### Scenario: Agent 消息右对齐
- **WHEN** `senderType` 为 "contact"
- **THEN** 消息显示为右对齐气泡，灰色背景，显示 Agent 头像

#### Scenario: 系统消息居中
- **WHEN** `senderType` 为 "system"
- **THEN** 消息居中显示，灰色文字，小字号

#### Scenario: 消息内容渲染
- **WHEN** 消息包含代码块、diff 或 artifact
- **THEN** 分别使用 CodeBlock、DiffCard、ArtifactCard 组件渲染

### Requirement: 聊天输入框
聊天面板底部 SHALL 提供文本输入框和发送按钮。

#### Scenario: 输入文本
- **WHEN** 聊天面板加载
- **THEN** 底部显示多行 textarea 和发送按钮

#### Scenario: Enter 发送
- **WHEN** 用户在输入框中按下 Enter（不按 Shift）
- **THEN** 消息发送，输入框清空

#### Scenario: Shift+Enter 换行
- **WHEN** 用户按下 Shift+Enter
- **THEN** 在 textarea 中插入换行

#### Scenario: 发送消息到 API
- **WHEN** 用户点击发送按钮或按 Enter
- **THEN** 调用 `POST /api/conversations/:id/messages`

### Requirement: 群聊 @提及
在群聊中，系统 SHALL 支持通过 @符号提及 Agent。

#### Scenario: @提及弹出框
- **WHEN** 用户在群聊输入框中输入 `@`
- **THEN** 弹出浮层显示可提及的 Agent 列表（来自 `GET /api/agents`）

#### Scenario: @提及键盘导航
- **WHEN** @提及弹出框显示时用户按下 ↑/↓
- **THEN** 高亮在选项间移动

#### Scenario: @提及确认
- **WHEN** 用户选择 Agent 后按 Enter 或点击
- **THEN** 在输入框中插入 `@AgentName`，弹出框关闭

#### Scenario: @提及关闭
- **WHEN** 用户按 Esc 或在弹出框外点击
- **THEN** @提及弹出框关闭

#### Scenario: 单聊不触发@提及
- **WHEN** 会话类型为 single
- **THEN** 输入 `@` 不触发弹出框

### Requirement: Agent 流式响应输入中状态
系统 SHALL 在 Agent 响应中显示输入中状态指示器。

#### Scenario: 显示输入中状态
- **WHEN** Agent 正在流式输出
- **THEN** 消息列表底部显示三点跳动动画 + Agent 名称

#### Scenario: 输入中状态消失
- **WHEN** SSE 收到 done 事件
- **THEN** 输入中状态消失，完整消息显示在列表中

### Requirement: SSE 实时消息流
系统 SHALL 通过 SSE 接收 Agent 的流式输出并在聊天面板实时展示。

#### Scenario: SSE 连接
- **WHEN** 用户进入会话
- **THEN** 创建 `EventSource` 连接到 `/sse/conversations/:id/stream?token=xxx`

#### Scenario: 流式消息追加
- **WHEN** SSE 收到 chunk 事件
- **THEN** 追加文本到当前消息缓冲区并实时更新 UI

#### Scenario: 消息完成
- **WHEN** SSE 收到 done 事件
- **THEN** 最终确定消息，清除输入中状态

#### Scenario: SSE 断开重连
- **WHEN** SSE 连接意外断开
- **THEN** 自动重连（指数退避：1s, 2s, 4s, 8s, max 30s）

#### Scenario: 退出会话断开 SSE
- **WHEN** 用户切换会话
- **THEN** 关闭当前 SSE 连接

### Requirement: WebSocket 在线状态
系统 SHALL 通过 WebSocket 维护实时连接，管理在线状态和通知。

#### Scenario: WebSocket 连接
- **WHEN** 用户登录后
- **THEN** 建立 WebSocket 连接到 `ws://host/ws?token=xxx`

#### Scenario: 在线状态更新
- **WHEN** WebSocket 收到 online_status 事件
- **THEN** 更新联系人在线/离线状态显示

#### Scenario: 消息投递状态
- **WHEN** WebSocket 收到 message_status 事件
- **THEN** 更新对应消息的投递状态图标（sent/delivered/read）

#### Scenario: 心跳维持
- **WHEN** WebSocket 连接建立后
- **THEN** 以 30s 间隔发送 ping，服务端回复 pong

#### Scenario: WebSocket 断开重连
- **WHEN** WebSocket 连接断开
- **THEN** 自动重连（指数退避）

#### Scenario: 登出断开 WebSocket
- **WHEN** 用户登出
- **THEN** 主动关闭 WebSocket 连接

### Requirement: 会话头部信息
聊天面板顶部 SHALL 显示当前会话的标题和参与者信息。

#### Scenario: 显示会话名称
- **WHEN** 查看单聊
- **THEN** 头部显示对方 Agent 名称和头像

#### Scenario: 显示群聊标题
- **WHEN** 查看群聊
- **THEN** 头部显示群聊标题和成员数量
