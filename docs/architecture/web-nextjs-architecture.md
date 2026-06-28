# AgentHub Web — Next.js 前端架构全览

> 包名: `@agenthub/web`
> 技术栈: Next.js 14 (App Router) + React 18 + TypeScript 6 + Tailwind CSS 3
> 构建: Turborepo / tsup (仅用于共享包) + Next.js 内置构建

---

## 目录

1. [项目结构与配置](#1-项目结构与配置)
2. [路由架构 (App Router)](#2-路由架构-app-router)
3. [Provider 栈与全局状态](#3-provider-栈与全局状态)
4. [API 客户端层](#4-api-客户端层)
5. [实时通信层](#5-实时通信层)
6. [组件体系](#6-组件体系)
7. [Hooks](#7-hooks)
8. [样式系统](#8-样式系统)
9. [国际化 (i18n)](#9-国际化-i18n)
10. [开发工具与脚本](#10-开发工具与脚本)
11. [测试策略](#11-测试策略)
12. [数据流全景](#12-数据流全景)

---

## 1. 项目结构与配置

### 目录结构

```
apps/web/
├── app/                          # Next.js App Router 页面
│   ├── layout.tsx                # 根布局
│   ├── page.tsx                  # 根路由 → redirect(/login)
│   ├── providers.tsx             # 全局 Provider 组合
│   ├── globals.css               # 全局样式 + 4 套主题
│   ├── globals.d.ts              # Next 类型引用
│   ├── (auth)/                   # 认证路由组
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (chat)/                   # 聊天路由组
│   │   ├── layout.tsx            # AuthGuard
│   │   └── chat/page.tsx
│   └── (market)/                 # Agent 市场路由组
│       ├── layout.tsx            # AuthGuard
│       └── agents/
│           ├── page.tsx          # Agent 列表
│           ├── contacts/page.tsx # 联系人管理
│           └── [id]/page.tsx     # Agent 详情
├── components/                   # UI 组件
├── hooks/                        # 自定义 Hooks
├── lib/                          # 核心逻辑 (Contexts, API Client, i18n)
├── scripts/                      # 开发脚本
├── src/__tests__/                # 测试文件
├── public/                       # 静态资源 (当前为空)
├── next.config.js                # Next.js 配置
├── tailwind.config.ts            # Tailwind 配置
├── tsconfig.json                 # TypeScript 配置
├── vitest.config.ts              # Vitest 配置
└── package.json                  # 依赖声明
```

### 关键配置文件

| 文件 | 作用 |
|------|------|
| `next.config.js` | 从 monorepo 根 `.env` 注入 `NEXT_PUBLIC_*` 变量；transpile `@agenthub/shared` 和 `@agenthub/ui` |
| `tailwind.config.ts` | 扩展 `theme` 颜色命名空间；自定义字体栈（JetBrains Mono + CJK fallback）；自定义动画关键帧 |
| `tsconfig.json` | 继承 `../tooling/tsconfig/nextjs.json`；`@/` 别名；`exactOptionalPropertyTypes: false` |
| `vitest.config.ts` | jsdom 环境；React 插件；`@/` 别名解析 |

### 依赖关系

```
@agenthub/web
├── @agenthub/shared     # 类型定义、枚举 (workspace:*)
├── @agenthub/ui         # MessageBubble, CodeBlock 等共享组件 (workspace:*)
├── next@14
├── react / react-dom@18
├── react-markdown       # Markdown 渲染
├── remark-gfm           # GFM 扩展 (表格、任务列表等)
└── devDeps:
    ├── vitest + @testing-library/react + jsdom
    └── tailwindcss + postcss + autoprefixer
```

---

## 2. 路由架构 (App Router)

### 路由组设计

项目采用 Next.js 14 App Router 的 **Route Group** 机制进行页面组织：

```
app/
├── (auth)/        # 无需认证的页面
├── (chat)/        # 需要认证的聊天页面
└── (market)/      # 需要认证的 Agent 市场页面
```

每个组对应一个功能域，共享同一个 layout（如果有）。

### 路由表

| 路径 | 文件 | 路由组 | 认证 | 功能 |
|------|------|--------|------|------|
| `/` | `page.tsx` | - | 否 | 直接 redirect 到 `/login` |
| `/login` | `(auth)/login/page.tsx` | auth | 否 | 登录表单 |
| `/register` | `(auth)/register/page.tsx` | auth | 否 | 注册表单 |
| `/chat` | `(chat)/chat/page.tsx` | chat | 是 | 主聊天界面（三栏布局） |
| `/agents` | `(market)/agents/page.tsx` | market | 是 | Agent 市场/列表 |
| `/agents/contacts` | `(market)/agents/contacts/page.tsx` | market | 是 | 联系人管理 |
| `/agents/[id]` | `(market)/agents/[id]/page.tsx` | market | 是 | Agent 详情 |

### 布局层级

```
RootLayout (app/layout.tsx)
├── Fira Code 字体加载
├── <html data-theme="green">
├── <body class="noise-overlay">
└── <Providers>           # 全局 Provider 栈
    ├── BackgroundEffects  # Canvas 星云背景
    └── children
        │
        ├── (auth) 路由组  # 无额外布局
        │   ├── /login
        │   └── /register
        │
        ├── (chat) 路由组
        │   └── AuthGuard  # 认证保护
        │       └── /chat  →  Sidebar + ChatPanel + RightPanel
        │
        └── (market) 路由组
            └── AuthGuard  # 认证保护
                ├── /agents
                ├── /agents/contacts
                └── /agents/[id]
```

### AuthGuard 机制

`AuthGuard` (`components/AuthGuard.tsx`) 是一个客户端组件，工作流程：

1. 检查 `useAuth()` 的 `isLoading` 和 `isAuthenticated` 状态
2. **Loading 中**: 显示 spinner 占位
3. **未认证**: 显示 `null`（空白）+ `router.replace('/login')` 重定向
4. **已认证**: 渲染 `children`

这样既避免了闪烁，也防止了未授权访问。

---

## 3. Provider 栈与全局状态

### Provider 嵌套顺序（`app/providers.tsx`）

```
I18nProvider
  └── ThemeProvider
        └── AuthProvider
              └── WSProvider
                    └── ChatProvider
                          └── BackgroundEffects (不提供 context, 纯副作用)
```

**顺序是有原因的**: WSProvider 需要 AuthContext 获取 token；ChatProvider 需要 AuthContext 和 WSProvider。

### 3.1 I18nProvider (`lib/i18n/context.tsx`)

- **状态**: `locale` (`"en" | "zh"`)
- **持久化**: `localStorage('agenthub_locale')`
- **核心 API**:
  - `t(key)` — 类型安全的翻译键访问（返回嵌套对象或模板函数）
  - `setLocale(locale)` — 切换语言
- **副作用**: 更新 `<html lang>`；更新 localStorage
- **翻译文件**: `lib/i18n/translations/en.ts` 和 `zh.ts`，类型由 `DeepStringify` 工具类型推导

### 3.2 ThemeProvider (`lib/theme-context.tsx`)

- **状态**: `theme` (`"green" | "blue" | "purple" | "red"`)
- **持久化**: `localStorage('agenthub_theme')`
- **核心 API**: `setTheme(theme)`
- **副作用**: 设置 `document.documentElement` 的 `data-theme` 属性，触发 CSS 变量切换
- **主题名称**:
  - green: Matrix（默认）
  - blue: Cyber
  - purple: Neon
  - red: Inferno

### 3.3 AuthProvider (`lib/auth-context.tsx`)

- **状态**: `user | null`, `isAuthenticated`, `isLoading`
- **初始化**: 挂载时从 localStorage 恢复 token + user
- **核心 API**:
  - `login(email, password)` → POST `/auth/login` → 存储 tokens + user
  - `register(name, email, password)` → POST `/auth/register` → 跳转登录页
  - `logout()` → 清除 storage → 跳转 `/login`
- **数据流**: 通过 `api-client.ts` 的 `storeTokens` / `storeUser` 持久化到 localStorage

### 3.4 WSProvider (`lib/ws-context.tsx`)

- **状态**: `status` (连接状态), `onlineStatuses` (用户在线状态), `messageStatuses` (消息送达状态)
- **连接管理**:
  - 连接 URL: `ws://<API_BASE_URL>/ws?token=<JWT>`
  - 自动重连: 指数退避 (1s, 2s, 4s, 8s, 16s, max 30s)，最多 5 次
  - 心跳: 每 30s 发送 `{"type":"ping"}`
- **事件处理**:
  - `online_status`: 更新 `userId` 的在线/离线状态
  - `message_status`: 更新 `messageId` 的 sent/delivered/read 状态
- **生命周期**: `isAuthenticated` 为 true 时自动连接，false 时自动断开

### 3.5 ChatProvider (`lib/chat-context.tsx`)

这是最核心的 Context，管理所有聊天数据：

**状态清单**:

| 状态 | 类型 | 说明 |
|------|------|------|
| `conversations` | `Conversation[]` | 会话列表 |
| `activeConversationId` | `string \| null` | 当前活跃会话 |
| `messages` | `Message[]` | 当前会话的消息列表 |
| `streamingMessage` | `StreamingMessage \| null` | 正在流式接收的消息 |
| `contacts` | `ContactInfo[]` | Agent 联系人列表 |
| `typingAgents` | `Map<string, boolean>` | 正在输入的 Agent |
| `isLoading*` | `boolean` | 各项加载状态 |

**核心 API**:

| 方法 | HTTP 调用 | 说明 |
|------|-----------|------|
| `fetchConversations()` | GET `/api/conversations/list` | 加载会话列表 |
| `fetchMessages(convId, cursor?)` | GET `/api/conversations/:id/messages/list` | 加载消息（支持游标分页） |
| `sendMessage(convId, content)` | POST `/api/conversations/:id/messages/create` | 发送消息 |
| `createConversation(title, type, contactIds)` | POST `/api/conversations/create` | 创建会话 |
| `appendMessageChunk(chunk, agentId?)` | - | 追加流式消息片段 |
| `finalizeMessage(messageId?, agentId?)` | - | 完成流式消息，转入永久消息列表 |
| `setTypingAgent(agentId, isTyping)` | - | 更新输入状态 |

**流式消息处理逻辑**:

```
appendMessageChunk 被调用 →
  streamingMessage 不存在 → 创建新的 StreamingMessage
  streamingMessage 已存在 → 追加 content

finalizeMessage 被调用 →
  将 streamingMessage 转为永久 Message
  推入 messages 数组
  清除 streamingMessage
  清除 typingAgents
```

---

## 4. API 客户端层

### `lib/api-client.ts`

这是前端与后端通信的核心层，封装了所有 HTTP 请求逻辑。

### Token 管理

```
localStorage:
├── agenthub_access_token   # JWT access token
├── agenthub_refresh_token  # JWT refresh token
└── agenthub_user           # JSON: { id, username, email }
```

### API 基础 URL

从 `NEXT_PUBLIC_API_URL` 环境变量读取。开发时由 `scripts/dev.mjs` 注入。

### 请求流程

```
api.get/post/patch/delete(path, body?, opts?)
  │
  ├── 构建 URL: config.baseUrl + path
  ├── 设置 headers (Authorization: Bearer <token>)
  ├── fetch()
  │
  ├── 200-299 → 返回 JSON
  ├── 401 → 尝试 refresh
  │   ├── refresh 成功 → 重试原始请求
  │   └── refresh 失败 → onAuthFailure() → 跳转 /login
  └── 其他 → 抛出 ApiError { status, message }
```

### 公共 API

```typescript
export const api = {
  get<T>(path, opts?): Promise<T>,
  post<T>(path, body?, opts?): Promise<T>,
  patch<T>(path, body?): Promise<T>,
  delete<T>(path): Promise<T>,
};
```

注意: 登录和注册请求使用 `skipAuth: true` 跳过 Authorization header。

---

## 5. 实时通信层

系统同时使用 **WebSocket** 和 **SSE** 两种实时通信技术，职责分离：

### WebSocket (WSProvider)

```
目的: 双向通信，状态同步
连接: ws://<API>/ws?token=<JWT>
自动重连: 指数退退避 (最大 30s, 5 次)
心跳: 30s 间隔 ping/pong
事件类型:
  - online_status: 用户在线状态变更
  - message_status: 消息送达/已读状态
```

### SSE (useSSEStream hook)

```
目的: 单向流式接收 AI 响应
连接: http://<API>/sse/conversations/<id>/stream?token=<JWT>
自动重连: 指数退避 (最大 30s, 5 次)
事件类型:
  - chunk: AI 响应文本片段 → appendMessageChunk()
  - done: AI 响应完成 → finalizeMessage()
  - error: 错误事件
生命周期: 随 conversationId 变化自动连接/断开
```

### 双通道分工

| 通道 | 方向 | 用途 | 连接粒度 |
|------|------|------|----------|
| WebSocket | 双向 | 在线状态、消息送达 | 全局（用户级别） |
| SSE | 单向（服务端→客户端） | AI 流式响应 | 每会话（conversation 级别） |

---

## 6. 组件体系

### 6.1 页面组件

| 组件 | 路径 | 职责 |
|------|------|------|
| `LoginPage` | `(auth)/login/page.tsx` | 邮箱+密码登录，表单验证，跳转 `/chat` |
| `RegisterPage` | `(auth)/register/page.tsx` | 用户名+邮箱+密码注册，跳转 `/login` |
| `ChatPage` | `(chat)/chat/page.tsx` | 主聊天布局，三栏编排 |
| `AgentListPage` | `(market)/agents/page.tsx` | Agent 列表，创建 Agent，搜索/排序 |
| `ContactListPage` | `(market)/agents/contacts/page.tsx` | 联系人管理（置顶、编辑、删除） |
| `AgentDetailPage` | `(market)/agents/[id]/page.tsx` | Agent 详情、发起聊天、添加联系人、编辑/删除 |

### 6.2 功能组件

#### AuthGuard
- 认证守卫，包裹需要登录的路由
- Loading/未认证/已认证 三态渲染

#### Sidebar
- **用户信息栏**: 头像、用户名、退出按钮
- **快速导航**: Chat / Agents / Contacts 三标签
- **搜索框**: 按会话标题过滤
- **新建会话**: Modal 弹窗，支持 Single/Group 模式
- **会话列表**: 按时间显示，hover 出现删除按钮，删除确认
- **底部**: ThemeSwitcher + LanguageSwitcher

#### ChatPanel
- **消息列表**: 使用 `MessageBubble`（来自 `@agenthub/ui`），支持 user/system/contact 三种 variant
- **Markdown 渲染**: 通过 `MarkdownRenderer` 组件，支持代码块高亮 (CodeBlock)、GFM 表格、链接
- **流式消息**: 显示 `streamingMessage`，末尾带光标闪烁动画
- **消息操作**: 最后一条用户消息可编辑/删除（hover 显示操作按钮），删除需二次确认
- **@提及**: 群聊模式下检测 `@` 符号，弹出 `MentionPopup`，键盘导航选择
- **输入框**: 类终端风格 `$` 前缀，Enter 发送，Shift+Enter 换行
- **TypingIndicator**: 显示正在处理的 Agent 名称

#### RightPanel
- 右侧滑出面板，显示 Artifact 预览或 Agent 详情
- Agent 模式下加载 `AgentDetailContent` + 操作按钮（开始聊天、添加联系人）

#### MarkdownRenderer
- 封装 `react-markdown` + `remark-gfm`
- 自定义 `Components` 对象接管代码块、表格、链接渲染
- 代码块使用 `@agenthub/ui` 的 `CodeBlock` 组件

#### MentionPopup
- @提及自动完成浮层
- 键盘导航（上下箭头、Enter 选择、Escape 关闭）
- 自动滚动选中项到可视区域

#### CreateAgentModal / EditAgentModal
- Create: 选择 Provider（Claude/OpenCode/Custom），填写名称、System Prompt、API 配置
- Edit: 修改名称和 System Prompt，Provider 只读
- 表单验证（名称非空、Prompt 长度限制 4000）
- 工作区路径自动预览

#### AgentCard / AgentDetailContent
- Card: 头像 + 名称 + Provider + Model 的列表项
- Detail: 大尺寸头像 + 详情信息 + System Prompt 完整展示

#### TypingIndicator
- 三个弹跳圆点动画
- 显示 "AgentName PROCESSING..."

#### ThemeSwitcher / LanguageSwitcher
- Theme: 4 种颜色的圆形按钮，选中态带光环和勾选图标
- Language: EN/中文 切换按钮

#### BackgroundEffects
- Canvas 星云粒子背景 + SVG 网格覆盖
- 使用 `useNebulaCanvas` hook

---

## 7. Hooks

### useSSEStream (`hooks/useSSEStream.ts`)

```typescript
function useSSEStream(conversationId: string | null): { status: ConnectionStatus }
```

- **输入**: 当前活跃会话 ID（null 时断开）
- **输出**: 连接状态（disconnected / connecting / connected）
- **内部逻辑**:
  1. `conversationId` 变化时建立新的 SSE 连接
  2. 注册 `chunk`、`done`、`error` 事件监听
  3. 断线自动重连（指数退避，最多 5 次）
  4. `chunk` 事件 → `appendMessageChunk(data.content, data.agentId)` + `setTypingAgent`
  5. `done` 事件 → `finalizeMessage(data.messageId, data.agentId)` + 清除 typing

### useNebulaCanvas (`hooks/useNebulaCanvas.ts`)

```typescript
function useNebulaCanvas(canvasRef: RefObject<HTMLCanvasElement>): void
```

- 全功能的 Canvas 粒子动画系统：
  - **星星**: 3 层（远/中/近），闪烁 + 缓慢漂移
  - **星云**: 3 个径向渐变光晕，缓慢旋转移动
  - **视差**: 鼠标跟随效果（触摸设备支持 touchmove）
  - **自适应**: `devicePixelRatio` 适配，性能动态调节（根据 FPS 调整粒子密度）
  - **主题同步**: `MutationObserver` 监听 `data-theme` 变化，更新颜色
  - **无障碍**: 响应 `prefers-reduced-motion` 媒体查询
  - **可见性**: 监听 `visibilitychange`，不可见时暂停动画

### useRipple (`hooks/useRipple.tsx`)

```typescript
function useRipple(): { addRipple, renderRipples }
```

- 按钮点击涟漪效果
- 在 `onMouseDown` 时记录点击坐标
- 渲染绝对定位的 `span.ripple-effect`，800ms 后自动移除

---

## 8. 样式系统

### 架构

```
Tailwind 工具类 (语义化)
    │
    └── CSS 自定义属性 (主题变量)
            │
            ├── --theme-*       # 前端组件变量
            ├── --ui-*          # 共享包变量 (@agenthub/ui)
            └── data-theme 切换  # 4 套主题
```

### 主题系统

4 套完整的暗色主题，每个主题包含 ~80 个 CSS 变量：

| 主题 | data-theme | 强调色 | 风格 |
|------|-----------|--------|------|
| Green | `"green"` (默认) | `#00ff41` | Matrix 黑客风格 |
| Blue | `"blue"` | `#00b4d8` | Cyber 科技蓝 |
| Purple | `"purple"` | `#bb86fc` | Neon 霓虹紫 |
| Red | `"red"` | `#ff3333` | Inferno 地狱红 |

切换机制: `document.documentElement.setAttribute('data-theme', theme)` → CSS 选择器 `[data-theme="xxx"]` 生效

### CSS 变量分类

| 前缀 | 用途 | 示例 |
|------|------|------|
| `--theme-bg-*` | 背景色 | `--theme-bg-primary`, `--theme-bg-elevated`, `--theme-bg-glass` |
| `--theme-accent*` | 强调色 | `--theme-accent`, `--theme-accent-dim`, `--theme-accent-glow` |
| `--theme-text-*` | 文字色 | `--theme-text-primary`, `--theme-text-muted`, `--theme-text-inverse` |
| `--theme-border*` | 边框色 | `--theme-border`, `--theme-border-light`, `--theme-border-hover` |
| `--theme-bubble*` | 聊天气泡色 | `--theme-user-bubble`, `--theme-agent-bubble` |
| `--ui-*` | 共享包变量 | `--ui-color-primary`, `--ui-color-bg-user` |
| `--theme-*misc*` | 杂项 | `--theme-danger`, `--theme-glow-radial-*`, `--theme-shadow-card` |

### Tailwind 扩展

```typescript
colors: {
  theme: {
    accent, 'accent-hover', surface, elevated, border,
    'text-primary', 'text-secondary', 'text-muted',
  }
}
```

### 动画系统

| 动画 | 用途 | 时长 |
|------|------|------|
| `fade-in-up` | 面板/消息进入 | 0.5s |
| `fade-in` | 淡入 | 0.3s |
| `slide-in-right` | 侧面板滑入 | 0.3s |
| `scale-in` | Modal 缩放 | 0.2s |
| `pulse-glow` | 呼吸光效 | 2s |
| `cursor-blink` | 光标闪烁 | 1s |
| `typing-dot` | 输入指示器 | 1.4s |
| `ripple-anim` | 按钮涟漪 | 0.8s |
| `shimmer` | 加载骨架屏 | 1.5s |

### 关键 CSS 类

| 类名 | 用途 |
|------|------|
| `.card-panel` | 毛玻璃卡片（20px blur + 边框） |
| `.glass-panel` | 毛玻璃面板（24px blur） |
| `.btn-gradient` | 渐变强调色按钮 |
| `.btn-accent` | 边框强调色按钮 |
| `.btn-ghost` | 幽灵按钮 |
| `.btn-send` | 发送按钮 |
| `.sidebar-item` | 侧边栏项（hover 左边界高亮） |
| `.hover-card` | 卡片 hover 上浮效果 |
| `.hover-glow` | hover 发光效果 |
| `.noise-overlay` | 全局噪点纹理叠加层 |

---

## 9. 国际化 (i18n)

### 架构

```
lib/i18n/
├── index.ts              # 重导出
├── context.tsx           # I18nProvider + useI18n hook
└── translations/
    ├── en.ts             # 英文翻译 (189 键)
    └── zh.ts             # 中文翻译 (189 键)
```

### 类型安全

```typescript
export const en = { ... } as const;
type DeepStringify<T> = T extends string ? string : ...;
export type Translations = DeepStringify<typeof en>;
```

- `en.ts` 是权威源，`zh.ts` 必须对齐相同结构
- `t(key)` 方法返回嵌套翻译对象，TypeScript 可推导完整路径
- 支持模板函数（如 `typing.processing` 接受 Agent 名称参数）

### 翻译键层级

```
brand → name, tagline
common → loading, retry, cancel, confirm, save, edit, delete, back, systemReady, error
auth → login { title, subtitle, email, password, ... }
     → register { title, subtitle, username, email, password, ... }
sidebar → operator, exit, chat, agents, contacts, search, newSession, sessions, ...
chat → empty, directChannel, groupSession, loadingMessages, noMessages, ...
rightPanel → artifactView, agentInfo, ...
agentMarket → title, subtitle, create, allAgents, contacts, failedToLoad, ...
contacts → title, subtitle, failedToLoad, noContacts, edit, delete, ...
agentDetail → notFound, backToMarket, startChat, editModal { ... }, ...
agentInfo → model, systemPrompt, providerLabels { claude, opencode, custom }
createAgent → title, subtitle, provider, name, systemPrompt, custom*, ...
typing → processing
themes → green, blue, purple, red
lang → switchTo
```

---

## 10. 开发工具与脚本

### Dev Script (`scripts/dev.mjs`)

自定义开发服务器启动脚本：

```
读取 root .env → 提取 PORT 和 WEB_PORT
设置 NEXT_PUBLIC_API_URL = http://localhost:<PORT>
启动: npx next dev -p <WEB_PORT>
```

解决了 monorepo 中 Next.js 无法直接读取根目录 `.env` 的问题。

### 所有命令

| 命令 | 功能 |
|------|------|
| `pnpm --filter @agenthub/web dev` | dev.mjs 启动开发服务器 |
| `pnpm --filter @agenthub/web dev:clean` | dev-clean.mjs（带缓存清除） |
| `pnpm --filter @agenthub/web build` | `next build` |
| `pnpm --filter @agenthub/web start` | `next start` |
| `pnpm --filter @agenthub/web typecheck` | `tsc --noEmit` |
| `pnpm --filter @agenthub/web test` | `vitest run` |
| `pnpm --filter @agenthub/web test:watch` | `vitest` (watch) |

---

## 11. 测试策略

### 测试配置文件 (`vitest.config.ts`)

```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

### 测试文件

```
src/__tests__/
├── setup.ts                    # 测试环境初始化
├── auth-pages.test.tsx         # 登录/注册页面
├── chat-layout.test.tsx        # 聊天布局
├── chat-messages.test.tsx      # 消息渲染
├── agent-card.test.tsx         # AgentCard 组件
└── create-agent-modal.test.tsx # 创建 Agent Modal
```

---

## 12. 数据流全景

### 用户认证流

```
用户访问 /login
  │
  ├── 填写邮箱+密码 → 点击 "AUTHENTICATE"
  │
  ├── AuthProvider.login(email, password)
  │     └── api.post('/auth/login', { email, password }, { skipAuth: true })
  │           ├── 成功 → storeTokens(accessToken, refreshToken) + storeUser(user)
  │           └── 失败 → 显示错误信息
  │
  ├── router.push('/chat')
  │
  └── AuthGuard 检测 isAuthenticated === true → 渲染聊天页面
```

### 消息发送与接收流

```
用户在 ChatPanel 输入消息 → Enter
  │
  ├── ChatProvider.sendMessage(convId, content)
  │     └── api.post('/api/conversations/:id/messages/create', { content })
  │           └── 返回 Message 对象 → 追加到 messages[]
  │
  ├── 服务器收到消息 → 调用 Agent 处理
  │     └── SSE /sse/conversations/:id/stream 开始推送
  │
  ├── useSSEStream 收到 chunk 事件
  │     ├── appendMessageChunk(text, agentId) → 更新 streamingMessage
  │     └── setTypingAgent(agentId, true) → 显示 TypingIndicator
  │
  ├── useSSEStream 收到 done 事件
  │     ├── finalizeMessage(messageId, agentId)
  │     │     └── streamingMessage → 转为永久 Message → 推入 messages[]
  │     └── setTypingAgent(agentId, false) → 隐藏 TypingIndicator
  │
  └── 同时 WebSocket 推送 message_status 事件
        └── WSProvider 更新 messageStatuses
```

### 会话切换流

```
用户点击 Sidebar 中的某个会话
  │
  ├── ChatPage.onSelectConversation(convId)
  │     ├── setActiveConversationId(convId)         ← 本地状态
  │     └── ChatProvider.setActiveConversation(convId) ← Context 更新
  │
  ├── ChatProvider 检测 activeConversationId 变化
  │     └── useEffect → fetchMessages(convId)
  │           └── api.get('/api/conversations/:id/messages/list')
  │                 → setMessages(data)
  │
  ├── useSSEStream 检测 conversationId 变化
  │     ├── 断开旧 SSE 连接
  │     └── 建立新 SSE 连接
  │
  └── ChatPanel 重新渲染 (messages 变化 → 自动滚动到底部)
```

### Agent 创建流

```
用户在 Agent Market 点击 "+ CREATE"
  │
  ├── CreateAgentModal 打开
  │     ├── 选择 Provider (Claude/OpenCode/Custom)
  │     ├── 填写名称 + System Prompt
  │     ├── (可选) Custom 配置 → API URL, API Key, Model
  │     └── 点击 "DEPLOY"
  │
  ├── api.post('/api/contacts/create', { name, provider, systemPrompt, config? })
  │     └── 成功 → onCreated() → 刷新 Agent 列表
  │
  └── 新 Agent 出现在列表中
        └── 可点击进入详情 → 发起聊天/添加联系人
```

---

## 附录: 文件索引

### lib/ — 核心逻辑

| 文件 | 责任 |
|------|------|
| `api-client.ts` | HTTP 客户端, JWT 管理, token refresh |
| `auth-context.tsx` | 用户认证状态管理 |
| `theme-context.tsx` | 4 色主题系统 |
| `ws-context.tsx` | WebSocket 实时连接 |
| `chat-context.tsx` | 会话/消息/联系人状态 + 流式消息 |
| `i18n/context.tsx` | 国际化 Provider |
| `i18n/index.ts` | 重导出 |
| `i18n/translations/en.ts` | 英文翻译 |
| `i18n/translations/zh.ts` | 中文翻译 |

### components/ — UI 组件

| 文件 | 责任 |
|------|------|
| `AuthGuard.tsx` | 路由认证守卫 |
| `Sidebar.tsx` | 侧边栏(用户/导航/搜索/会话/新建) |
| `ChatPanel.tsx` | 聊天主面板(消息/输入/编辑/删除) |
| `RightPanel.tsx` | 右侧详情面板 |
| `MarkdownRenderer.tsx` | Markdown 渲染引擎 |
| `MentionPopup.tsx` | @提及浮层 |
| `TypingIndicator.tsx` | 打字指示器 |
| `AgentCard.tsx` | Agent 卡片 |
| `AgentDetailContent.tsx` | Agent 详情 |
| `CreateAgentModal.tsx` | 创建 Agent 弹窗 |
| `EditAgentModal.tsx` | 编辑 Agent 弹窗 |
| `ThemeSwitcher.tsx` | 主题切换 |
| `LanguageSwitcher.tsx` | 语言切换 |
| `BackgroundEffects.tsx` | 星云背景 |

### hooks/ — 自定义 Hooks

| 文件 | 责任 |
|------|------|
| `useSSEStream.ts` | SSE 流式响应 |
| `useNebulaCanvas.ts` | Canvas 粒子动画 |
| `useRipple.tsx` | 涟漪点击效果 |
