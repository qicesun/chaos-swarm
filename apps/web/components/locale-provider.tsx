"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatMessage, type Locale, type TranslationKey } from "@/lib/i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);
const STORAGE_KEY = "chaos-swarm-locale";

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const hydratedPreference = useRef(false);

  function setLocale(nextLocale: Locale) {
    setLocaleState(nextLocale);
  }

  useEffect(() => {
    if (!hydratedPreference.current) {
      hydratedPreference.current = true;

      const storedLocale = window.localStorage.getItem(STORAGE_KEY);

      if ((storedLocale === "en" || storedLocale === "zh") && storedLocale !== locale) {
        const timer = window.setTimeout(() => setLocaleState(storedLocale), 0);
        return () => window.clearTimeout(timer);
      }
    }

    document.documentElement.lang = locale;
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.cookie = `${STORAGE_KEY}=${locale}; path=/; max-age=31536000; samesite=lax`;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => formatMessage(locale, key, values),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useTranslations() {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useTranslations must be used within LocaleProvider.");
  }

  return context;
}

export function T({
  k,
  values,
}: {
  k: TranslationKey;
  values?: Record<string, string | number>;
}) {
  const { t } = useTranslations();
  return <>{t(k, values)}</>;
}
