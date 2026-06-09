// ===== Simple Router & Renderer =====

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function renderPosts() {
    const container = document.getElementById('posts-container');
    container.innerHTML = posts.map(post => `
        <article class="post-card" onclick="navigate('post', '${post.id}')">
            <div class="post-card-meta">
                <time>${formatDate(post.date)}</time>
                <span class="post-card-tag">${post.tags[0]}</span>
            </div>
            <h2>${post.title}</h2>
            <p>${post.summary}</p>
        </article>
    `).join('');
}

function renderPostDetail(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) {
        document.getElementById('app').innerHTML = `
            <div class="post-detail">
                <a class="back-btn" onclick="navigate('home')">← 返回首页</a>
                <h1>文章未找到</h1>
                <p style="color: var(--text-secondary);">抱歉，找不到该文章。</p>
            </div>
        `;
        return;
    }

    document.getElementById('app').innerHTML = `
        <article class="post-detail">
            <a class="back-btn" onclick="navigate('home')">← 返回首页</a>
            <header class="post-detail-header">
                <div class="meta">
                    <time>${formatDate(post.date)}</time>
                    ${post.tags.map(t => `<span class="post-card-tag">${t}</span>`).join('')}
                </div>
                <h1>${post.title}</h1>
                <p style="color: var(--text-secondary);">${post.summary}</p>
            </header>
            <div class="post-detail-content">
                ${post.content}
            </div>
        </article>
    `;
}

function renderAbout() {
    document.getElementById('app').innerHTML = `
        <div class="about-page">
            <a class="back-btn" onclick="navigate('home')">← 返回首页</a>
            <h1>关于我</h1>
            <p>你好！我是这个博客的主人。一名热爱技术的开发者，专注于 Web 全栈开发。</p>
            <p>这个博客是我记录技术学习、项目经验和生活思考的地方。希望通过分享，能与更多志同道合的朋友交流。</p>
            <h2 style="font-size:1.3rem; margin-top:2em; font-weight:600;">联系我</h2>
            <p>如果你有任何问题或建议，欢迎通过以下方式联系我：</p>
            <ul>
                <li>GitHub: github.com/example</li>
                <li>Email: hello@example.com</li>
            </ul>
        </div>
    `;
}

// ===== Router =====
function navigate(page, param) {
    // Update nav
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    if (page === 'home') {
        document.querySelector('.nav-link:first-child').classList.add('active');
    } else if (page === 'about') {
        document.querySelectorAll('.nav-link')[1].classList.add('active');
    }

    // Render
    if (page === 'home') renderPosts();
    else if (page === 'post') renderPostDetail(param);
    else if (page === 'about') renderAbout();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    // Handle nav clicks
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const href = link.getAttribute('href');
            if (href === '/') navigate('home');
            else if (href === '/about') navigate('about');
        });
    });

    // Render home
    navigate('home');
});
