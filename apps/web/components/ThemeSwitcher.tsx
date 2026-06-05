"use client";

import { useTheme, type Theme } from "@/lib/theme-context";

const THEME_CONFIG: Record<Theme, { dot: string; label: string }> = {
  light: { dot: "#1a1a2e", label: "浅色" },
  dark: { dot: "#e0e0e8", label: "深色" },
};

export function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme();

  return (
    <div className="flex items-center gap-1.5">
      {themes.map((tItem) => {
        const cfg = THEME_CONFIG[tItem.id];
        const isActive = theme === tItem.id;
        return (
          <button
            key={tItem.id}
            onClick={() => setTheme(tItem.id)}
            title={cfg.label}
            className={`relative h-6 w-6 rounded-full transition-all duration-200 ${
              isActive
                ? "scale-110 ring-2 ring-offset-1"
                : "hover:scale-105 opacity-60 hover:opacity-90"
            }`}
            style={{
              backgroundColor: cfg.dot,
              boxShadow: isActive ? `0 0 12px ${cfg.dot}` : "none",
              "--tw-ring-color": cfg.dot,
            } as React.CSSProperties}
          >
            {isActive && (
              <span className="absolute inset-0 flex items-center justify-center">
                <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6l2.5 2.5 4.5-5"
                    stroke={tItem.id === "light" ? "#ffffff" : "#1a1a24"}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
