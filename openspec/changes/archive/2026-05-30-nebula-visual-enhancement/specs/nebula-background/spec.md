## ADDED Requirements

### Requirement: Canvas 渲染生命周期
Canvas 实例 SHALL 在组件挂载时创建并启动渲染循环，在组件卸载时销毁并取消动画帧。
Canvas SHALL 使用 `requestAnimationFrame` 驱动渲染循环。
Canvas SHALL 在页面不可见时（Page Visibility API）暂停渲染循环，在页面重新可见时恢复。

#### Scenario: 组件挂载启动渲染
- **WHEN** BackgroundEffects 组件挂载
- **THEN** Canvas 元素被创建并插入 DOM
- **THEN** requestAnimationFrame 循环启动

#### Scenario: 页面隐藏暂停渲染
- **WHEN** 页面切换至后台（visibilitychange → hidden）
- **THEN** requestAnimationFrame 循环被取消

#### Scenario: 页面恢复继续渲染
- **WHEN** 页面切换回前台（visibilitychange → visible）
- **THEN** requestAnimationFrame 循环重新启动

### Requirement: 星星粒子渲染
Canvas SHALL 渲染 50-70 颗星星粒子，分为 3 层景深：
- 远景层（约 60%）：直径 0.5-1px，无运动，亮度较低
- 中景层（约 30%）：直径 1-2px，极慢漂移（≤ 0.3px/s），中等亮度
- 近景层（约 10%）：直径 2-3px，缓慢漂移（≤ 0.6px/s），亮度较高
每颗星星 SHALL 随机分布在 Canvas 范围内。
2-3 颗亮星 SHALL 带有十字光芒效果（4 方向延伸线），闪烁周期为 3-6 秒随机。

#### Scenario: 远景星星静止
- **WHEN** Canvas 渲染循环执行
- **THEN** 远景层粒子位置在 10 秒内变化不超过 2px

#### Scenario: 近景星星缓慢漂移
- **WHEN** Canvas 渲染循环执行超过 5 秒
- **THEN** 近景层粒子相比初始位置有明显位移

#### Scenario: 亮星闪烁
- **WHEN** 观察亮星超过 6 秒
- **THEN** 其光芒至少完成一次完整的闪烁周期（从亮到暗再到亮）

### Requirement: 星云色块渲染
Canvas SHALL 渲染 2-3 个径向渐变星云色块。
星云色块 SHALL 为大型径向渐变圆（半径 300-600px），透明度极低（0.03-0.06）。
星云色块 SHALL 在画布范围内缓慢漂移（周期 25-40 秒）。
星云色块的颜色 SHALL 跟随当前主题的 accent 色 (--theme-accent)。

#### Scenario: 星云色块缓慢漂移
- **WHEN** Canvas 渲染循环执行超过 30 秒
- **THEN** 星云色块的位置相比初始位置有显著变化

#### Scenario: 星云颜色跟随主题
- **WHEN** 用户切换主题
- **THEN** 星云色块的颜色在 500ms 内过渡到新主题的 accent 色

### Requirement: 鼠标/触摸视差交互
星星粒子层（中景 + 近景）SHALL 对鼠标和触摸移动产生微弱的视差位移。
最大偏移量 SHALL 不超过 5px。
视差响应 SHALL 使用缓动（easing），非瞬时跳变。
视差方向 SHALL 与鼠标移动方向相反（视差效果）。
触摸设备 SHALL 使用 touchmove 事件坐标。
移动端（屏幕宽度 < 768px）SHALL 关闭视差交互。

#### Scenario: 鼠标移动产生视差
- **WHEN** 鼠标从画布中心向右移动 200px
- **THEN** 粒子层在 1 秒内向左偏移，偏移量不超过 5px

#### Scenario: 移动端关闭视差
- **WHEN** 在宽度 < 768px 的设备上触摸滑动
- **THEN** 粒子位置不受触摸影响

### Requirement: 按钮涟漪效果
核心操作按钮（发送消息、登录/提交、创建 Agent、Agent Talk 按钮）SHALL 在点击时产生涟漪效果。
涟漪 SHALL 从点击位置（鼠标或触摸点）开始向外扩散。
涟漪 SHALL 使用当前主题的 accent 色，透明度从 0.4 渐变为 0。
涟漪动画持续时间 SHALL 为 0.6-0.8 秒。
涟漪 SHALL 不影响按钮的点击事件和功能。

#### Scenario: 点击产生涟漪
- **WHEN** 用户点击发送按钮
- **THEN** 从点击位置扩散出一个圆形波纹
- **THEN** 波纹在 0.8 秒内完全消失

#### Scenario: 涟漪不阻塞交互
- **WHEN** 涟漪动画播放期间再次点击按钮
- **THEN** 新涟漪正常生成
- **THEN** 按钮的原有功能正常触发

### Requirement: 性能降级
Canvas 渲染循环 SHALL 检测渲染帧率。
当连续 5 帧间隔超过 33ms（即帧率 < 30fps）时，SHALL 自动减少粒子数量至当前的一半，最低保留 15 颗。
Canvas SHALL 检查 `window.matchMedia('(prefers-reduced-motion: reduce)')`，当用户开启减少动效时，SHALL 暂停所有动画，仅渲染静态帧。
移动端（屏幕宽度 < 768px）SHALL 默认使用 20-30 粒子并关闭星云色块。

#### Scenario: 帧率下降自动降级
- **WHEN** Canvas 检测到连续 5 帧间隔 > 33ms
- **THEN** 粒子数量减少到当前的一半
- **THEN** 继续监控帧率，若仍低则继续减半至最低 15 颗

#### Scenario: 减少动效模式
- **WHEN** 系统开启 prefers-reduced-motion: reduce
- **THEN** Canvas 仅渲染一帧静态画面
- **THEN** requestAnimationFrame 循环不执行

#### Scenario: 移动端默认轻量
- **WHEN** 屏幕宽度 < 768px
- **THEN** 粒子初始数量为 20-30
- **THEN** 星云色块数量为 0-1 个或关闭

### Requirement: 网格层淡化
SVG 网格叠加层的透明度 SHALL 从当前值降低至原值的约 60%。
网格层的 z-index 和结构不变，仅透明度调整。

#### Scenario: 透明度降低
- **WHEN** 页面加载
- **THEN** SVG 网格层以更低的透明度渲染，不干扰星云背景可视性
