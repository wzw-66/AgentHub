"use client";

import { useI18n } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <button
      onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
      className="btn-ghost px-2 py-1 text-xs"
      style={{ color: "var(--theme-text-dim)" }}
    >
      {locale === "zh" ? "EN" : "中文"}
    </button>
  );
}
