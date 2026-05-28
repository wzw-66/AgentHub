"use client";

import { useI18n } from "@/lib/i18n";

const LANGUAGES = [
  { code: "en" as const, label: "EN" },
  { code: "zh" as const, label: "中文" },
];

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex items-center gap-2">
      <span
        className="font-mono text-[10px] tracking-[0.15em] select-none"
        style={{ color: "var(--theme-text-muted)" }}
      ></span>
      <div
        className="flex rounded-md overflow-hidden"
        style={{
          border: "1px solid var(--theme-border-light)",
          background: "var(--theme-bg-glass)",
        }}
      >
        {LANGUAGES.map((lang) => {
          const isActive = locale === lang.code;
          return (
            <button
              key={lang.code}
              onClick={() => setLocale(lang.code)}
              className={`
                relative px-2.5 py-1 font-mono text-[11px] tracking-wider
                transition-all duration-200 select-none
                ${isActive ? "" : "hover:opacity-80"}
              `}
              style={{
                color: isActive
                  ? "var(--theme-text-inverse)"
                  : "var(--theme-text-dim)",
                background: isActive ? "var(--theme-accent)" : "transparent",
                textShadow: isActive
                  ? `0 0 6px var(--theme-accent-glow)`
                  : "none",
                boxShadow: isActive
                  ? "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.1)"
                  : "none",
                minWidth: 34,
              }}
              title={lang.code === "en" ? "Switch to English" : "切换到中文"}
            >
              {/* Active state glow */}
              {isActive && (
                <span
                  className="absolute inset-0 rounded-md pointer-events-none"
                  style={{
                    background: "var(--theme-accent)",
                    filter: "blur(6px)",
                    opacity: 0.3,
                    zIndex: -1,
                  }}
                />
              )}
              {lang.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
