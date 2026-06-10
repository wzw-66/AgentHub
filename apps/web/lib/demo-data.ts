// ─── Demo Mode Static Data ──────────────────────────────────────────────
//
// Contains all hardcoded message content, file tree data, and timing
// configuration for the group-chat orchestration demo.

// ─── Trigger ────────────────────────────────────────────────────────────

export const DEMO_TRIGGER =
  "帮我写一个个人博客网站，包含首页、文章列表和关于页面";

// ─── Phases ─────────────────────────────────────────────────────────────

export type DemoPhase =
  | null // not in demo
  | "analyzing" // Orchestrator 分析中
  | "intro" // 意图分析
  | "decompose" // 任务分解
  | "agent_1" // Agent 1 writing homepage
  | "agent_2" // Agent 2 writing articles
  | "agent_3" // Agent 3 writing about page
  | "interact" // waiting for user response
  | "aggregate" // aggregating results
  | "done"; // demo complete

export const DAG_NODES = [
  { key: "analyzing", label: "Orchestrator 分析中" },
  { key: "intro", label: "意图分析" },
  { key: "decompose", label: "任务分解" },
  { key: "agent_1", label: "Agent: 首页" },
  { key: "agent_2", label: "Agent: 文章列表" },
  { key: "agent_3", label: "Agent: 关于页" },
  { key: "aggregate", label: "结果聚合" },
] as const;

// ─── Timing (ms from sequence start) ────────────────────────────────────

export const DEMO_TIMING = {
  showDag: 600,
  phaseAnalyzing: 2000,      // Orchestrator 分析 2s
  phaseIntro: 5000,          // 意图分析（2s + 3s）
  phaseDecompose: 8000,      // 任务分解（2s + 6s）
  finishAgent1: 20500,       // 8 chunks × 1500ms + 余量
  finishAgent2: 27000,       // 4 chunks × 1500ms + 余量
  finishAgent3: 32000,       // 3 chunks × 1500ms + 余量
  showInteraction: 34000,    // (保留, 实际由 summary 时长动态决定)
};

// ─── Interaction Card ───────────────────────────────────────────────────

export const INTERACTION = {
  prompt: "🎨 我想确认一下：你对博客的主色调偏好是什么？",
  options: [
    { label: "深色主题 (紫色调)", description: "深色背景 + 紫色强调色" },
    { label: "浅色主题 (蓝色调)", description: "浅色背景 + 蓝色强调色" },
  ],
};

// ─── Agent Message Content (by role index) ─────────────────────────────
//
// These are assigned to agents in order of the group conversation members.
// Role 0 → first agent in the group, Role 1 → second, Role 2 → third.

