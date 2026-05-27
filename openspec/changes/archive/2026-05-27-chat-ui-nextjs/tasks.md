## 1. 项目骨架搭建

- [x] 1.1 使用 Next.js App Router 创建 `apps/web` 项目结构，配置 `package.json`、`tsconfig.json`（继承 `tooling/tsconfig/nextjs.json`）
- [x] 1.2 配置 Tailwind CSS（`tailwind.config.ts`、`postcss.config.js`、全局 CSS 变量）
- [x] 1.3 配置 ESLint 继承 `tooling/eslint-config`
- [x] 1.4 创建根布局 `app/layout.tsx`，包含全局 Provider 包裹（AuthProvider、WSProvider）
- [x] 1.5 创建 `app/globals.css`，包含 Tailwind 指令和自定义 CSS 变量
- [x] 1.6 更新 `turbo.json` 加入 `apps/web` 的 build/dev/lint/test 任务
- [x] 1.7 创建 HTTP 客户端封装 `lib/api-client.ts`，含自动 token 刷新拦截器
- [x] 1.8 验证 `pnpm install` + `pnpm build --filter @agenthub/web` 编译通过

## 2. 用户认证

- [x] 2.1 实现 `AuthContext`（React Context），管理 user、token、login/logout/refresh 状态
- [x] 2.2 实现 `useAuth` hook，封装 login（`POST /auth/login`）和 register（`POST /auth/register`）逻辑
- [x] 2.3 实现登录页面 `app/(auth)/login/page.tsx`：表单、验证、错误提示
- [x] 2.4 实现注册页面 `app/(auth)/register/page.tsx`：表单、验证、成功跳转
- [x] 2.5 实现路由守卫组件 `components/AuthGuard.tsx`：未登录重定向到 `/login`
- [x] 2.6 实现 `useTokenRefresh` hook，在 401 时自动调用 `POST /auth/refresh`
- [x] 2.7 实现 localStorage token 持久化和初始化恢复

## 3. 三栏聊天布局

- [x] 3.1 创建 `app/(chat)/layout.tsx`，包裹 AuthGuard，渲染三栏 Grid 布局
- [x] 3.2 创建 `app/(chat)/chat/page.tsx`，作为聊天主页面
- [x] 3.3 实现 `Sidebar` 组件（`w-72`）：用户信息、搜索框、会话列表、新建按钮
- [x] 3.4 实现 `ChatPanel` 组件（`flex-1`）：头部、消息列表、输入框
- [x] 3.5 实现 `RightPanel` 组件（`w-96`，默认隐藏）：产物/Agent 详情容器
- [x] 3.6 实现三栏响应式状态管理：右侧面板显示/隐藏切换

## 4. 侧边栏功能

- [x] 4.1 实现用户信息展示区：从 auth context 获取头像和用户名
- [x] 4.2 实现搜索框：受控输入、300ms 防抖、本地过滤会话列表
- [x] 4.3 实现会话列表：从 `GET /api/conversations` 获取数据，渲染列表项
- [x] 4.4 实现会话列表项组件：AgentAvatar + 名称 + 最后消息预览 + 未读计数（mock）
- [x] 4.5 实现活跃会话高亮：记录当前 `activeConversationId`
- [x] 4.6 实现新建聊天对话框：弹出层展示 Agent 列表，选择后调用 API 创建会话
- [x] 4.7 实现 `ChatContext` 管理聊天状态：activeConversation、conversations、messages

## 5. 聊天面板

- [x] 5.1 实现会话头部 `ChatHeader` 组件：显示名称、参与者列表
- [x] 5.2 实现消息列表容器 `MessageList`：可滚动、自动滚动到底部
- [x] 5.3 实现 `useMessages(conversationId)` hook：分页加载消息、追加消息、替换消息
- [x] 5.4 实现消息列表的 cursor 分页：滚动到顶部触发加载更早消息
- [x] 5.5 实现 auto-scroll 逻辑：仅当用户在底部时自动滚动，否则显示"新消息"提示
- [x] 5.6 实现空白状态：选择会话前显示"选择一个会话开始聊天"提示

## 6. 消息气泡与输入框

- [x] 6.1 集成 `@agenthub/ui` 的 `MessageBubble` 组件，按 `senderType` 分发渲染
- [x] 6.2 实现 user 消息左对齐（蓝色气泡）和 contact 消息右对齐（灰色气泡 + 头像）
- [x] 6.3 实现 system 消息居中显示
- [x] 6.4 实现消息内容按类型渲染：纯文本 → 直接展示，代码块 → `CodeBlock`，diff → `DiffCard`
- [x] 6.5 实现 `ChatInput` 组件：textarea + 发送按钮
- [x] 6.6 实现 Enter 发送 / Shift+Enter 换行逻辑
- [x] 6.7 实现发送调用 `POST /api/conversations/:id/messages`，成功后追加到消息列表

## 7. 群聊 @提及

- [x] 7.1 实现 `MentionPopup` 组件：浮层列表，显示 Agent 名称和头像
- [x] 7.2 实现 @检测逻辑：监听输入框内容，检测 `@` 字符位置
- [x] 7.3 实现 Agent 列表获取：从 `GET /api/agents` 获取群聊可选 Agent
- [x] 7.4 实现键盘导航：↑↓ 切换选项，Enter 确认，Esc 关闭
- [x] 7.5 实现点击外部关闭弹出框
- [x] 7.6 实现选择后插入 `@AgentName` 文本
- [x] 7.7 实现单聊模式下禁用 @提及

## 8. 输入中状态指示器

- [x] 8.1 在 `ChatContext` 中维护 `typingAgents` Map<string, boolean>
- [x] 8.2 实现 `TypingIndicator` 组件：三点跳动动画 + Agent 名称
- [x] 8.3 实现指示器显示时机：消息列表底部、输入框上方
- [x] 8.4 实现消息完成（done）后清除对应 Agent 的输入中状态

## 9. SSE 实时消息流集成

- [x] 9.1 创建 `useSSEStream(conversationId)` hook，封装 EventSource 生命周期
- [x] 9.2 实现连接管理：进入会话 connect，切换/离开会话 disconnect
- [x] 9.3 实现 chunk 事件处理：实时追加文本到消息缓冲区，更新 UI
- [x] 9.4 实现 done 事件处理：最终确定消息，清除输入中状态
- [x] 9.5 实现 SSE 错误处理和自动重连（指数退避：1s, 2s, 4s, 8s, max 30s）
- [x] 9.6 实现连接状态指示：连接中/已连接/已断开

## 10. WebSocket 实时通信集成

- [x] 10.1 创建 `WSContext` 和 `useWebSocket()` hook，封装 WebSocket 生命周期
- [x] 10.2 实现连接建立：用户登录后自动连接 `ws://host/ws?token=xxx`
- [x] 10.3 实现 `online_status` 事件处理：更新联系人在线状态
- [x] 10.4 实现 `message_status` 事件处理：更新消息投递状态图标
- [x] 10.5 实现心跳机制：30s ping/pong
- [x] 10.6 实现断开自动重连（指数退避）
- [x] 10.7 实现登出时主动关闭 WebSocket 连接

## 11. 集成测试与验证

- [x] 11.1 编写认证页面 E2E 测试（登录、注册、token 刷新）
- [x] 11.2 编写聊天布局渲染测试（三栏结构、侧边栏、消息列表）
- [x] 11.3 编写消息发送和接收测试
- [x] 11.4 验证全链路：登录 → 建会话 → 发消息 → SSE 接收 Agent 响应 → 显示气泡
- [x] 11.5 验证 `pnpm build` 全量构建通过
