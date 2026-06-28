# Canvas 星云背景与按钮涟漪效果设计文档

## 概述

本文档记录了 AgentHub 前端视觉升级的核心实现：基于 Canvas 2D 的星云粒子背景系统和按钮涟漪点击反馈效果。该设计旨在为用户提供沉浸式、动态的视觉体验，同时保持终端赛博朋克的美学风格。

---

## 一、设计目标与迭代过程

### 1.1 用户需求

用户对原有 CSS 背景效果不满意，提出四个改进方向：

1. **星空星云风格** — 非科技连线粒子，而是柔和宇宙星云效果
2. **交互反馈增强** — 按钮点击需要视觉回馈
3. **背景动态化** — 聊天背景太静态，需要"活"的感觉
4. **平衡型性能** — 效果要炫但不牺牲性能

### 1.2 三次迭代

#### 迭代一：过于保守
- 星星亮度 0.2-1.0，星云不透明度 0.03-0.06
- 玻璃面板使用 backdrop-filter: blur(20px)
- 面板背景 alpha 0.78

**问题**：玻璃 blur 把星星全模糊掉了，星云太淡完全看不见

#### 迭代二：过于激进
- 星星亮度 0.5-1.0，星云不透明度 0.2-0.5
- 星星使用 accent 纯色，取消 blur
- 面板背景 alpha 0.45

**问题**：光污染，视觉效果太刺眼

#### 迭代三：最终平衡
- 星星亮度 0.3-1.0，星云不透明度 0.1-0.22
- 星星颜色公式：accent 30-100% 混合白色
- 面板背景 alpha 0.45，无 blur
- 每项参数精准控制，最终达成满意效果

---

## 二、系统架构

### 2.1 视觉分层

```
┌──────────────────────────────────────────────┐
│  Layer 4: 噪点纹理 SVG (z-index: 9999)        │  保留自原设计
├──────────────────────────────────────────────┤
│  Layer 3: UI 内容面板 (z-index: 10)           │  半透明玻璃背景
│  ┌─────────┬────────────┬──────────────┐     │
│  │ Sidebar │ ChatPanel  │ RightPanel   │     │
│  │  bg:45% │  bg:45%    │  bg:45%      │     │
│  └─────────┴────────────┴──────────────┘     │
├──────────────────────────────────────────────┤
│  Layer 2: SVG 网格 HUD (opacity: 0.008)       │  淡化保留
├──────────────────────────────────────────────┤
│  Layer 1: Canvas 星云粒子层 (z-index: 0)      │  本次新增
│  ├── 星云色块 (3个径向渐变)                    │
│  ├── 远景星星 (60颗, 0.3-0.7亮度, 不移动)     │
│  ├── 中景星星 (缓慢漂移)                      │
│  └── 近景星星 (缓慢漂移 + 光晕)               │
├──────────────────────────────────────────────┤
│  Layer 0: 基础背景色 body background-image     │  保留
└──────────────────────────────────────────────┘
```

### 2.2 模块结构

```
apps/web/hooks/
├── useNebulaCanvas.ts     # 星云 Canvas 核心 hook (~190行)
└── useRipple.tsx          # 按钮涟漪 hook (~40行)

apps/web/components/
├── BackgroundEffects.tsx  # 重构：移除 CSS orbs，集成 Canvas
├── Sidebar.tsx → 玻璃背景 + ripple
├── ChatPanel.tsx → 玻璃背景 + ripple(发送按钮)
├── RightPanel.tsx → 玻璃背景 + ripple(Start Chat)
├── CreateAgentModal.tsx → ripple(创建按钮)
└── ...

apps/web/app/globals.css   # 新增 ripple-anim 动画 + glass-panel 变量
```

---

## 三、核心算法详解

### 3.1 星星渲染

#### 星星生成 (generateStars)

```
总数量: 60 (桌面) / 30 (移动端)
分层: 远景 50% | 中景 30% | 近景 20%
       ↓           ↓           ↓
速度:  0         0.2-0.6    0.2-0.6
大小:  0.3-0.9   0.75-2.25  1.5-4.5 (px)
亮度:  0.3-0.7   0.5-0.8    0.7-1.0
```

#### 星星颜色公式

```
accentMix = 0.3 + 0.7 * star.brightness
whiteMix  = 1 - accentMix

R = accent.r * accentMix + 255 * whiteMix
G = accent.g * accentMix + 255 * whiteMix
B = accent.b * accentMix + 255 * whiteMix
```

- 最暗星 (brightness=0.3): 51% accent + 49% 白色
- 最亮星 (brightness=1.0): 100% accent 纯色
- 效果：星星随主题色变化，暗星也带色调

#### 闪烁算法

```
phase += dt * (1 + random * 0.5)
twinkle = 0.6 + 0.4 * sin(phase)
brightness = baseBrightness * twinkle
```

- 每颗星星独立相位
- 频率有随机偏移，避免所有星星同步闪烁
- 亮度在 baseBrightness 的 60%-100% 之间波动

#### 近星光晕

```
条件: layer === 2 (近景层)
尺寸: star.size * 3 (三倍于星星本身)
颜色: rgba(accent, brightness * 0.06)
```

- 极低透明度 (0.06) 的光晕，仅在最亮星星周围可见
- 提供柔和发光效果，不刺眼

### 3.2 星云色块

```
数量: 3 (桌面) / 1-2 (移动端)
半径: 150-400px
不透明度: 0.1-0.22
漂移速度: 2-6 px/s (随机方向)
```

渲染方式：径向渐变

```
gradient:
  - 中心: accent 色, 不透明度 0.1-0.22
  - 0.3半径: accent 色, 不透明度 * 0.5
  - 边缘: transparent
```