/** Role 0: Homepage with hero animation + style */
export const AGENT_1_CHUNKS = [
  '好的，我来搭建首页。先构建 Hero 区域——用深色渐变背景制造沉浸感，中间放置博客标题和简短介绍，CTA 按钮引导用户浏览文章。导航栏固定在 Hero 下方，包含三个页面入口。\n\n',
  `~~~artifact:code:index.html~~~
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>我的个人博客</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="hero" id="hero">
    <canvas id="bgCanvas"></canvas>
    <div class="hero-content">
      <h1>探索·思考·创造</h1>
      <p class="subtitle">用文字记录技术成长的每一步</p>
      <button class="cta-btn" onclick="document.getElementById('articles').scrollIntoView({behavior:'smooth'})">
        开始阅读 →
      </button>
    </div>
  </header>
  <nav class="navbar">
    <a href="index.html" class="active">首页</a>
    <a href="articles/index.html">文章</a>
    <a href="about/index.html">关于</a>
  </nav>
  <section id="articles" class="preview-section">
    <h2>最新文章</h2>
    <div class="preview-grid">
      <div class="preview-card"><h3>TypeScript 5.0 新特性</h3><span class="tag">TypeScript</span></div>
      <div class="preview-card"><h3>DAG 调度算法</h3><span class="tag">架构</span></div>
      <div class="preview-card"><h3>React Server Components</h3><span class="tag">React</span></div>
    </div>
  </section>
  <footer><p>© 2025 My Blog · Built with AgentHub</p></footer>
  <script src="hero-animation.js"></script>
</body>
</html>
~~~artifact:end:code~~~\n\n`,
  '\n接下来定义全局样式表。浅色主题，Inter 字体保证可读性；Hero 用 `linear-gradient` 深蓝渐变；文章预览卡片悬浮时有上浮阴影效果。动画用 `@keyframes fadeUp` 实现渐入上浮动效。\n\n',
  `~~~artifact:code:style.css~~~
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', -apple-system, sans-serif; background: #f8f9fa; color: #333; }
.hero {
  height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  position: relative; overflow: hidden;
}
#bgCanvas { position: absolute; inset: 0; }
.hero-content { text-align: center; z-index: 1; }
.hero-content h1 {
  font-size: clamp(2rem, 5vw, 3.5rem); color: #fff; font-weight: 700;
  letter-spacing: -2px; opacity: 0; animation: fadeUp 0.8s ease 0.3s forwards;
}
.subtitle {
  font-size: clamp(0.9rem, 2vw, 1.2rem); color: rgba(255,255,255,0.6);
  margin-top: 12px; opacity: 0; animation: fadeUp 0.8s ease 0.6s forwards;
}
.cta-btn {
  margin-top: 28px; padding: 12px 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.1); color: #fff; font-size: 1rem; cursor: pointer;
  backdrop-filter: blur(4px); transition: all 0.3s; opacity: 0; animation: fadeUp 0.8s ease 0.9s forwards;
}
.cta-btn:hover { background: rgba(255,255,255,0.2); transform: translateY(-2px); }
.navbar { display: flex; gap: 24px; padding: 16px 48px; background: #fff; border-bottom: 1px solid #eee; }
.navbar a { text-decoration: none; color: #666; font-size: 14px; font-weight: 500; transition: color 0.2s; }
.navbar a.active { color: #7c3aed; } .navbar a:hover { color: #333; }
.preview-section { padding: 60px 48px; max-width: 1000px; margin: 0 auto; }
.preview-section h2 { font-size: 1.5rem; margin-bottom: 24px; }
.preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.preview-card {
  padding: 24px; background: #fff; border-radius: 12px; border: 1px solid #eee;
  transition: transform 0.2s, box-shadow 0.2s; cursor: pointer;
}
.preview-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
.tag { display: inline-block; padding: 2px 10px; border-radius: 4px; background: #f3e8ff; color: #7c3aed; font-size: 12px; margin-top: 8px; }
footer { text-align: center; padding: 32px; color: #999; font-size: 13px; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
~~~artifact:end:code~~~\n\n`,
  '\n再写粒子动画脚本——用 Canvas 2D API 绘制 60 个半透明紫色粒子，随机初始位置和速度，碰到边界反弹，`requestAnimationFrame` 驱动 60fps 动画循环。\n\n',
  `~~~artifact:code:hero-animation.js~~~
const canvas = document.getElementById('bgCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth; canvas.height = window.innerHeight;
const particles = Array.from({length: 60}, () => ({
  x: Math.random() * canvas.width, y: Math.random() * canvas.height,
  vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8,
  r: Math.random() * 2 + 1
}));
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(124, 58, 237, 0.4)'; ctx.fill();
  });
  requestAnimationFrame(animate);
}
animate();
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
});
~~~artifact:end:code~~~
`,
  `\n首页完成，来看实时预览效果：\n\n~~~artifact:web_preview:index.html 预览~~~
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', -apple-system, sans-serif; background: #f8f9fa; color: #333; }
.hero {
  height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460);
  position: relative; overflow: hidden;
}
#bgCanvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.hero-content { text-align: center; z-index: 1; }
h1 { font-size: clamp(2rem,5vw,3.5rem); color: #fff; font-weight: 700; letter-spacing: -2px; }
.subtitle { font-size: 1.2rem; color: rgba(255,255,255,0.6); margin-top: 12px; }
.cta-btn {
  margin-top: 28px; padding: 12px 32px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.1);
  color: #fff; font-size: 1rem; cursor: pointer; transition: all 0.3s;
}
.cta-btn:hover { background: rgba(255,255,255,0.2); transform: translateY(-2px); }
.navbar { display: flex; gap: 24px; padding: 16px 48px; background: #fff; border-bottom: 1px solid #eee; }
.navbar a { text-decoration: none; color: #666; font-size: 14px; font-weight: 500; }
.navbar a.active { color: #7c3aed; }
.preview-section { padding: 60px 48px; max-width: 1000px; margin: 0 auto; }
.preview-section h2 { font-size: 1.5rem; margin-bottom: 24px; }
.preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.preview-card { padding: 24px; background: #fff; border-radius: 12px; border: 1px solid #eee; transition: transform 0.2s; cursor: pointer; }
.preview-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
.preview-card h3 { font-size: 1rem; margin-bottom: 8px; }
.tag { display: inline-block; padding: 2px 10px; border-radius: 4px; background: #f3e8ff; color: #7c3aed; font-size: 12px; }
footer { text-align: center; padding: 32px; color: #999; font-size: 13px; }
</style>
</head>
<body>
<div class="hero">
  <canvas id="bgCanvas"></canvas>
  <div class="hero-content">
    <h1>探索·思考·创造</h1>
    <p class="subtitle">用文字记录技术成长的每一步</p>
    <button class="cta-btn" onclick="document.getElementById('preview-articles').scrollIntoView({behavior:'smooth'})">开始阅读 →</button>
  </div>
</div>
<nav class="navbar"><a href="index.html" class="active">首页</a><a href="articles/index.html">文章</a><a href="about/index.html">关于</a></nav>
<section id="preview-articles" class="preview-section">
  <h2>最新文章</h2>
  <div class="preview-grid">
    <div class="preview-card"><h3>TypeScript 5.0 新特性</h3><span class="tag">TypeScript</span></div>
    <div class="preview-card"><h3>DAG 调度算法</h3><span class="tag">架构</span></div>
    <div class="preview-card"><h3>React Server Components</h3><span class="tag">React</span></div>
  </div>
</section>
<footer><p>© 2025 My Blog · Built with AgentHub</p></footer>
<script>
var c=document.getElementById('bgCanvas');
if(c){var x=c.getContext('2d');
function r(){c.width=window.innerWidth;c.height=window.innerHeight;}r();
var p=Array.from({length:50},function(){return{x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-0.5)*0.6,vy:(Math.random()-0.5)*0.6,r:Math.random()*2+1};});
function a(){x.clearRect(0,0,c.width,c.height);p.forEach(function(q){q.x+=q.vx;q.y+=q.vy;if(q.x<0||q.x>c.width)q.vx*=-1;if(q.y<0||q.y>c.height)q.vy*=-1;x.beginPath();x.arc(q.x,q.y,q.r,0,Math.PI*2);x.fillStyle='rgba(124,58,237,0.4)';x.fill();});requestAnimationFrame(a);}
a();window.addEventListener('resize',r);}
</script>
</body>
</html>
~~~artifact:end:web_preview~~~`,
];

