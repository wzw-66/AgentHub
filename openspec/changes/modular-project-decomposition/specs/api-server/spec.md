## 新增需求

### 需求：Fastify 服务器初始化
`server` 应用应初始化一个 Fastify 服务器，包含 CORS、JWT 认证和 JSON 解析。

#### 场景：服务器在配置端口启动
- **当** 服务器启动
- **则** 应在 `PORT` 环境变量指定的端口上监听（默认 3001）

#### 场景：CORS 已启用
- **当** 来自不同源的请求发出
- **则** 服务器应返回适当的 CORS 头

### 需求：Agent API 路由
服务器应为 Agent 管理提供 RESTful 端点。

#### 场景：列出所有 Agent
- **当** 调用 `GET /api/agents`
- **则** 应返回可用 Agent 的数组

#### 场景：创建自定义 Agent
- **当** 使用有效请求体调用 `POST /api/agents`
- **则** 应创建新的自定义 Agent 并返回 `201` 状态码

#### 场景：获取 Agent 详情
- **当** 调用 `GET /api/agents/:id`
- **则** 应返回 Agent 详情

### 需求：联系人 API 路由
服务器应为联系人管理提供 RESTful 端点。

#### 场景：列出联系人
- **当** 调用 `GET /api/contacts`
- **则** 应返回用户的联系人列表

#### 场景：添加联系人
- **当** 使用 `agentId` 调用 `POST /api/contacts`
- **则** 应创建新联系人并返回 `201` 状态码

#### 场景：更新联系人
- **当** 使用更新字段调用 `PATCH /api/contacts/:id`
- **则** 应更新联系人

#### 场景：删除联系人
- **当** 调用 `DELETE /api/contacts/:id`
- **则** 应删除联系人

### 需求：会话 API 路由
服务器应为会话管理提供 RESTful 端点。

#### 场景：列出会话
- **当** 调用 `GET /api/conversations`
- **则** 应返回用户的会话列表

#### 场景：创建会话
- **当** 使用 `title` 和 `contactIds` 调用 `POST /api/conversations`
- **则** 应创建新会话并返回 `201` 状态码

#### 场景：获取会话
- **当** 调用 `GET /api/conversations/:id`
- **则** 应返回会话详情及最近消息

### 需求：消息 API 路由
服务器应为消息发送和检索提供 RESTful 端点。

#### 场景：发送消息
- **当** 使用内容调用 `POST /api/conversations/:id/messages`
- **则** 应保存消息并返回 Agent 响应的 SSE 流

#### 场景：分页列出消息
- **当** 使用 `cursor` 和 `limit` 调用 `GET /api/conversations/:id/messages`
- **则** 应返回分页消息

#### 场景：置顶消息
- **当** 调用 `POST /api/conversations/:id/messages/:messageId/pin`
- **则** 消息的 `isPinned` 应切换

### 需求：产物 API 路由
服务器应提供检索 Agent 产物的端点。

#### 场景：获取产物
- **当** 调用 `GET /api/artifacts/:id`
- **则** 应返回产物详情

#### 场景：获取产物预览
- **当** 调用 `GET /api/artifacts/:id/preview`
- **则** 应返回产物预览内容

### 需求：凭据 API 路由
服务器应提供管理用户 API 凭据的端点。

#### 场景：列出凭据
- **当** 调用 `GET /api/credentials`
- **则** 应返回用户保存的 API 密钥列表

#### 场景：添加凭据
- **当** 使用 `provider` 和 `encryptedKey` 调用 `POST /api/credentials`
- **则** 应保存凭据并返回 `201` 状态码

#### 场景：删除凭据
- **当** 调用 `DELETE /api/credentials/:id`
- **则** 应删除凭据
