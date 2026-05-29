## Context

当前 `apps/web/components/BackgroundEffects.tsx` 使用纯 CSS 实现背景效果：3 个 radial-gradient 浮动光晕 (orb-float 动画) + SVG 网格覆盖层。这种方案缺乏动态深度，且无法实现粒子级交互。按钮交互仅有 hover 效果，缺乏点击反馈。

现有视觉层次（从下到上）：
1. 基础背景色 (`--theme-bg-primary`)
2. CSS 径向渐变光晕 (body background-image)
3. 3 个浮动光晕 div (orb-float animation)
4. SVG 网格叠加层 (40x40 grid)
5. UI 内容面板 (backdrop-filter blur glass panels)
6. SVG 噪点纹理 (noise-overlay, z-index 9999)

## Goals / Non-Goals

**Goals:**
- 用 Canvas 2D 实现整页星云粒子背景，替代 CSS 浮动光晕
- 粒子效果包含 3 层景深星星（远景静止、中景漂移、近景缓慢移动）
- 少数亮星带十字光芒闪烁效果（低频闪烁）
- 2-3 个星云色块跟随主题 accent 色缓慢漂移
- 鼠标/触摸产生轻微视差跟随（位移量 ≤ 5px）
- 为核心操作按钮添加 CSS 涟漪点击反馈
- 移动端粒子减半、关闭视差
- 页面不可见时暂停渲染循环
- 遵循 prefers-reduced-motion 无障碍设置

**Non-Goals:**
- 不引入 WebGL / Three.js 等第三方库（纯 Canvas 2D）
- 不修改现有 UI 布局结构或组件尺寸
- 不改动主题切换机制
- 不做全屏 3D 或 VR 效果
- 不改变消息气泡、侧边栏等现有组件样式

## Decisions

### 1. Canvas 2D vs WebGL
- **选择**: Canvas 2D
- **理由**: 星云粒子效果本质是 2D（圆点 + 渐变圆），Canvas 2D 足够胜任。WebGL 对于 50-70 个粒子是过度设计，且增加复杂性和维护成本。符合"平衡型"性能定位。
- **替代方案**: CSS 伪元素或 div 粒子 — 被否决，因为大量 DOM 操作性能差且难以实现星云色块渐变。

### 2. Canvas 层位置
- **选择**: 全屏固定 Canvas，position: fixed，位于网格层之下、UI 内容层之上
- **理由**: 粒子需要覆盖整个页面背景（包括侧边栏背后），fixed 定位最直接。Layer 顺序: z-index 2 (Canvas) < z-index 3 (网格层) < z-index 10 (UI 内容)
- **替代方案**: 每个面板各自独立 Canvas — 被否决，会导致粒子被面板切割不连贯。

### 3. 渲染循环
- **选择**: requestAnimationFrame + 时间增量 (delta time) 驱动
- **理由**: rAF 与浏览器刷新率同步，不会做无用渲染；delta time 保证不同刷新率下运动速度一致。
- **生命周期管理**: Canvas 组件挂载时启动循环，卸载时取消。使用 Page Visibility API 在页面不可见时暂停 rAF。

### 4. 主题色联动
- **选择**: 从 CSS 变量 `--theme-accent` 和 `--theme-accent-glow` 读取颜色值，通过 getComputedStyle 传入 Canvas
- **理由**: 现有主题机制已完善，不需要重建。CSS 变量变更时（主题切换），重新读取并渐变过渡到新颜色。
- **替代方案**: React state 传递 — 被否决，因为主题切换频率低，直接读 CSS 变量更简单。

### 5. 粒子与星云分层
- **选择**: 同一个 Canvas 内分层绘制（先星云色块，再星星粒子），而不是叠加多个 Canvas
- **理由**: 单 Canvas 减少 DOM 节点数量，避免多个 rAF 循环竞争。绘制顺序控制简单：先画大块渐变色块（底层），再画星星点（上层）。
- **替代方案**: 双 Canvas 叠加 — 被否决，单 Canvas 即可满足，多一个 Canvas 多一份性能开销。

### 6. 按钮涟漪实现
- **选择**: React hook `useRipple` + CSS animation，通过创建动态 `<span>` 元素实现
- **理由**: 纯 DOM + CSS，不需要 Canvas，非常轻量。涟漪从点击位置 (event.offsetX/Y) 扩散。
- **替代方案**: Canvas 覆盖层 — 被否决，按钮位置变化需要同步 Canvas，复杂且无必要。

### 7. 性能降级策略
- **选择**: 分层降级 — 检测到低帧率（连续 5 帧 < 30fps）时自动减少粒子数量，最低保留 15 颗
- **理由**: 优雅降级比硬开关更好，用户无感知；移动端默认从低配置启动。

### 8. 网格层淡化
- **选择**: 降低 SVG grid 透明度从 0.015 到 0.008-0.01，保持存在感但更融入星云背景

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| Canvas 与其他动画（如 transition）抢主线程 | Canvas 粒子数上限 70，渲染轻量；使用 will-change 让浏览器优化合成层 |
| 主题切换时颜色突变 | 在颜色变化时做 500ms 的线性插值过渡 |
| 低端移动设备发热 | 默认 20-30 粒子，关闭视差；帧率检测触发进一步降级 |
| 屏幕尺寸变化（resize/旋转） | 监听 resize 事件重新设置 Canvas width/height（防抖 200ms） |
| 与现有 CSS orbs 视觉冲突 | 完全移除 CSS orbs，统一由 Canvas 接管背景动态效果 |
