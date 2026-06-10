# JWT 双 Token 认证流程

## 一、概念

### 两种 Token 的分工

| Token | 生命周期 | 传输方式 | 作用 |
|-------|---------|---------|------|
| **AccessToken** | 短（15 分钟） | 每次 API 请求的 `Authorization: Bearer <token>` 头 | 证明身份，访问受保护的 API 资源 |
| **RefreshToken** | 长（7 天） | 仅在 `/auth/refresh` 接口请求体中发送 | 当 AccessToken 过期时，换取新的 AccessToken |

### 类比：门禁卡和身份证

```
accessToken  =  门禁卡（15分钟有效）
refreshToken =  身份证（7天有效）

你刷门禁卡 → "滴，已过期"
        ↓
你走到前台，拿出身份证 → "帮我续一下门禁卡"
前台验证身份证 → "好的" → 给你新门禁卡
        ↓
你用新门禁卡进门
```

你不会把身份证挂在脖子上到处走（refreshToken 不随请求头发送），只有门禁卡失效时才掏身份证。

***

## 二、完整请求生命周期图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        双 Token 认证全流程                                │
└─────────────────────────────────────────────────────────────────────────┘

时间线：

T=0
┌─────┐          POST /auth/login           ┌──────┐
│客户端│ ─────── { email, password } ──────▶ │服务端│
│     │ ◀─────── { accessToken,            │      │
│     │           refreshToken }           │      │
└─────┘                                    └──────┘
   │
   ▼
将两个 token 存入 localStorage
（accessToken 用于后续请求，refreshToken 备用）


T=5min
┌─────┐   GET /api/conversations            ┌──────┐
│客户端│ ─── Authorization: Bearer <AT> ───▶ │服务端│
│     │                                      │ ① 验证 AT 签名
│     │                                      │ ② 检查是否过期
│     │                                      │ ③ 从 payload 取 userId
│     │                                      │ ④ 处理请求
│     │ ◀──────── 200 OK + data ──────────── │      │
└─────┘                                    └──────┘


T=20min (accessToken 过期)
┌─────┐   GET /api/conversations            ┌──────┐
│客户端│ ─── Authorization: Bearer <过期AT> ─▶ │服务端│
│     │                                      │ 验证 → 过期
│     │ ◀───────── 401 Unauthorized ──────── │      │
└─────┘                                    └──────┘
   │
   │ 收到 401 → 不报错，触发 refresh
   ▼
┌─────┐   POST /auth/refresh                ┌──────┐
│客户端│ ─── { refreshToken: "<RT>" } ──────▶ │服务端│
│     │                                      │ ① 验证 RT 签名
│     │                                      │ ② 检查是否过期
│     │                                      │ ③ 签发新 AT
│     │ ◀──── { accessToken: "新AT" } ────── │      │
└─────┘                                    └──────┘
   │
   │ 存下新 accessToken，重试原请求
   ▼
┌─────┐   GET /api/conversations            ┌──────┐
│客户端│ ─── Authorization: Bearer <新AT> ───▶ │服务端│
│     │                                      │ 验证通过
│     │ ◀──────── 200 OK + data ──────────── │      │
└─────┘                                    └──────┘

整个过程用户无感知 ✅
```

***

## 三、服务端职责

### 3.1 认证路由

| 路由 | 方法 | 请求体 | 响应 | 说明 |
|------|------|--------|------|------|
| `/auth/register` | POST | `{ email, name, password }` | `201 { user, accessToken, refreshToken }` | 注册新用户 |
| `/auth/login` | POST | `{ email, password }` | `200 { user, accessToken, refreshToken }` | 登录 |
| `/auth/refresh` | POST | `{ refreshToken }` | `200 { accessToken }` | 刷新访问令牌 |

### 3.2 注册流程

```
Request: POST /auth/register { email, name, password }
                │
                ▼
        ① 验证输入格式
           ├─ email 是否合法
           ├─ password 长度 ≥ 8
           └─ name 非空
                │
                ▼
        ② 检查邮箱是否已注册
           ├─ findUserByEmail(email)
           └─ 已存在 → 409 Conflict
                │
                ▼
        ③ 密码哈希
           └─ bcryptjs.hash(password, 10)
                │
                ▼
        ④ 创建用户
           └─ createUser({ name, email, passwordHash })
                │
                ▼
        ⑤ 签发票据
           ├─ signAccessToken({ userId })
           └─ signRefreshToken({ userId, jti })
                │
                ▼
        ⑥ 201 { user: { id, name, email }, accessToken, refreshToken }
```

### 3.3 登录流程

```
Request: POST /auth/login { email, password }
                │
                ▼
        ① 查找用户
           └─ findUserByEmail(email)
           └─ 不存在 → 401 Unauthorized
                │
                ▼
        ② 比对密码
           └─ bcryptjs.compare(password, user.passwordHash)
           └─ 不匹配 → 401 Unauthorized
                │
                ▼
        ③ 签发票据
           ├─ signAccessToken({ userId })
           └─ signRefreshToken({ userId, jti })
                │
                ▼
        ④ 200 { user: { id, name, email }, accessToken, refreshToken }
```

### 3.4 刷新流程

```
Request: POST /auth/refresh { refreshToken }
                │
                ▼
        ① 验证 refreshToken
           └─ jwt.verify(refreshToken, JWT_REFRESH_SECRET)
           └─ 无效/过期 → 401 Unauthorized
                │
                ▼
        ② 查找用户是否仍存在
           └─ findUserById(payload.userId)
           └─ 不存在 → 401 Unauthorized
                │
                ▼
        ③ 签发新 accessToken（refreshToken 不变）
           └─ signAccessToken({ userId: payload.userId })
                │
                ▼
        ④ 200 { accessToken: "新token" }