/** Role 1: Article list with data */
export const AGENT_2_CHUNKS = [
  '文章列表页已完成。数据驱动渲染——HTML 只放容器元素，JavaScript 从 `data.js` 读取文章数组动态生成卡片 DOM。每张卡片包含标题、日期、分类标签和摘要。\n\n',
  `~~~artifact:code:articles/index.html~~~
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>文章列表 - 我的博客</title>
  <link rel="stylesheet" href="../style.css" />
</head>
<body>
  <nav class="navbar">
    <a href="../index.html">首页</a>
    <a href="index.html" class="active">文章</a>
    <a href="../about/index.html">关于</a>
  </nav>
  <main class="container" style="max-width:800px;margin:40px auto;padding:0 24px;">
    <h1 style="font-size:1.8rem;margin-bottom:32px;">全部文章</h1>
    <div id="article-list"></div>
  </main>
  <script src="data.js"></script>
</body>
</html>
~~~artifact:end:code~~~\n\n`,
  '\n数据层维护了三篇示例文章：TypeScript 5.0 新特性实战、DAG 调度算法在 AI 编排中的应用、React Server Components 深度解析。可直接在 `articles` 数组中增删文章。\n\n',
  `~~~artifact:code:articles/data.js~~~
const articles = [
  {
    title: "TypeScript 5.0 新特性实战",
    date: "2025-12-01", category: "TypeScript",
    desc: "探索装饰器、const 类型参数、enum 改进等新功能在实际项目中的应用。"
  },
  {
    title: "DAG 调度算法在 AI 编排中的应用",
    date: "2025-11-20", category: "架构",
    desc: "如何用有向无环图解决多 Agent 任务依赖与并行调度问题。"
  },
  {
    title: "React Server Components 深度解析",
    date: "2025-11-10", category: "React",
    desc: "从原理到实践，理解 RSC 的运作机制与服务端渲染优化。"
  },
];
function renderArticles() {
  const list = document.getElementById('article-list');
  articles.forEach(a => {
    const card = document.createElement('div');
    card.className = 'article-card';
    card.innerHTML = \`
      <h2 style="font-size:1.2rem;margin-bottom:4px;">\${a.title}</h2>
      <p style="color:#999;font-size:0.85rem;margin-bottom:8px;">\${a.date} · \${a.category}</p>
      <p style="color:#666;line-height:1.6;">\${a.desc}</p>
    \`;
    card.style.cssText = 'padding:20px;background:#fff;border-radius:8px;border:1px solid #eee;margin-bottom:12px;transition:transform 0.2s;';
    card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; };
    card.onmouseleave = () => { card.style.transform = ''; card.style.boxShadow = ''; };
    list.appendChild(card);
  });
}
renderArticles();
~~~artifact:end:code~~~`,
];

