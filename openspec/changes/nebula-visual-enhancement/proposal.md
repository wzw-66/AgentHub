## Why

当前前端界面视觉效果偏静态，背景仅有 CSS 浮动光晕和网格叠加层，缺乏动态感和沉浸感。作为一款 AI Agent 协作平台，界面需要传达"智能、科技、活力"的品牌感受，而现有背景在长时间使用中显得单调。同时，按钮交互反馈弱，缺乏点击响应的愉悦感。

## What Changes

- **Canvas 星云粒子背景**：用 Canvas 2D 替代现有 CSS 浮动 orbs，渲染星空星云风格的动态粒子背景，包含多层景深星星和星云色块漂移效果
- **鼠标/触摸视差交互**：粒子层对鼠标/触摸移动产生轻微跟随，增强界面"活"的感觉
- **按钮涟漪点击效果**：为核心操作按钮（发送消息、登录/注册、创建 Agent、Talk 按钮）添加 CSS ripple 点击涟漪反馈
- **网格 HUD 覆盖层淡化**：降低 SVG 网格叠加层的透明度/对比度，使其更融入星云背景
- **移除 CSS 浮动 orbs**：现有 CSS `orb-float` 动画光团被 Canvas 星云层取代
- **移动端降级适配**：手机端减少粒子数量、关闭视差交互、页面不可见时暂停渲染
- **无障碍支持**：遵循 `prefers-reduced-motion` 设置，检测低帧率自动降级

## Capabilities

### New Capabilities
- `nebula-background`: 基于 Canvas 2D 的全屏星云粒子背景系统，支持多层星星渲染、星云色块漂移、主题色联动、鼠标视差交互和移动端降级

### Modified Capabilities
<!-- No existing specs are being modified -->

## Impact

- **apps/web**: 修改 `BackgroundEffects.tsx` 组件，新增 Canvas 渲染模块；修改目标按钮组件集成 ripple 效果
- **packages/ui**: 可选 — ripple hook 可下沉到 ui 包供其他模块复用
- **无新增依赖**：Canvas 2D 为浏览器原生 API，ripple 效果纯 CSS 实现，无需引入第三方库
- **性能**：Canvas 持续渲染循环，需处理 requestAnimationFrame 生命周期和页面可见性