- 色块在画布中缓慢漂移，触边环绕
- 使用 `createRadialGradient` 实现柔和过渡
- 颜色跟随主题 accent 色

### 3.3 视差交互

```
鼠标归一化: (clientX - rect.left - centerX) / centerX → [-1, 1]
最大偏移: 3px
缓动系数: 0.05 (指数平滑)

每一帧:
  mouse.x += (mouse.targetX - mouse.x) * 0.05
  parallaxOffset = mouse.x * 2  // 最大约 6px
```

- 星星位置 += parallaxOffset * dt * 0.5
- 缓动跟随，不生硬
- 移动端关闭视差

### 3.4 性能系统

#### FPS 监控

```
每帧记录 dt
取最近 10 帧平均值 avgDt

降级: avgDt > 33ms (≈30fps) → 粒子数量减半 (最低 25%)
恢复: avgDt < 25ms 持续 10 帧 → 逐渐恢复数量
```

#### 移动端适配

```
< 768px 宽度:
  - 星星: 30 颗 (桌面 60)
  - 星云: 1-2 个 (桌面 3)
  - 视差: 关闭
  - 星云色块: 可关闭 (屏幕 < 400px)
```

#### 页面可见性

```
visibilitychange → hidden:
  - 取消 rAF
  - 暂停渲染

visibilitychange → visible:
  - 重置时间戳
  - 重新启动 rAF
```

#### 减少动效

```
prefers-reduced-motion: reduce:
  - 暂停 rAF 循环
  - 渲染一帧静态画面
```

---

## 四、主题联动

### 4.1 CSS 变量读取

```typescript
function getAccentRGB(): { r: number; g: number; b: number } {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue("--theme-accent").trim();
  if (val.startsWith("#")) {
    const h = val.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }
  return { r: 0, g: 255, b: 65 }; // fallback green
}
```

### 4.2 主题切换监听

```typescript
const observer = new MutationObserver(() => {
  accentRef.current = getAccentRGB();
});
observer.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
```

- 监听 `<html>` 的 `data-theme` 属性变化
- 变化后下一帧立即生效
- 4 套主题各自不同色调：

| 主题   | accent 色  | 星云感觉     |
|--------|-----------|-------------|
| Green  | #00ff41   | 数据流/矩阵   |
| Blue   | #00b4d8   | 深空/星际     |
| Purple | #bb86fc   | 星云/幻彩     |
| Red    | #ff3333   | 星云深处/熔岩 |

### 4.3 CSS 变量 (新增)

```css
--theme-bg-glass-panel: rgba(8, 18, 8, 0.45);
```

- 四套主题各自定义
- 比 `--theme-bg-glass` (alpha 0.78) 更透明
- 专用于 chat 面板，让星云透出

---

## 五、按钮涟漪 (useRipple)

### 5.1 设计思路

- 纯 CSS animation 实现，不依赖 Canvas
- 从鼠标点击位置扩散的圆形波纹
- 使用 accent 色，与主题一致
- 轻量级，无第三方依赖

### 5.2 实现原理

```typescript
function useRipple() {
  const [ripples, setRipples] = useState([]);

  const addRipple = (e) => {
    // 获取点击坐标
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now() + Math.random();

    // 添加涟漪
    setRipples(prev => [...prev, { id, x, y }]);

    // 800ms 后自动移除
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 800);
  };
}
```

### 5.3 CSS 动画

```css
@keyframes ripple-anim {
  to { transform: scale(4); opacity: 0; }
}

.ripple-effect {
  position: absolute;
  border-radius: 50%;
  width: 20px; height: 20px;
  margin-left: -10px; margin-top: -10px;
  background: var(--theme-accent);
  opacity: 0.35;
  pointer-events: none;
  animation: ripple-anim 0.8s ease-out forwards;
}
```

### 5.4 集成范围

| 按钮 | 位置 | 说明 |
|------|------|------|
| 发送消息 | ChatPanel.tsx | 核心操作 |
| 登录提交 | login/page.tsx | 关键操作 |
| 注册提交 | register/page.tsx | 关键操作 |
| 创建 Agent | CreateAgentModal.tsx | 模态确认 |
| Start Chat | agents/[id]/page.tsx | Agent 交互入口 |
| Start Chat | RightPanel.tsx | 右侧面板操作 |

---

## 六、性能指标

| 指标 | 桌面 | 移动端 |
|------|------|--------|
| 渲染方式 | Canvas 2D | Canvas 2D |
| 帧率目标 | 60fps | 30-60fps |
| 星星数量 | 60 | 30 |
| 星云数量 | 3 | 1-2 |
| 视差 | 开启 | 关闭 |
| 降级阈值 | 连续 10 帧 < 30fps | 同上 |
| 页面不可见 | 暂停渲染 | 同上 |

---

## 七、与原设计的对比

| 方面 | 原设计 (CSS orbs) | 新设计 (Canvas 星云) |
|------|------------------|---------------------|
| 渲染引擎 | CSS animation | Canvas 2D |
| 粒子数量 | 3 个光晕 | 60+ 星星 + 3 星云 |
| 交互 | 无 | 鼠标视差跟随 |
| 主题联动 | CSS 变量切换 | Canvas 实时读取 + 更新 |
| 性能控制 | 无 | FPS 监控 + 自动降级 |
| 移动端适配 | 无 | 减量 + 关闭视差 |
| 按钮反馈 | hover 仅颜色变化 | click 涟漪扩散 |
| 视觉效果 | 静态/简单浮动 | 动态星空 + 星云漂移 |