/** Role 2: About page */
export const AGENT_3_CHUNKS = [
  '关于页面已创建。个人简介卡片居中展示，包含头像、自我介绍和社交链接标签，配色沿用紫色主题风格。社交入口用占位标签展示。\n\n',
  `~~~artifact:code:about/index.html~~~
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>关于我 - 我的博客</title>
  <link rel="stylesheet" href="../style.css" />
</head>
<body>
  <nav class="navbar">
    <a href="../index.html">首页</a>
    <a href="../articles/index.html">文章</a>
    <a href="index.html" class="active">关于</a>
  </nav>
  <main class="container about-page" style="max-width:600px;margin:60px auto;padding:0 24px;">
    <div class="profile-card" style="text-align:center;padding:48px 32px;background:#fff;border-radius:16px;border:1px solid #eee;">
      <div style="font-size:64px;margin-bottom:16px;">👨‍💻</div>
      <h1 style="font-size:1.8rem;margin-bottom:8px;">关于我</h1>
      <p style="color:#7c3aed;font-weight:500;margin-bottom:16px;">全栈开发者 | AI 爱好者 | 开源贡献者</p>
      <p style="color:#666;line-height:1.8;max-width:400px;margin:0 auto;">
        专注于构建下一代 AI 协作工具。热爱探索新技术，相信 AI 能
        让开发者从重复劳动中解放，专注于真正有创造力的工作。
      </p>
      <div style="margin-top:24px;display:flex;gap:12px;justify-content:center;">
        <span style="padding:8px 20px;border-radius:6px;background:#f3e8ff;color:#7c3aed;font-size:14px;cursor:default;">GitHub</span>
        <span style="padding:8px 20px;border-radius:6px;background:#f3e8ff;color:#7c3aed;font-size:14px;cursor:default;">Twitter</span>
        <span style="padding:8px 20px;border-radius:6px;background:#f3e8ff;color:#7c3aed;font-size:14px;cursor:default;">Email</span>
      </div>
    </div>
  </main>
  <footer><p>© 2025 My Blog · Built with AgentHub</p></footer>
</body>
</html>
~~~artifact:end:code~~~`,
  '\n\nOK，三个页面都已完成——首页 `index.html`、文章列表 `articles/`、关于页 `about/`，加上全局样式和粒子动画脚本，一个完整的个人博客站点已经就绪！',
];

/**
 * Diff chunks — shown after user interaction, before aggregator.
 * Demonstrates the style.css being updated to dark purple theme.
 */
