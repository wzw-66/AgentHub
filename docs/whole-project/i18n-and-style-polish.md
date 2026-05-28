# 中英文国际化 (i18n) 与 UI 样式打磨

> 日期：2026-05-28
> 范围：`apps/web` + `packages/ui`（样式部分）

---

## 一、背景与目标

AgentHub Web 端原为纯英文界面，且样式细节有优化空间。本次改造的两个核心目标：

1. **中英文切换**：为整个平台增加国际化能力，用户可随时在中文/英文间切换
2. **UI 样式打磨**：优化字体排版、动画效果、视觉细节，提升整体质感

---

## 二、i18n 基础设施搭建

### 2.1 目录结构

```
apps/web/lib/i18n/
├── index.ts                  # 导出入口
├── context.tsx               # I18nProvider + useI18n hook
└── translations/
    ├── en.ts                 # 英文翻译（所有 UI 文本）
    └── zh.ts                 # 中文翻译（与 en 结构一致）
```

### 2.2 核心实现

#### `translations/en.ts` — 定义翻译结构

所有 UI 文本按页面/组件分块组织，每个值都是字符串或返回字符串的函数（用于动态拼接）：

```typescript
export const en = {
  brand: { name: "AgentHub", tagline: "AI COMMAND CENTER" },
  common: { loading: "LOADING...", retry: "RETRY", cancel: "CANCEL", ... },
  auth: {
    login: { title: "ACCESS TERMINAL", subtitle: "// AUTHENTICATE TO CONTINUE", ... },
    register: { ... },
  },
  sidebar: { operator: "OPERATOR", exit: "EXIT", ... },
  chat: { empty: "SELECT A SESSION TO BEGIN", ... },
  agentMarket: { title: "AGENT MARKET", ... },
  contacts: { ... },
  agentDetail: { ... },
  agentInfo: { ... },
  createAgent: { ... },
  typing: { processing: (names: string) => `${names} PROCESSING...` },
  themes: { green: "Matrix Green", ... },
  lang: { switchTo: "中 文" },
} as const;
```

导出的 `Translations` 类型使用 `DeepStringify` 工具类型，将字面量类型放宽为 `string`，使中文翻译对象也能通过类型检查：

```typescript
type DeepStringify<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R
    : { [K in keyof T]: DeepStringify<T[K]> };

export type Translations = DeepStringify<typeof en>;
```

#### `translations/zh.ts` — 中文翻译

```typescript
export const zh: Translations = {
  brand: { name: "AgentHub", tagline: "AI 指挥中心" },
  common: { loading: "加载中...", retry: "重试", cancel: "取消", ... },
  auth: {
    login: { title: "访问终端", subtitle: "// 请先进行身份验证", ... },
    ...
  },
  ...
};
```

#### `context.tsx` — I18nProvider

关键逻辑：

```typescript
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");

  // 初始化时从 localStorage 恢复
  useEffect(() => {
    const saved = localStorage.getItem("agenthub_locale");
    if (saved === "en" || saved === "zh") setLocaleState(saved);
    setMounted(true);
  }, []);

  // 切换时更新 <html lang> + localStorage
  useEffect(() => {
    if (mounted) {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
      localStorage.setItem("agenthub_locale", locale);
    }
  }, [locale, mounted]);

  const t = useCallback(<K extends keyof Translations>(key: K): Translations[K] => {
    return translations[locale][key];
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}
```

### 2.3 Provider 挂载

`apps/web/app/providers.tsx` — `I18nProvider` 作为最外层 Provider：

```tsx
<I18nProvider>
  <ThemeProvider>
    <AuthProvider>
      <WSProvider>
        <ChatProvider>
          <BackgroundEffects />
          {children}
        </ChatProvider>
      </WSProvider>
    </AuthProvider>
  </ThemeProvider>
</I18nProvider>
```

### 2.4 组件中使用

```tsx
import { useI18n } from "@/lib/i18n";

function MyComponent() {
  const { t, locale, setLocale } = useI18n();
  return (
    <div>
      <h1>{t("brand").tagline}</h1>
      <button>{t("common").loading}</button>
      <button onClick={() => setLocale(locale === "zh" ? "en" : "zh")}>
        {t("lang").switchTo}
      </button>
    </div>
  );
}
```

---

## 三、LanguageSwitcher 组件

`apps/web/components/LanguageSwitcher.tsx` — 语言切换按钮，带悬停动画：

```tsx
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <button
      onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
      className="rounded-lg px-2.5 py-1.5 font-mono text-xs tracking-wider ..."
      title={locale === "zh" ? "Switch to English" : "切换到中文"}
    >
      {t("lang").switchTo}
    </button>
  );
}
```

### 放置位置

1. **侧边栏底部**（`Sidebar.tsx`）— 与 ThemeSwitcher 同行
2. **登录页底部** — "SYSTEM READY" 旁
3. **注册页底部** — 同上

---

## 四、字体排版优化

### 4.1 中文字体回退栈

在所有字体声明末尾追加中文字体，英文继续保持等宽（JetBrains Mono），中文自动降级：

```
"PingFang SC", "Microsoft YaHei", "Noto Sans SC"
```

