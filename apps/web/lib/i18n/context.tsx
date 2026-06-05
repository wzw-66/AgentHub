"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import zh from "./translations/zh";
import type { Translations } from "./translations/zh";

export type Locale = "en" | "zh";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: <K extends keyof Translations>(key: K) => Translations[K];
}

const I18nContext = createContext<I18nContextValue | null>(null);

const translations: Record<Locale, Translations> = { zh, en: zh };

// Dynamic import for English to avoid circular deps
let enTranslations: Translations | null = null;
async function getEn() {
  if (!enTranslations) {
    const mod = await import("./translations/en");
    enTranslations = mod.default;
    translations.en = enTranslations;
  }
}
getEn();

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
  }, []);

  const t = useCallback(
    <K extends keyof Translations>(key: K): Translations[K] => {
      return translations[locale][key];
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