```

### 3.5 JWT 认证中间件

所有 `/api/*` 受保护路由的 preHandler hook：

```
Request → Authorization: Bearer <accessToken>
                │
                ▼
        ① 提取 token
           ├─ 从 Authorization header 取 Bearer token
           └─ 缺失 → 401 { error: "missing_token" }
                │
                ▼
        ② 验证 accessToken
           └─ jwt.verify(token, JWT_ACCESS_SECRET)
           └─ 无效/过期 → 401 { error: "invalid_token" }
                │
                ▼
        ③ 注入 userId 到 request
           └─ request.userId = payload.userId
                │
                ▼
        ④ 放行到路由处理器
```

### 3.6 Token 数据结构

```typescript
// AccessToken payload
interface AccessTokenPayload {
  userId: string;       // 用户 ID
  iat: number;          // 签发时间
  exp: number;          // 过期时间（15 分钟后）
}

// RefreshToken payload
interface RefreshTokenPayload {
  userId: string;       // 用户 ID
  jti: string;          // 唯一标识（用于后续撤销）
  iat: number;          // 签发时间
  exp: number;          // 过期时间（7 天后）
}
```

***

## 四、客户端职责

### 4.1 存储策略

```typescript
// 登录成功后
function onLoginSuccess({ accessToken, refreshToken }: Tokens) {
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
  // 注意：refreshToken 只在这里存起来，
  //       不会出现在后续 API 请求的 header 中
}
```

### 4.2 请求拦截器逻辑

```typescript
// 封装 fetch，自动处理 401 → refresh → 重试
async function apiRequest(url: string, options?: RequestInit) {
  // 1. 从 storage 取出 accessToken，挂到 header
  const headers = new Headers(options?.headers);
  const accessToken = localStorage.getItem("accessToken");
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  // 2. 发送请求
  let res = await fetch(url, { ...options, headers });

  // 3. 如果返回 401，尝试 refresh
  if (res.status === 401 && !url.includes("/auth/refresh")) {
    const refreshToken = localStorage.getItem("refreshToken");

    if (refreshToken) {
      // 4. 调用 refresh 接口换新 token
      const refreshRes = await fetch("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (refreshRes.ok) {
        const { accessToken: newToken } = await refreshRes.json();
        localStorage.setItem("accessToken", newToken);

        // 5. 用新 token 重试原请求
        headers.set("Authorization", `Bearer ${newToken}`);
        res = await fetch(url, { ...options, headers });
      } else {
        // refreshToken 也过期了 → 清除 token，跳转登录
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        window.location.href = "/login";
        return;
      }
    }
  }

  return res;
}
```

### 4.3 使用方式

```typescript
// 业务代码只需正常调用，不需要关心 token 逻辑
const data = await apiRequest("/api/conversations");
// 401 自动 refresh、自动重试，对业务代码完全透明
```

***

## 五、完整时序图

```
客户端                         服务端
  │                              │
  │── POST /auth/login ──────────│
  │   { email, password }        │
  │                              │── 验证凭据
  │◀─── { accessToken,          │
  │       refreshToken }         │
  │                              │
  │  存下两个 token               │
  │                              │
  │── GET /api/xxx ──────────────│
  │   Authorization: Bearer <AT> │
  │                              │── 验证 AT → 通过 → 处理
  │◀──── 200 OK ────────────────│
  │                              │
  │   ...时间流逝... (AT 过期)     │
  │                              │
  │── GET /api/xxx ──────────────│
  │   Authorization: Bearer <AT> │
  │                              │── 验证 AT → 过期
  │◀──── 401 Unauthorized ──────│
  │                              │
  │  触发 refresh:               │
  │── POST /auth/refresh ────────│
  │   { refreshToken }           │
  │                              │── 验证 RT → 通过
  │◀─── { accessToken: "新AT" } ─│
  │                              │
  │  用新 AT 重试原请求:           │
  │── GET /api/xxx ──────────────│
  │   Authorization: Bearer <新AT>│
  │                              │── 验证 AT → 通过 → 处理
  │◀──── 200 OK ────────────────│
  │                              │
```

***

## 六、常见问题

### Q: refreshToken 为什么不通过 header 发送？

因为 refreshToken 只在 `/auth/refresh` 这一个接口使用，不随其他请求传输。放在请求体（JSON body）中发送，避免暴露在 Authorization header 里被中间代理或日志记录。

### Q: accessToken 过期但 refreshToken 未过期，这期间用户操作会中断吗？

不会。401 对用户完全透明：

1. 用户操作触发 API 请求
2. 请求返回 401
3. 前端拦截器**同步地**完成 refresh → 重试
4. 用户看到的是正常结果

### Q: 如果两个 token 都过期了怎么办？

前端跳转到登录页，用户需要重新登录。

### Q: 如何让某个用户强制下线（比如修改密码后）？

- **accessToken**：无法主动撤销（无状态 JWT），只能等它自然过期
- **refreshToken**：可以在服务端维护一个黑名单 `Set<jti>`，refresh 时检查该 jti 是否已被撤销

所以"修改密码后撤销所有 token"的流程是：记录新黑名单条目 → 用户的旧 refreshToken 下次 refresh 时被拒绝 → 需要重新登录。