export const DIFF_CHUNKS = [
  '已根据你的偏好「深色主题 (紫色调)」更新了 `style.css`。以下是变更对比：\n\n',
  `~~~artifact:diff:style.css~~~
--- a/style.css
+++ b/style.css
@@ -1,6 +1,6 @@
 * { margin: 0; padding: 0; box-sizing: border-box; }
-body { font-family: 'Inter', -apple-system, sans-serif; background: #f8f9fa; color: #333; }
+body { font-family: 'Inter', -apple-system, sans-serif; background: #0d0d1a; color: #e0d0f0; }
 .hero {
   height: 100vh; display: flex; align-items: center; justify-content: center;
-  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
+  background: linear-gradient(135deg, #0f0f1a 0%, #1a0a2e 50%, #2d1b69 100%);
   position: relative; overflow: hidden;
@@ -22,15 +22,15 @@
 .cta-btn:hover { background: rgba(255,255,255,0.2); transform: translateY(-2px); }
-.navbar { display: flex; gap: 24px; padding: 16px 48px; background: #fff; border-bottom: 1px solid #eee; }
-.navbar a { text-decoration: none; color: #666; font-size: 14px; font-weight: 500; transition: color 0.2s; }
-.navbar a.active { color: #7c3aed; } .navbar a:hover { color: #333; }
+.navbar { display: flex; gap: 24px; padding: 16px 48px; background: #1a1a2e; border-bottom: 1px solid #2d1b69; }
+.navbar a { text-decoration: none; color: #aaa; font-size: 14px; font-weight: 500; transition: color 0.2s; }
+.navbar a.active { color: #c084fc; } .navbar a:hover { color: #e0d0f0; }
 .preview-section { padding: 60px 48px; max-width: 1000px; margin: 0 auto; }
 .preview-section h2 { font-size: 1.5rem; margin-bottom: 24px; }
 .preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
 .preview-card {
-  padding: 24px; background: #fff; border-radius: 12px; border: 1px solid #eee;
+  padding: 24px; background: #1a1a2e; border-radius: 12px; border: 1px solid #2d1b69;
   transition: transform 0.2s, box-shadow 0.2s; cursor: pointer;
 }
-.preview-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
-.tag { display: inline-block; padding: 2px 10px; border-radius: 4px; background: #f3e8ff; color: #7c3aed; font-size: 12px; margin-top: 8px; }
-footer { text-align: center; padding: 32px; color: #999; font-size: 13px; }
+.preview-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(124,58,237,0.15); }
+.tag { display: inline-block; padding: 2px 10px; border-radius: 4px; background: #2d1b69; color: #c084fc; font-size: 12px; margin-top: 8px; }
+footer { text-align: center; padding: 32px; color: #666; font-size: 13px; }
 @keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
~~~artifact:end:diff~~~`,
];

/** Aggregator summary — shown after DIFF_CHUNKS (merges orchestrator summary + completion) */
export const AGGREGATOR_CHUNKS = [
  '🧠 **Orchestrator 任务总结**\n\n✅ 博客网站开发完成！\n\n已由 3 个 Agent 协作完成以下页面：\n\n',
  `| 页面 | 负责 Agent | 功能 |
|------|-----------|------|
| 首页 \`index.html\` | Agent 1 | Hero 粒子动画 + 导航栏 + 文章预览 |
| 文章列表 \`articles/\` | Agent 2 | 数据驱动渲染 + 交互卡片 |
| 关于页面 \`about/\` | Agent 3 | 个人简介 + 社交链接 |\n\n`,
  `📋 **项目文件结构**\n\`\`\`\n├── index.html          (首页)\n├── style.css           (全局样式，已按偏好更新为深色主题)\n├── hero-animation.js   (粒子动画)\n├── articles/\n│   ├── index.html      (文章列表)\n│   └── data.js         (文章数据)\n└── about/\n    └── index.html      (关于页面)\n\`\`\`\n\n💡 如需进一步调整颜色、布局或添加新功能，请直接告诉我！`,
];

