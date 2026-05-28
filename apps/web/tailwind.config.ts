import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        theme: {
          accent: "var(--theme-accent)",
          "accent-hover": "var(--theme-accent-hover)",
          surface: "var(--theme-bg-surface)",
          elevated: "var(--theme-bg-elevated)",
          border: "var(--theme-border)",
          "text-primary": "var(--theme-text-primary)",
          "text-secondary": "var(--theme-text-secondary)",
          "text-muted": "var(--theme-text-muted)",
        },
      },
      fontFamily: {
        heading: ['"JetBrains Mono"', '"Fira Code"', '"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', "monospace", "sans-serif"],
        body: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', '"Cascadia Code"', "Consolas", '"PingFang SC"', '"Microsoft YaHei"', '"Noto Sans SC"', "monospace", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', '"Cascadia Code"', "Consolas", '"PingFang SC"', '"Microsoft YaHei"', '"Noto Sans SC"', "monospace", "sans-serif"],
      },
      animation: {
        "fade-in-up": "fade-in-up 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        "fade-in": "fade-in 0.3s ease forwards",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "slide-in-right": "slide-in-right 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        "scale-in": "scale-in 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        shimmer: "shimmer 1.5s ease-in-out infinite",
      },
      keyframes: {
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(12px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
