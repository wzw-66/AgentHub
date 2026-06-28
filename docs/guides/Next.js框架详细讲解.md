# Next.js 框架详细讲解

Next.js 是一个由 Vercel 开发的开源 React 框架，它为 React 应用提供了生产环境所需的功能，如服务器端渲染 (SSR)、静态生成 (SSG)、基于文件的路由、数据获取优化等。

## 核心特性

| 特性 | 说明 |
|------|------|
| **App Router** | 基于 React Server Components 的现代路由系统，支持嵌套布局、加载状态和错误处理 |
| **渲染模式** | 支持 SSR (服务器渲染)、SSG (静态生成)、ISR (增量静态再生) 和 CSR (客户端渲染) |
| **数据获取** | 在服务器端使用 `fetch`，支持缓存、重新验证和流式传输 |
| **优化能力** | 内置图片 (`next/image`)、字体 (`next/font`) 和脚本优化 |
| **中间件 (Middleware)** | 在请求完成前运行代码，支持重定向、重写和身份验证 |
| **TypeScript 支持** | 完善的 TypeScript 集成，提供更好的开发体验 |

## 渲染模式对比

Next.js 的强大之处在于可以针对每个页面选择最合适的渲染策略：

1. **静态生成 (SSG - Static Site Generation)**
   - **原理**: 在构建时 (Build Time) 生成 HTML。
   - **场景**: 博客、文档、营销页面（内容不经常变动）。
   - **优点**: 性能极佳，可托管在 CDN。

2. **服务器端渲染 (SSR - Server-side Rendering)**
   - **原理**: 每次请求时在服务器端动态生成 HTML。
   - **场景**: 需要实时数据的页面（个人账户页、搜索结果）。
   - **优点**: 确保数据最新，有利于 SEO。

3. **增量静态再生 (ISR - Incremental Static Regeneration)**
   - **原理**: 在后台增量更新静态页面，无需重新构建整个应用。
   - **场景**: 大型电商、新闻网站。
   - **优点**: 结合了 SSG 的性能和 SSR 的实时性。

4. **客户端渲染 (CSR - Client-side Rendering)**
   - **原理**: 浏览器下载 JavaScript 并生成 DOM。
   - **场景**: 强交互、无需 SEO 的仪表盘、后台管理系统。

## App Router 与文件路由

Next.js 使用文件系统来定义路由。在 `app` 目录下：

- `layout.js`: 定义多个页面共享的 UI（如导航栏）。
- `page.js`: 定义该路由对应的唯一 UI。
- `loading.js`: 定义 Suspense 加载状态。
- `error.js`: 定义错误边界。
- `not-found.js`: 定义 404 页面。

## 数据获取 (Data Fetching)

在 App Router 中，建议在 **Server Components** 中直接使用 `async/await` 获取数据：

```tsx
async function getData() {
  const res = await fetch('https://api.example.com/...')
  // 这里的 fetch 会被 Next.js 自动扩展，支持缓存
  return res.json()
}

export default async function Page() {
  const data = await getData()
  return <main>{/* 使用数据 */}</main>
}
```

## 部署与生态

- **Vercel**: Next.js 的原生部署平台，提供零配置部署、全球 CDN 和边缘计算。
- **自托管**: 可以通过 `next start` 运行在任何支持 Node.js 的服务器上，或使用 Docker 部署。

## 总结

Next.js 不仅仅是一个 React 框架，它提供了一整套 Web 开发的最佳实践，让开发者能够专注于业务逻辑，而无需过多担心构建配置、性能优化和 SEO。