/** Orchestrator summary — shown after all agents finish, before interaction card. */
export const ORCHESTRATOR_SUMMARY = [
  '🧠 **Orchestrator 任务总结**\n\n已由 3 个 Agent 协作完成静态博客网站：\n\n',
  `| Agent | 负责模块 | 产出文件 |
|-------|---------|---------|
| **首页** | Hero 粒子动画 + 导航栏 + 文章预览 | \`index.html\`, \`style.css\`, \`hero-animation.js\` |
| **文章列表** | 数据驱动渲染 + 交互卡片 | \`articles/index.html\`, \`articles/data.js\` |
| **关于页面** | 个人简介 + 社交链接 | \`about/index.html\` |\n\n`,
  `📋 **项目结构**\n
\`\`\`
├── index.html          (首页)
├── style.css           (全局样式)
├── hero-animation.js   (粒子动画)
├── articles/
│   ├── index.html      (文章列表)
│   └── data.js         (文章数据)
└── about/
    └── index.html      (关于页面)
\`\`\`\n\n`,
];

// ─── File Tree Data (by phase) ──────────────────────────────────────────

export interface DemoFileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: DemoFileNode[];
}

/** No files yet */
export const FILE_TREE_EMPTY: DemoFileNode[] = [];

/** After Agent 1 (homepage) */
export const FILE_TREE_AGENT_1: DemoFileNode[] = [
  { name: "index.html", path: "/index.html", type: "file", size: 1250 },
  { name: "style.css", path: "/style.css", type: "file", size: 2100 },
  { name: "hero-animation.js", path: "/hero-animation.js", type: "file", size: 820 },
];

/** After Agent 2 (articles) */
export const FILE_TREE_AGENT_2: DemoFileNode[] = [
  { name: "index.html", path: "/index.html", type: "file", size: 1250 },
  { name: "style.css", path: "/style.css", type: "file", size: 2100 },
  { name: "hero-animation.js", path: "/hero-animation.js", type: "file", size: 820 },
  {
    name: "articles", path: "/articles", type: "dir",
    children: [
      { name: "index.html", path: "/articles/index.html", type: "file", size: 680 },
      { name: "data.js", path: "/articles/data.js", type: "file", size: 1360 },
    ],
  },
];

/** After Agent 3 (about page) — complete project */
export const FILE_TREE_COMPLETE: DemoFileNode[] = [
  { name: "index.html", path: "/index.html", type: "file", size: 1250 },
  { name: "style.css", path: "/style.css", type: "file", size: 2100 },
  { name: "hero-animation.js", path: "/hero-animation.js", type: "file", size: 820 },
  {
    name: "articles", path: "/articles", type: "dir",
    children: [
      { name: "index.html", path: "/articles/index.html", type: "file", size: 680 },
      { name: "data.js", path: "/articles/data.js", type: "file", size: 1360 },
    ],
  },
  {
    name: "about", path: "/about", type: "dir",
    children: [
      { name: "index.html", path: "/about/index.html", type: "file", size: 1050 },
    ],
  },
];

// ─── Demo Diff Timeline ────────────────────────────────────────────

export interface DemoDiffItem {
  type: "created" | "modified";
  path: string;
  content?: string; // full file content for created files (for inline preview)
  diff?: string; // unified diff for modifications
  timestamp: number;
}