### 4.2 修改的文件

| 文件 | 字段 |
|------|------|
| `globals.css` | `body` 和 `h1-h6` 的 `font-family` |
| `tailwind.config.ts` | `fontFamily.heading/body/mono` |
| `packages/ui/src/styles/tokens.css` | `--ui-font-sans`, `--ui-font-mono` |

---

## 五、CSS 样式打磨

### 5.1 新增动画

| 动画名称 | 用途 | 参数 |
|----------|------|------|
| `fade-in` | 简单淡入 | 0.3s ease |
| `slide-in-right` | 右侧面板滑入 | 0.3s cubic-bezier |
| `scale-in` | 模态框弹出 | 0.2s cubic-bezier |
| `shimmer` | 加载骨架屏光泽 | 1.5s ease-in-out infinite |

### 5.2 杂色纹理叠加

在 `layout.tsx` 的 `<body>` 上添加 `noise-overlay` 类，通过 CSS `::after` 伪元素渲染 SVG 杂色纹理（`opacity: 0.015`），为纯色暗黑背景增加质感。

### 5.3 玻璃效果优化

- `backdrop-filter: blur(20px)`（card-panel）/ `blur(24px)`（glass-panel）
- 背景不透明度从 0.82 调至 0.78，更通透
- 边框不透明度从 0.25 调至 0.22，更柔和

### 5.4 滚动条

- 宽度从 5px 减至 4px
- 悬停时增加发光效果：`box-shadow: 0 0 8px var(--theme-accent-glow)`

### 5.5 输入框改进

- 增加默认半透明背景：`background-color: rgba(0, 0, 0, 0.25)`
- 聚焦时增加内阴影：`inset 0 0 8px rgba(0, 0, 0, 0.3)`
- 增加 `::placeholder` 样式（`opacity: 0.6`）

### 5.6 Sidebar 活跃状态

```css
.sidebar-item.active {
  box-shadow: inset 0 0 12px rgba(0, 255, 65, 0.05);
}
```

### 5.7 主题色值微调

所有四个主题的背景色、边框色、发光色均做了 2-5% 的微调，使其更通透和谐。

---

## 六、文件变更清单

### 新增文件

| 文件 | 用途 |
|------|------|
| `apps/web/lib/i18n/index.ts` | i18n 导出入口 |
| `apps/web/lib/i18n/context.tsx` | I18nProvider + useI18n |
| `apps/web/lib/i18n/translations/en.ts` | 英文翻译（~120 键） |
| `apps/web/lib/i18n/translations/zh.ts` | 中文翻译（与 en.ts 结构一致） |
| `apps/web/components/LanguageSwitcher.tsx` | 语言切换按钮组件 |

### 修改文件

| 文件 | 改动内容 |
|------|----------|
| `apps/web/app/providers.tsx` | 增加 I18nProvider |
| `apps/web/app/layout.tsx` | lang="en"（原 zh-CN），body 增加 noise-overlay |
| `apps/web/app/globals.css` | 中文字体回退、新动画、杂色纹理、输入框/滚动条优化 |
| `apps/web/tailwind.config.ts` | fontFamily 增加中文字体，新增 4 个动画定义 |
| `packages/ui/src/styles/tokens.css` | 中文字体回退 |
| `apps/web/app/(auth)/login/page.tsx` | 全部文本替换为 t()，底部增加 LanguageSwitcher |
| `apps/web/app/(auth)/register/page.tsx` | 同上 |
| `apps/web/app/(market)/agents/page.tsx` | 全部文本替换为 t() |
| `apps/web/app/(market)/agents/contacts/page.tsx` | 同上 |
| `apps/web/app/(market)/agents/[id]/page.tsx` | 同上 |
| `apps/web/components/Sidebar.tsx` | 文本替换为 t()，增加 LanguageSwitcher + i18n 导入 |
| `apps/web/components/ChatPanel.tsx` | 文本替换为 t() |
| `apps/web/components/RightPanel.tsx` | 同上 |
| `apps/web/components/AgentCard.tsx` | 同上（provider 标签动态获取） |
| `apps/web/components/AgentDetailContent.tsx` | 同上 |
| `apps/web/components/CreateAgentModal.tsx` | 同上 |
| `apps/web/components/AuthGuard.tsx` | 同上 |
| `apps/web/components/TypingIndicator.tsx` | 同上 |
| `apps/web/components/ThemeSwitcher.tsx` | 主题名使用 t('themes') |
| `apps/web/components/BackgroundEffects.tsx` | 重构为数据驱动渲染，动画参数优化 |

---

## 七、构建验证

```bash
pnpm --filter @agenthub/web typecheck  # 通过（仅剩测试文件预存错误）
pnpm --filter @agenthub/web build      # 构建成功
```

---

## 八、使用方式

```bash
# 启动 dev 服务
pnpm dev
# 访问 http://localhost:3456
```

- **切换语言**：点击侧边栏底部的"中文"或"EN"按钮，或登录/注册页底部的语言切换按钮
- **切换主题**：侧边栏底部的彩色圆点（绿/蓝/紫/红）
- **语言/主题均自动保存**至 localStorage，刷新后保持
