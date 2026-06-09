// Blog posts data
const posts = [
    {
        id: 'hello-world',
        title: 'Hello World — 我的第一篇博客',
        date: '2026-06-09',
        tags: ['生活', '随笔'],
        summary: '终于开始写博客了！这是一个全新的开始，记录技术、生活和思考的点滴。',
        content: `
            <p>终于，我开始了自己的博客之旅。</p>
            <p>一直以来都想找一个地方记录自己的想法、学习心得和技术踩坑经历。今天终于迈出了这一步。</p>
            <h2>为什么写博客？</h2>
            <p>写博客对我来说有几个意义：</p>
            <ul>
                <li><strong>知识沉淀</strong> — 把学到的东西写下来，是最好的复习方式</li>
                <li><strong>分享交流</strong> — 也许我的经验能帮助到其他人</li>
                <li><strong>记录成长</strong> — 回头看自己写的东西，能看到进步的过程</li>
            </ul>
            <h2>关于这个博客</h2>
            <p>这个博客会涵盖以下内容：</p>
            <ul>
                <li>技术文章和教程</li>
                <li>项目开发经验分享</li>
                <li>读书笔记和思考</li>
                <li>生活随笔</li>
            </ul>
            <p>希望能坚持写下去！🚀</p>
        `
    },
    {
        id: 'getting-started-with-typescript',
        title: 'TypeScript 入门指南',
        date: '2026-06-08',
        tags: ['技术', 'TypeScript'],
        summary: 'TypeScript 是现代前端开发的必备技能。本文带你快速了解 TypeScript 的核心概念。',
        content: `
            <p>TypeScript 是 JavaScript 的超集，它添加了静态类型系统。近年来已经成为大型前端项目的标配。</p>
            <h2>为什么选择 TypeScript？</h2>
            <p>相比 JavaScript，TypeScript 有以下优势：</p>
            <ul>
                <li><strong>类型安全</strong> — 在编译时捕获错误，减少运行时 bug</li>
                <li><strong>更好的开发体验</strong> — 编辑器自动补全、重构支持</li>
                <li><strong>自文档化</strong> — 类型定义本身就是文档</li>
            </ul>
            <h2>快速开始</h2>
            <p>安装 TypeScript 编译器：</p>
            <pre><code>npm install -g typescript</code></pre>
            <p>创建一个简单的类型示例：</p>
            <pre><code>interface User {\n  name: string;\n  age: number;\n  email?: string;\n}\n\nfunction greet(user: User): string {\n  return \`你好，\${user.name}！\`;\n}</code></pre>
            <h2>核心概念</h2>
            <p>TypeScript 的核心包括：类型注解、接口、泛型、联合类型、类型守卫等。掌握这些概念，就能充分发挥 TypeScript 的威力。</p>
        `
    },
    {
        id: 'building-with-fastify',
        title: '使用 Fastify 构建高性能 API',
        date: '2026-06-07',
        tags: ['技术', 'Node.js', 'Fastify'],
        summary: 'Fastify 是 Node.js 生态中最快的 Web 框架之一。本文介绍如何使用 Fastify 构建 RESTful API。',
        content: `
            <p>Fastify 是一个高性能的 Node.js Web 框架，以其速度和插件生态系统著称。</p>
            <h2>为什么 Fastify？</h2>
            <ul>
                <li><strong>性能</strong> — 基准测试中比 Express 快 2-3 倍</li>
                <li><strong>插件系统</strong> — 模块化、可扩展的架构</li>
                <li><strong>Schema 验证</strong> — 内置请求/响应验证</li>
                <li><strong>TypeScript 支持</strong> — 一流的类型支持</li>
            </ul>
            <h2>基本示例</h2>
            <pre><code>import Fastify from 'fastify';\n\nconst app = Fastify({ logger: true });\n\napp.get('/api/hello', async (request, reply) => {\n  return { message: 'Hello World' };\n});\n\nawait app.listen({ port: 3000 });</code></pre>
            <h2>总结</h2>
            <p>Fastify 是一个现代化的 Node.js 框架，适合构建高性能的 API 服务。如果你正在寻找 Express 的替代方案，Fastify 值得一试。</p>
        `
    },
    {
        id: 'clean-code-principles',
        title: '代码整洁之道：原则与实践',
        date: '2026-06-06',
        tags: ['技术', '最佳实践'],
        summary: '整洁的代码不仅让自己舒服，更是对团队负责。分享一些实用的代码整洁原则。',
        content: `
            <p>"写代码是给人看的，顺便能在机器上运行。" — Harold Abelson</p>
            <h2>命名规范</h2>
            <p>好的命名让代码自解释：</p>
            <ul>
                <li>变量名用名词，函数名用动词</li>
                <li>避免缩写，除非是通用缩写</li>
                <li>布尔值用 is/has/should 开头</li>
            </ul>
            <h2>函数设计</h2>
            <p>函数应该短小、专注、单一职责：</p>
            <ul>
                <li>一个函数只做一件事</li>
                <li>参数尽量少（不超过 3 个）</li>
                <li>没有副作用</li>
            </ul>
            <h2>注释的艺术</h2>
            <p>好代码不需要太多注释——代码本身就应该表达意图。注释应该解释"为什么"，而不是"是什么"。</p>
            <blockquote>任何傻瓜都能写出计算机能理解的代码。优秀的程序员写的是人类能理解的代码。</blockquote>
        `
    },
    {
        id: 'reading-notes-2026',
        title: '2026 上半年读书总结',
        date: '2026-06-01',
        tags: ['阅读', '生活'],
        summary: '上半年读了 12 本书，分享一下我的阅读清单和感悟。',
        content: `
            <p>2026 年已经过半，来回顾一下这半年的阅读之旅。</p>
            <h2>技术类</h2>
            <ul>
                <li><strong>《设计数据密集型应用》</strong> — 分布式系统的经典之作，常读常新</li>
                <li><strong>《重构：改善既有代码的设计》</strong> — 学习如何在不改变行为的前提下改善代码</li>
            </ul>
            <h2>非技术类</h2>
            <ul>
                <li><strong>《原子习惯》</strong> — 微小的改变带来巨大的成果</li>
                <li><strong>《思考，快与慢》</strong> — 了解思维的两种模式</li>
            </ul>
            <h2>阅读心得</h2>
            <p>坚持每天阅读 30 分钟，半年下来竟然读了 12 本书。这是一个让我感到充实的习惯。下半年继续加油！</p>
        `
    }
];
