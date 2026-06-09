const posts = [
    {
        id: 'getting-started',
        title: '开始使用 JavaScript 现代开发工具链',
        date: '2026-06-09',
        tags: ['JavaScript', '前端', '工具链'],
        excerpt: '现代 JavaScript 开发已经远不止一个浏览器和文本编辑器。本文将带你了解当前最流行的开发工具链配置...',
        content: `
            <h3>为什么需要工具链？</h3>
            <p>随着前端应用的复杂度不断提升，现代 JavaScript 开发已经离不开各种工具的支持。从模块打包、代码转换到自动化测试，一个完善的工具链能大幅提升开发效率。</p>

            <h3>核心工具</h3>
            <p><strong>Vite</strong> — 基于 ES Module 的构建工具，开发服务器启动速度极快，热更新几乎即时。</p>
            <p><strong>TypeScript</strong> — 为 JavaScript 添加静态类型检查，在编译阶段捕获潜在错误，提升代码质量和可维护性。</p>
            <p><strong>ESLint + Prettier</strong> — 代码规范和格式化工具的组合，确保团队代码风格一致。</p>

            <h3>示例配置</h3>
            <pre><code>// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 }
})</code></pre>

            <h3>总结</h3>
            <p>选择合适的工具链能让你事半功倍。建议从简单的配置开始，逐步根据项目需求添加更多工具。</p>
        `
    },
    {
        id: 'css-grid',
        title: 'CSS Grid 布局完全指南',
        date: '2026-06-07',
        tags: ['CSS', '布局', '前端'],
        excerpt: 'CSS Grid 是当今最强大的布局系统之一。本文从基础概念到实战技巧，全面覆盖 Grid 布局的核心知识点...',
        content: `
            <h3>什么是 CSS Grid？</h3>
            <p>CSS Grid Layout 是一个二维布局系统，可以同时处理行和列。与 Flexbox 的一维布局不同，Grid 更适合构建复杂的页面布局。</p>

            <h3>基础概念</h3>
            <p><strong>容器 (Container)</strong> — 通过 <code>display: grid</code> 创建的网格容器。</p>
            <p><strong>网格线 (Grid Lines)</strong> — 构成网格结构的分界线。</p>
            <p><strong>网格单元 (Grid Cell)</strong> — 相邻网格线之间的空间。</p>

            <h3>实用示例</h3>
            <pre><code>.container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  grid-template-areas:
    "header header header"
    "sidebar main main"
    "footer footer footer";
}</code></pre>

            <h3>何时选择 Grid vs Flexbox</h3>
            <p>当你需要在两个维度上控制布局时，选择 Grid。当内容决定布局（而非布局决定内容）时，选择 Flexbox。</p>
        `
    },
    {
        id: 'terminal-productivity',
        title: '终端效率提升技巧 10 则',
        date: '2026-06-04',
        tags: ['终端', '效率', '工具'],
        excerpt: '命令行是开发者最强大的工具之一。分享 10 个能显著提升日常终端使用效率的实用技巧...',
        content: `
            <h3>1. 别名 (Alias)</h3>
            <p>为常用命令设置简短别名，节省大量输入时间。</p>
            <pre><code>alias gs="git status"
alias gp="git push"
alias ..="cd .."</code></pre>

            <h3>2. 历史搜索</h3>
            <p>使用 <code>Ctrl+R</code> 进行反向搜索历史命令，再也不用重复输入长命令。</p>

            <h3>3. 管道组合</h3>
            <p>将多个命令通过管道组合，完成复杂操作：</p>
            <pre><code># 找出最大的 5 个文件
du -sh * | sort -rh | head -5</code></pre>

            <h3>4. 快捷键</h3>
            <p><code>Ctrl+A</code> 跳到行首，<code>Ctrl+E</code> 跳到行尾，<code>Ctrl+U</code> 清除当前行。</p>

            <h3>5. 终端复用器</h3>
            <p>使用 tmux 或 screen 管理多个会话，保持工作状态不中断。</p>
        `
    },
    {
        id: 'rest-api-design',
        title: 'RESTful API 设计最佳实践',
        date: '2026-05-28',
        tags: ['后端', 'API', '架构'],
        excerpt: '设计一套好的 RESTful API 需要兼顾一致性、可扩展性和开发者体验。本文总结了一些经过实践检验的设计原则...',
        content: `
            <h3>资源命名</h3>
            <p>使用名词复数形式表示资源，使用 HTTP 方法表示操作：</p>
            <pre><code>GET    /users        # 列出用户
POST   /users        # 创建用户
GET    /users/:id    # 获取单个用户
PUT    /users/:id    # 更新用户
DELETE /users/:id    # 删除用户</code></pre>

            <h3>版本控制</h3>
            <p>通过 URL 前缀或请求头进行版本控制，推荐使用 URL 前缀方式：<code>/api/v1/users</code></p>

            <h3>错误处理</h3>
            <p>返回一致的错误响应格式：</p>
            <pre><code>{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "未找到指定用户",
    "details": { "userId": "abc-123" }
  }
}</code></pre>

            <h3>分页</h3>
            <p>对于列表接口，始终支持分页，使用 cursor 或 offset 模式。</p>
        `
    },
    {
        id: 'web-performance',
        title: '前端性能优化实战',
        date: '2026-05-20',
        tags: ['性能', '前端', '优化'],
        excerpt: '页面加载速度直接影响用户体验和业务指标。本文分享几个经过实际项目验证的前端性能优化策略...',
        content: `
            <h3>核心指标 (Core Web Vitals)</h3>
            <p>Google 将 LCP、FID 和 CLS 作为衡量用户体验的核心指标。优化这些指标能直接提升页面排名和用户满意度。</p>

            <h3>图片优化</h3>
            <p>使用 WebP/AVIF 格式、懒加载和响应式图片：</p>
            <pre><code>&lt;img src="photo.webp"
     loading="lazy"
     srcset="photo-400.webp 400w, photo-800.webp 800w"
     sizes="(max-width: 600px) 400px, 800px"&gt;</code></pre>

            <h3>代码分割</h3>
            <p>使用动态 import 将代码拆分为更小的 chunk，按需加载。</p>

            <h3>缓存策略</h3>
            <p>合理设置 HTTP 缓存头，使用 Service Worker 实现离线可用。</p>
        `
    }
];

function renderPosts() {
    const container = document.getElementById('post-list');
    if (!container) return;

    container.innerHTML = posts.map(post => `
        <article class="post-card" onclick="location.href='post.html?id=${post.id}'">
            <div class="date">${post.date}</div>
            <h3><a href="post.html?id=${post.id}">${post.title}</a></h3>
            <p class="excerpt">${post.excerpt}</p>
            <div class="tags">
                ${post.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
        </article>
    `).join('');
}

function renderPostDetail() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const post = posts.find(p => p.id === id);

    const container = document.getElementById('post-detail');
    if (!container) return;

    if (!post) {
        container.innerHTML = `
            <div class="post-detail">
                <h2>文章未找到</h2>
                <p>抱歉，没有找到对应的文章。</p>
                <a href="index.html" class="back-link">← 返回首页</a>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <article class="post-detail">
            <h2>${post.title}</h2>
            <div class="meta">${post.date} · ${post.tags.join(' / ')}</div>
            <div class="content">${post.content}</div>
            <a href="index.html" class="back-link">← 返回首页</a>
        </article>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    renderPosts();
    renderPostDetail();
});
