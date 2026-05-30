## 1. Canvas 星云背景核心

- [x] 1.1 创建 `useNebulaCanvas` hook，管理 Canvas 元素创建、尺寸同步（resize 防抖）、渲染生命周期（挂载/卸载）
- [x] 1.2 实现星星粒子生成函数：3 层景深（远景 60% 静止、中景 30% 漂移、近景 10% 漂移），随机分布在画布范围
- [x] 1.3 实现亮星十字光芒效果：2-3 颗随机亮星，4 方向延伸线，3-6 秒随机闪烁周期
- [x] 1.4 实现星云色块渲染：2-3 个大型径向渐变圆（半径 300-600px），透明度 0.03-0.06，跟随主题 accent 色
- [x] 1.5 实现渲染循环（requestAnimationFrame + delta time），驱动星星漂移和星云色块漂移
- [x] 1.6 实现页面可见性监听（Page Visibility API），不可见时暂停 rAF，可见时恢复

## 2. 视差交互

- [x] 2.1 实现鼠标移动视差：监听 mousemove 事件，中景 + 近景粒子层反向偏移，最大 5px，带缓动
- [x] 2.2 实现触摸视差：监听 touchmove 事件获取坐标，移动端（< 768px）自动关闭
- [x] 2.3 实现减少动效检测（prefers-reduced-motion），开启时仅渲染静态帧

## 3. 集成到现有组件

- [x] 3.1 重构 `BackgroundEffects.tsx`：移除 CSS 浮动 orbs（orb-float 动画 div），集成 Canvas 星云层
- [x] 3.2 调整 CSS 分层：Canvas 置于网格层之下（z-index: 2），确保 UI 内容在正确层级之上
- [x] 3.3 实现主题色联动：从 CSS 变量读取 accent 色传入 Canvas，切换时 500ms 颜色过渡
- [x] 3.4 淡化 SVG 网格层透明度（从 0.015 降至 0.008-0.01）

## 4. 按钮涟漪效果

- [x] 4.1 创建 `useRipple` hook：从点击坐标生成 CSS animation 涟漪 `<span>`，accent 色，0.8s 后自动移除
- [x] 4.2 在发送消息按钮集成 useRipple
- [x] 4.3 在登录/注册提交按钮集成 useRipple
- [x] 4.4 在创建 Agent 模态的确认按钮集成 useRipple
- [x] 4.5 在 Agent 详情和右侧面板的 Start Chat 按钮集成 useRipple

## 5. 性能降级

- [x] 5.1 实现帧率监控：记录每帧时间戳，检测连续 5 帧 > 33ms 时自动减半粒子数量（最低 15 颗）
- [x] 5.2 实现移动端默认配置：屏幕 < 768px 时粒子 20-30 颗，关闭视差，减少星云色块
- [x] 5.3 实现帧率恢复后自动回升粒子数量（连续 30 帧 > 30fps 时逐步恢复）

## 6. 清理与验证

- [x] 6.1 移除 `globals.css` 中不再使用的 orb-float 动画 keyframe（已替换为 ripple-anim）
- [ ] 6.2 验证 4 个主题（绿/蓝/紫/红）下星云颜色正确联动
- [ ] 6.3 验证移动端降级效果（Chrome DevTools 模拟手机）
- [ ] 6.4 验证页面切换（隐藏/显示）时渲染暂停/恢复