/** Diffs pushed per demo phase for the right-panel timeline. */
export const DEMO_DIFFS_BY_PHASE: Record<string, DemoDiffItem[]> = {
  agent_1: [
    {
      type: "created", path: "/index.html", timestamp: 6000,
      content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>我的个人博客</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="hero" id="hero">
    <canvas id="bgCanvas"></canvas>
    <div class="hero-content">
      <h1>探索·思考·创造</h1>
      <p class="subtitle">用文字记录技术成长的每一步</p>
      <button class="cta-btn" onclick="document.getElementById('articles').scrollIntoView({behavior:'smooth'})">开始阅读 →</button>
    </div>
  </header>
  <nav class="navbar">
    <a href="index.html" class="active">首页</a>
    <a href="articles/index.html">文章</a>
    <a href="about/index.html">关于</a>
  </nav>
  <section id="articles" class="preview-section">
    <h2>最新文章</h2>
    <div class="preview-grid">
      <div class="preview-card"><h3>TypeScript 5.0 新特性</h3><span class="tag">TypeScript</span></div>
      <div class="preview-card"><h3>DAG 调度算法</h3><span class="tag">架构</span></div>
      <div class="preview-card"><h3>React Server Components</h3><span class="tag">React</span></div>
    </div>
  </section>
  <footer><p>© 2025 My Blog · Built with AgentHub</p></footer>
  <script src="hero-animation.js"></script>
</body>
</html>`,
    },
    {
      type: "created", path: "/style.css", timestamp: 6000,
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', -apple-system, sans-serif; background: #f8f9fa; color: #333; }
.hero {
  height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  position: relative; overflow: hidden;
}
#bgCanvas { position: absolute; inset: 0; }
.hero-content { text-align: center; z-index: 1; }
.hero-content h1 {
  font-size: clamp(2rem, 5vw, 3.5rem); color: #fff; font-weight: 700;
  letter-spacing: -2px; opacity: 0; animation: fadeUp 0.8s ease 0.3s forwards;
}
.subtitle {
  font-size: clamp(0.9rem, 2vw, 1.2rem); color: rgba(255,255,255,0.6);
  margin-top: 12px; opacity: 0; animation: fadeUp 0.8s ease 0.6s forwards;
}
.cta-btn {
  margin-top: 28px; padding: 12px 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.1); color: #fff; font-size: 1rem; cursor: pointer;
  backdrop-filter: blur(4px); transition: all 0.3s; opacity: 0; animation: fadeUp 0.8s ease 0.9s forwards;
}
.cta-btn:hover { background: rgba(255,255,255,0.2); transform: translateY(-2px); }
.navbar { display: flex; gap: 24px; padding: 16px 48px; background: #fff; border-bottom: 1px solid #eee; }
.navbar a { text-decoration: none; color: #666; font-size: 14px; font-weight: 500; transition: color 0.2s; }
.navbar a.active { color: #7c3aed; } .navbar a:hover { color: #333; }
.preview-section { padding: 60px 48px; max-width: 1000px; margin: 0 auto; }
.preview-section h2 { font-size: 1.5rem; margin-bottom: 24px; }
.preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.preview-card { padding: 24px; background: #fff; border-radius: 12px; border: 1px solid #eee; transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; }
.preview-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
.tag { display: inline-block; padding: 2px 10px; border-radius: 4px; background: #f3e8ff; color: #7c3aed; font-size: 12px; margin-top: 8px; }
footer { text-align: center; padding: 32px; color: #999; font-size: 13px; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }`,
    },
    {
      type: "created", path: "/hero-animation.js", timestamp: 6000,
      content: `const canvas = document.getElementById('bgCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth; canvas.height = window.innerHeight;
const particles = Array.from({length: 60}, () => ({
  x: Math.random() * canvas.width, y: Math.random() * canvas.height,
  vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8,
  r: Math.random() * 2 + 1
}));
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(124, 58, 237, 0.4)'; ctx.fill();
  });
  requestAnimationFrame(animate);
}
animate();
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
});`,
    },
  ],
  agent_2: [
    {
      type: "created", path: "/articles/index.html", timestamp: 9000,
      content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>文章列表 - 我的博客</title>
  <link rel="stylesheet" href="../style.css" />
</head>
<body>
  <nav class="navbar">
    <a href="../index.html">首页</a>
    <a href="index.html" class="active">文章</a>
    <a href="../about/index.html">关于</a>
  </nav>
  <main class="container" style="max-width:800px;margin:40px auto;padding:0 24px;">
    <h1 style="font-size:1.8rem;margin-bottom:32px;">全部文章</h1>
    <div id="article-list"></div>
  </main>
  <script src="data.js"></script>
</body>
</html>`,
    },
    {
      type: "created", path: "/articles/data.js", timestamp: 9000,
      content: `const articles = [
  {
    title: "TypeScript 5.0 新特性实战",
    date: "2025-12-01", category: "TypeScript",
    desc: "探索装饰器、const 类型参数、enum 改进等新功能在实际项目中的应用。"
  },
  {
    title: "DAG 调度算法在 AI 编排中的应用",
    date: "2025-11-20", category: "架构",
    desc: "如何用有向无环图解决多 Agent 任务依赖与并行调度问题。"
  },
  {
    title: "React Server Components 深度解析",
    date: "2025-11-10", category: "React",
    desc: "从原理到实践，理解 RSC 的运作机制与服务端渲染优化。"
  },
];
function renderArticles() {
  const list = document.getElementById('article-list');
  articles.forEach(a => {
    const card = document.createElement('div');
    card.className = 'article-card';
    card.innerHTML = '<h2 style="font-size:1.2rem;margin-bottom:4px;">' + a.title + '</h2>' +
      '<p style="color:#999;font-size:0.85rem;margin-bottom:8px;">' + a.date + ' · ' + a.category + '</p>' +
      '<p style="color:#666;line-height:1.6;">' + a.desc + '</p>',
    card.style.cssText = 'padding:20px;background:#fff;border-radius:8px;border:1px solid #eee;margin-bottom:12px;';
    list.appendChild(card);
  });
}
renderArticles();`,
    },
  ],
  agent_3: [
    {
      type: "created", path: "/about/index.html", timestamp: 11500,
      content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>关于我 - 我的博客</title>
  <link rel="stylesheet" href="../style.css" />
</head>
<body>
  <nav class="navbar">
    <a href="../index.html">首页</a>
    <a href="../articles/index.html">文章</a>
    <a href="index.html" class="active">关于</a>
  </nav>
  <main class="container about-page" style="max-width:600px;margin:60px auto;padding:0 24px;">
    <div class="profile-card" style="text-align:center;padding:48px 32px;background:#fff;border-radius:16px;border:1px solid #eee;">
      <div style="font-size:64px;margin-bottom:16px;">👨‍💻</div>
      <h1 style="font-size:1.8rem;margin-bottom:8px;">关于我</h1>
      <p style="color:#7c3aed;font-weight:500;margin-bottom:16px;">全栈开发者 | AI 爱好者 | 开源贡献者</p>
      <p style="color:#666;line-height:1.8;max-width:400px;margin:0 auto;">
        专注于构建下一代 AI 协作工具。热爱探索新技术，相信 AI 能
        让开发者从重复劳动中解放，专注于真正有创造力的工作。
      </p>
      <div style="margin-top:24px;display:flex;gap:12px;justify-content:center;">
        <span style="padding:8px 20px;border-radius:6px;background:#f3e8ff;color:#7c3aed;font-size:14px;cursor:default;">GitHub</span>
        <span style="padding:8px 20px;border-radius:6px;background:#f3e8ff;color:#7c3aed;font-size:14px;cursor:default;">Twitter</span>
        <span style="padding:8px 20px;border-radius:6px;background:#f3e8ff;color:#7c3aed;font-size:14px;cursor:default;">Email</span>
      </div>
    </div>
  </main>
  <footer><p>© 2025 My Blog · Built with AgentHub</p></footer>
</body>
</html>`,
    },
  ],
  theme: [
    {
      type: "modified", path: "/style.css", timestamp: 12500,
      diff: `--- a/style.css
+++ b/style.css
@@ -1,6 +1,6 @@
 * { margin: 0; padding: 0; box-sizing: border-box; }
-body { font-family: 'Inter', -apple-system, sans-serif; background: #f8f9fa; color: #333; }
+body { font-family: 'Inter', -apple-system, sans-serif; background: #0d0d1a; color: #e0d0f0; }
 .hero {
   height: 100vh; display: flex; align-items: center; justify-content: center;
-  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
+  background: linear-gradient(135deg, #0f0f1a 0%, #1a0a2e 50%, #2d1b69 100%);
   position: relative; overflow: hidden;`,
    },
  ],
};

/**
 * Phases that produce file diffs, in order — used by RightPanel version history.
 * Each key maps to an entry in DEMO_DIFFS_BY_PHASE above.
 */
export const VERSION_PHASES = ["agent_1", "agent_2", "agent_3", "theme"] as const;

/** Human-readable labels for each file-producing phase. */
export const PHASE_LABELS: Record<string, string> = {
  agent_1: "Agent: 首页",
  agent_2: "Agent: 文章列表",
  agent_3: "Agent: 关于页",
  theme: "主题切换",
};

/** Flat lookup map: file path → content for all demo files. */
const _phaseValues = Object.values(DEMO_DIFFS_BY_PHASE);
export const DEMO_FILE_CONTENT: Record<string, string> = {};
for (const phase of _phaseValues) {
  for (const item of phase) {
    if (item.content) DEMO_FILE_CONTENT[item.path] = item.content;
  }
}
