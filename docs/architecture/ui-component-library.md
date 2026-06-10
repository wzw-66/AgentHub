# @agenthub/ui — 共享 UI 组件库

> 创建日期: 2026-05-27

---

## 一、定位

`@agenthub/ui` 是 AgentHub 的**共享 React 组件库**，为后续三个前端模块提供基础 UI 组件：

```
@agenthub/shared (类型定义)
      │
      ▼
 @agenthub/ui    ← 本次创建
      │
      ├──→ chat-ui (聊天界面)
      ├──→ agent-market (Agent 市场)
      └──→ artifact-preview (产物预览)
```

---

## 二、包配置

**位置:** `packages/ui/`

**构建:** tsup → ESM (`dist/index.js`) + CJS (`dist/index.cjs`) + dts (`dist/index.d.ts`)

**依赖:**
- `@agenthub/shared: workspace:*` — 使用 Message、Artifact 等类型
- `prism-react-renderer: ^2.4.1` — 代码语法高亮
- `react ^18 || ^19` — peerDependency
- `react-dom ^18 || ^19` — peerDependency

**测试:** Vitest + jsdom + @testing-library/react

**样式策略:** 内联样式 + CSS 变量

所有组件使用 `style={{ }}` 对象定义样式，通过 `var(--ui-xxx)` 引用 `tokens.css` 中的设计令牌。这种方式零运行时开销、无需额外构建步骤、支持消费者通过覆盖 CSS 变量实现主题化。

---

## 三、架构设计

```
packages/ui/src/
├── index.ts                  # 统一导出入口
├── types.ts                  # 所有组件的 Props 接口
├── test/
│   └── setup.ts              # @testing-library/jest-dom 初始化
├── styles/
│   ├── tokens.css            # CSS 变量（颜色、间距、字体、圆角、阴影）
│   └── components.css        # @keyframes 动画定义
└── components/
    ├── AgentAvatar/          # 头像组件
    ├── MessageBubble/        # 消息气泡组件
    ├── CodeBlock/            # 代码块组件
    ├── DiffCard/             # Diff 渲染卡片
    ├── PreviewCard/          # iframe 预览卡片
    └── ArtifactCard/         # 产物状态卡片
```

每个组件目录结构一致：

```
ComponentName/
├── ComponentName.tsx         # 组件实现
├── __tests__/
│   └── ComponentName.test.tsx # 组件测试
```

---

## 四、组件详细说明

### 1. AgentAvatar — 头像组件

**文件:** `src/components/AgentAvatar/AgentAvatar.tsx`

| Props | 类型 | 默认值 | 说明 |
|-------|------|--------|------|
| name | `string` | — | Agent 名称（必填） |
| avatarUrl | `string?` | — | 头像图片 URL |
| size | `'sm' \| 'md' \| 'lg'` | `'md'` | 尺寸 |
| className | `string?` | — | 自定义类名 |

**行为:**
- 有 `avatarUrl` → 渲染 `<img>` 圆形裁剪
- 无 `avatarUrl` → 取 `name` 首字母大写，根据名字 hash 分配背景色（8 色池）
- `sm`=32px、`md`=40px、`lg`=48px

**测试 (5 个):**
1. 渲染图片 ✓
2. 无图片显示首字母 ✓
3. sm 尺寸 ✓
4. lg 尺寸 ✓
5. className 透传 ✓

---

### 2. MessageBubble — 消息气泡

**文件:** `src/components/MessageBubble/MessageBubble.tsx`

| Props | 类型 | 说明 |
|-------|------|------|
| message | `Message` | 消息对象（来自 @agenthub/shared） |
| variant | `'user' \| 'contact' \| 'system'` | 发送者类型 |
| children | `ReactNode?` | 自定义内容（不传则渲染 message.content） |
| className | `string?` | 自定义类名 |

**变体样式:**

