# Next.js 全栈能力详解

Next.js 不仅仅是一个前端框架，它通过内置的服务器端功能，使开发者能够在一个项目中完成从前端 UI 到后端逻辑的全栈开发。

## 核心全栈能力

| 能力 | 说明 |
|------|------|
| **Server Actions** | 在客户端组件中直接调用服务器端函数，简化表单提交和数据突变 |
| **Route Handlers** | 自定义 HTTP 请求处理程序（GET, POST, PUT 等），用于构建 REST API |
| **数据库集成** | 完美支持 Prisma、Drizzle、ORM 或直接连接数据库（如 PostgreSQL, MongoDB） |
| **中间件 (Middleware)** | 在请求到达路由前运行，处理身份验证、重定向和 A/B 测试 |
| **身份验证 (Auth)** | 与 NextAuth.js (Auth.js) 或 Clerk 等集成，轻松实现社交登录和 JWT |

## 1. Server Actions (现代全栈开发的核心)

Server Actions 允许你定义异步服务器函数，并直接从客户端组件中调用它们。

- **优势**: 自动处理表单提交、减少 API 端点的编写、类型安全。
- **示例**:
  ```tsx
  // app/actions.ts
  'use server'

  export async function createPost(formData: FormData) {
    const title = formData.get('title')
    // 直接操作数据库
    await db.post.create({ data: { title } })
    // 重新验证缓存，更新 UI
    revalidatePath('/posts')
  }
  ```

## 2. Route Handlers (API 开发)

如果你需要构建供外部使用的 API 或传统的 RESTful 接口，可以使用 Route Handlers。

- **文件约定**: `route.ts` 或 `route.js`。
- **示例**:
  ```typescript
  // app/api/user/route.ts
  import { NextResponse } from 'next/server'

  export async function GET() {
    const users = await db.user.findMany()
    return NextResponse.json(users)
  }
  ```

## 3. 数据库与持久化

由于 Next.js 运行在 Node.js 环境中，你可以直接在 Server Components 或 Server Actions 中引用数据库客户端。

- **推荐组合**: Next.js + Prisma/Drizzle + Supabase/PlanetScale。
- **安全性**: 服务器端代码永远不会发送到客户端，因此可以安全地存储 API 密钥和数据库凭据。

## 4. 身份验证与授权

Next.js 生态中有非常成熟的认证方案：

- **NextAuth.js (Auth.js)**: 专门为 Next.js 设计的认证库，支持 OAuth (Google, GitHub)、密码登录等。
- **中间件保护**: 使用 `middleware.ts` 可以在全局范围内拦截未授权请求。

## 5. 边缘计算与 Serverless

Next.js 支持两种服务器运行时：

1. **Node.js Runtime**: 默认运行环境，支持完整的 Node.js API。
2. **Edge Runtime**: 基于 Web API，部署在边缘节点，具有极低的延迟，适合处理地理位置相关的逻辑或轻量级 API。

## 总结

Next.js 的全栈能力消除了传统“前后端分离”带来的通信成本。通过 **Server Components** 和 **Server Actions**，开发者可以像编写前端逻辑一样编写后端代码，同时享受强大的类型安全和自动化的数据同步。
