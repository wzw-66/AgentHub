"use client";

import { useTheme, type Theme } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";

const THEME_COLORS: Record<Theme, { dot: string; bg: string }> = {
  green: { dot: "#00ff41", bg: "rgba(0,255,65,0.15)" },
  blue: { dot: "#00b4d8", bg: "rgba(0,180,216,0.15)" },
  purple: { dot: "#bb86fc", bg: "rgba(187,134,252,0.15)" },
  red: { dot: "#ff3333", bg: "rgba(255,51,51,0.15)" },
};

export function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme();
  const { t } = useI18n();

  const themeLabels: Record<Theme, string> = {
    green: t("themes").green,
    blue: t("themes").blue,
    purple: t("themes").purple,
    red: t("themes").red,
  };

  return (
    <div className="flex items-center gap-1.5">
      {themes.map((tItem) => {
        const colors = THEME_COLORS[tItem.id];
        const isActive = theme === tItem.id;
        return (
          <button
            key={tItem.id}
            onClick={() => setTheme(tItem.id)}
            title={themeLabels[tItem.id]}
            className={`relative h-6 w-6 rounded-full transition-all duration-200 ${
              isActive
                ? "scale-110 ring-2 ring-offset-1 ring-offset-[var(--theme-bg-primary)]"
                : "hover:scale-105 opacity-60 hover:opacity-90"
            }`}
            style={{
              backgroundColor: colors.dot,
              boxShadow: isActive ? `0 0 12px ${colors.dot}` : "none",
              "--tw-ring-color": colors.dot,
            } as React.CSSProperties}
          >
            {isActive && (
              <span className="absolute inset-0 flex items-center justify-center">
                <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6l2.5 2.5 4.5-5"
                    stroke={tItem.id === "green" ? "#080c08" : "#ffffff"}
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