| Variant | 对齐 | 背景色 | 圆角 |
|---------|------|--------|------|
| user | 右对齐 | `--ui-color-bg-user` (#3b82f6) | 左下直角 |
| contact | 左对齐 | `--ui-color-bg-contact` (#f3f4f6) | 右下直角 |
| system | 居中 | `--ui-color-bg-system` (#f9fafb) | 全圆角 |

**行为:** 显示格式化的时间戳（HH:mm）

**测试 (5 个):**
1. 渲染文本内容 ✓
2. user variant 样式 ✓
3. contact variant 样式 ✓
4. system variant 样式 ✓
5. 格式化时间戳 ✓

---

### 3. CodeBlock — 代码块

**文件:** `src/components/CodeBlock/CodeBlock.tsx`

| Props | 类型 | 默认值 | 说明 |
|-------|------|--------|------|
| code | `string` | — | 代码内容 |
| language | `string?` | `'text'` | 编程语言 |
| showLineNumbers | `boolean?` | `false` | 显示行号 |
| maxHeight | `string?` | — | 最大高度（超出滚动） |
| className | `string?` | — | 自定义类名 |

**特性:**
- 使用 `prism-react-renderer` 的 `Highlight` 组件进行语法高亮
- 语言标签显示在左上角
- 复制按钮位于右上角，点击后显示 "Copied!" 反馈（2 秒后恢复）
- 深色背景 (`--ui-color-bg-code` #1e293b)

**测试 (5 个):**
1. 渲染代码内容 ✓
2. 复制按钮存在 ✓
3. 点击触发 clipboard API ✓
4. 语言标签显示 ✓
5. className 透传 ✓

---

### 4. DiffCard — 差异渲染卡片

**文件:** `src/components/DiffCard/DiffCard.tsx`

| Props | 类型 | 说明 |
|-------|------|------|
| diff | `string` | unified diff 格式文本 |
| title | `string?` | 标题 |
| className | `string?` | 自定义类名 |

**行为:**
- 解析 unified diff 的每一行
- `+` 开头行（非 `+++`）→ 绿色背景 (`--ui-color-diff-add`)
- `-` 开头行（非 `---`）→ 红色背景 (`--ui-color-diff-remove`)
- 其他行 → 无背景
- 空 diff → "No changes" 占位提示

**测试 (5 个):**
1. 新增行绿色 ✓
2. 删除行红色 ✓
3. 上下文无高亮 ✓
4. 标题显示 ✓
5. 空 diff 占位 ✓

---

### 5. PreviewCard — 预览卡片

**文件:** `src/components/PreviewCard/PreviewCard.tsx`

| Props | 类型 | 说明 |
|-------|------|------|
| url | `string` | 预览 URL |
| title | `string?` | 标题 |
| className | `string?` | 自定义类名 |

**行为:**
- 渲染 `<iframe>` 嵌入 URL 内容
- `sandbox="allow-scripts allow-same-origin"` 安全属性
- 加载过程显示 "Loading preview..." 骨架屏
- 16:9 宽高比容器

**测试 (5 个):**
1. iframe URL 正确 ✓
2. sandbox 属性 ✓
3. 标题显示 ✓
4. 加载状态 ✓
5. className 透传 ✓

---

### 6. ArtifactCard — 产物状态卡片

**文件:** `src/components/ArtifactCard/ArtifactCard.tsx`

| Props | 类型 | 说明 |
|-------|------|------|
| artifact | `Artifact` | 产物对象（来自 @agenthub/shared） |
| className | `string?` | 自定义类名 |

**三种状态:**

| Status | 图标 | 标题色 | 正文 |
|--------|------|--------|------|
| building | ⏳ + 旋转 Spinner | primary (蓝色) | "Processing your request..." |
| completed | ✅ | success (绿色) | 内容截取前 200 字 |
| failed | ❌ | error (红色) | "An error occurred while building this artifact." |

**测试 (4 个):**
1. building 显示加载器 ✓
2. completed 显示内容 ✓
3. failed 显示错误 ✓
4. className 透传 ✓

---

## 五、设计令牌

定义在 `src/styles/tokens.css`，通过 CSS 变量暴露：

```css
:root {
  /* 颜色 */
  --ui-color-primary: #2563eb;
  --ui-color-bg-user: #3b82f6;
  --ui-color-bg-contact: #f3f4f6;
  --ui-color-bg-code: #1e293b;
  --ui-color-text-primary: #111827;
  --ui-color-text-secondary: #6b7280;
  --ui-color-text-inverse: #ffffff;
  --ui-color-border: #e5e7eb;
  --ui-color-success: #22c55e;
  --ui-color-error: #ef4444;
  --ui-color-diff-add: #dcfce7;
  --ui-color-diff-remove: #fee2e2;

  /* 间距: 4px → 32px 共 8 级 */
  --ui-space-1: 4px;   --ui-space-2: 8px;
  --ui-space-3: 12px;  --ui-space-4: 16px;
  --ui-space-5: 20px;  --ui-space-6: 24px;
  --ui-space-8: 32px;

  /* 圆角 */
  --ui-radius-sm: 4px;  --ui-radius-md: 8px;
  --ui-radius-lg: 12px; --ui-radius-xl: 16px;

  /* 字体 */
  --ui-font-sans: -apple-system, ...;
  --ui-font-mono: "JetBrains Mono", "Fira Code", ...;
}
```

消费者在自己的应用中导入 `tokens.css` 即可使用全部令牌，覆盖变量值即可实现主题化。

---

## 六、前端测试方法论

### 6.1 测试什么：测 TS 逻辑，不测 CSS 样式

UI 测试只关注**功能行为**，不关注**视觉外观**。

**能测的（TypeScript 逻辑）：**

```typescript
// ✅ 条件渲染 — 有 url 显示 img，无 url 显示首字母
if (avatarUrl) return <img />
else return <div>C</div>

// ✅ 事件处理 — 点击按钮触发剪贴板
fireEvent.click(button)
expect(writeText).toHaveBeenCalled()

// ✅ 数据转换 — ISO 时间转成 HH:mm
formatTime("2026-05-27T10:30:00Z") → "18:30"

// ✅ className 透传 — 外层传入的 class 被接住
expect(el.className).toContain("custom-class")
```

**不能测的（纯 CSS）：**

```css
/* ❌ 颜色 */
--ui-color-bg-user: #3b82f6;

/* ❌ 字体大小、圆角、对齐方式 */
font-size: 15px;
border-radius: 8px;
align-items: flex-end;
```

### 6.2 为什么不能测 CSS？

因为测试运行在 **jsdom**（一个"假浏览器"）中，它只模拟 DOM API，**不加载 CSS 文件、不计算最终样式**。即使你在 CSS 里写了 `.text { color: red }`，jsdom 也不会去解析它。

所以测试验证的是：元素在 DOM 里存不存在、内容对不对、属性正不正确。好不好看，还是得用肉眼在真浏览器里看。

### 6.3 测试工具链

```
vitest            测试运行器（负责组织测试、运行、输出结果）
  ↓
jsdom             虚拟浏览器（在 Node.js 内存中模拟 DOM，不需要打开 Chrome）
  ↓
@testing-library/react   渲染 React 组件并提供 API 来查询和操作 DOM
```

### 6.4 测试流程

执行 `pnpm --filter @agenthub/ui test` 后：

```
1. vitest 启动
2. jsdom 在内存中创建一个"假浏览器"（无界面）
3. 扫描 src/**/*.test.{ts,tsx} 找到所有测试文件
4. 对每个测试用例:
   a. render(<组件 />)    → 将组件渲染到假浏览器的 DOM 中
   b. screen.getByTestId("xxx")    → 在 DOM 中查找元素
   c. expect(...).toBeInTheDocument()  → 验证元素状态
5. cleanup()             → 清空 DOM，准备下一个测试
6. 输出: 6 passed, 29 passed ✓
```

### 6.5 完整示例解读

**组件代码 — AgentAvatar.tsx：**

```tsx
export function AgentAvatar({ name, avatarUrl, size = "md" }: Props) {
  if (avatarUrl) {
    // 有头像 → 渲染 <img>，带 data-testid 作为"测试身份证"
    return <img src={avatarUrl} data-testid="agent-avatar-img" />;
  }
  // 无头像 → 显示首字母
  return <div data-testid="agent-avatar-initials">{name[0]}</div>;
}
```

**测试代码 — AgentAvatar.test.tsx：**

```tsx
import { render, screen } from "@testing-library/react";

it("renders image when avatarUrl is provided", () => {
  // ① 安排（Arrange）— 渲染组件，传入参数
  render(<AgentAvatar name="Test" avatarUrl="https://example.com/pic.png" />);

  // ② 执行（Act）— 通过 data-testid 找到图片
  const img = screen.getByTestId("agent-avatar-img");

  // ③ 断言（Assert）— 验证图片存在、src 和 alt 正确
  expect(img).toBeInTheDocument();
  expect(img).toHaveAttribute("src", "https://example.com/pic.png");
  expect(img).toHaveAttribute("alt", "Test");
});

it("shows initials when no avatarUrl", () => {
  render(<AgentAvatar name="Claude" />);
  const el = screen.getByTestId("agent-avatar-initials");
  expect(el).toHaveTextContent("C");  // 首字母
});
```

关键点：组件里写了 `data-testid="agent-avatar-img"`——这是"测试身份证"。测试依赖它来定位元素，不依赖 CSS 类名或 DOM 层级，这样重构样式时测试不会坏。

### 6.6 模拟（Mock）示例

**用 CodeBlock 复制功能说明：**

```tsx
import { vi, fireEvent } from "vitest";

it("calls clipboard API on copy button click", () => {
  // ① 创建间谍函数 — 不真的调剪贴板，只记录调用
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });

  render(<CodeBlock code="copy this" />);

  // ② 模拟用户点击
  fireEvent.click(screen.getByTestId("codeblock-copy-btn"));

  // ③ 验证剪贴板被正确调用
  expect(writeText).toHaveBeenCalledWith("copy this");
});
```

`vi.fn()` 创建一个"间谍函数"——它不真的访问系统剪贴板，只是记录自己被调用了、被传了什么参数，然后返回 `undefined`。这样测试不需要真实浏览器 API。

### 6.7 与后端测试的类比

| | 后端测试 | 前端测试 |
|--|---------|---------|
| 环境 | 测试数据库 | jsdom 虚拟浏览器 |
| 操作 | 插入/查询数据 | 渲染组件 / 模拟点击 |
| 验证 | 数据是否正确 | DOM 元素是否存在、内容对不对 |
| mock | mock 外部 API | mock 浏览器 API（剪贴板等） |

本质相同：**安排 → 执行 → 断言**。只是前端操作的是 DOM 元素而非数据库记录。

### 6.8 CSS 样式怎么保证？

| 方式 | 谁负责 | 时机 |
|------|--------|------|
| 单元测试 | 自动运行 | 每次提交 |
| 开发时肉眼确认 | 开发者 | 开发时 |
| Storybook（待添加） | 组件独立预览 + 截图对比 | 开发/审核时 |
| Playwright E2E（待添加） | 打开真浏览器截图对比 | CI 流水线 |

**一句话总结：测试保证功能对不对，不保证好不好看。**

---

## 七、测试总览

| 组件 | 测试数 | 关键验证 |
|------|--------|---------|
| AgentAvatar | 5 | 图片渲染、首字母兜底、3 种尺寸、className |
| MessageBubble | 5 | 内容渲染、3 种 variant、时间戳 |
| CodeBlock | 5 | 代码渲染、复制按钮、剪贴板 API、语言标签 |
| DiffCard | 5 | 新增/删除/上下文渲染、标题、空内容 |
| PreviewCard | 5 | iframe URL、sandbox、标题、加载状态 |
| ArtifactCard | 4 | 3 种状态渲染、className |
| **合计** | **29** | — |

**测试命令:** `pnpm --filter @agenthub/ui test`
