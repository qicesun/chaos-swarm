"use client";

import Link from "next/link";
import { useTranslations } from "./locale-provider";
import { LanguageToggle } from "./language-toggle";

export function AppHeader() {
  const { t } = useTranslations();

  return (
    <header className="sticky top-0 z-40 px-4 pt-4 lg:px-6">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 rounded-[1.6rem] border border-[var(--line)] bg-[rgba(255,249,242,0.82)] px-4 py-3 shadow-[0_20px_40px_rgba(106,68,41,0.08)] backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-full px-3 py-2 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--foreground)] transition hover:text-[var(--accent)]"
          >
            Chaos Swarm
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
            <Link
              href="/"
              className="rounded-full px-3 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-white/70 hover:text-[var(--foreground)]"
            >
              {t("nav.home")}
            </Link>
            <Link
              href="/runs/new"
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
            >
              {t("nav.launch")}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/runs/new"
            className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-white/70 md:hidden"
          >
            {t("nav.launch")}
          </Link>
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
