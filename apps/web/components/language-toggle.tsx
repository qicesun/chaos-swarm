"use client";

import { useTranslations } from "./locale-provider";

export function LanguageToggle() {
  const { locale, setLocale, t } = useTranslations();

  return (
    <div className="fixed right-4 top-4 z-50 rounded-full border border-[var(--line)] bg-[rgba(255,252,246,0.88)] p-1 shadow-[0_20px_40px_rgba(23,20,18,0.08)] backdrop-blur">
      <div className="flex items-center gap-1">
        <span className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          {t("language.label")}
        </span>
        <button
          type="button"
          onClick={() => setLocale("en")}
          className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
            locale === "en" ? "bg-[var(--accent)] text-white" : "text-[var(--foreground)]"
          }`}
        >
          {t("language.english")}
        </button>
        <button
          type="button"
          onClick={() => setLocale("zh")}
          className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
            locale === "zh" ? "bg-[var(--accent)] text-white" : "text-[var(--foreground)]"
          }`}
        >
          {t("language.chinese")}
        </button>
      </div>
    </div>
  );
}
