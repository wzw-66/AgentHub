"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { en, type Translations } from "./translations/en";
import { zh } from "./translations/zh";

export type Locale = "en" | "zh";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: <K extends keyof Translations>(key: K) => Translations[K];
}

const STORAGE_KEY = "agenthub_locale";

const I18nContext = createContext<I18nContextValue | null>(null);

const translations: Record<Locale, Translations> = { en, zh };

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved === "en" || saved === "zh") {
      setLocaleState(saved);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
      localStorage.setItem(STORAGE_KEY, locale);
    }
  }, [locale, mounted]);

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
