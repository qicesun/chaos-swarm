"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslations } from "@/components/locale-provider";
import { localizeScenario } from "@/lib/i18n";
import { listScenarios } from "@/lib/scenarios";

const featureCards = [
  {
    titleKey: "feature.hybrid.title",
    bodyKey: "feature.hybrid.body",
  },
  {
    titleKey: "feature.persona.title",
    bodyKey: "feature.persona.body",
  },
  {
    titleKey: "feature.report.title",
    bodyKey: "feature.report.body",
  },
] as const;

export default function Home() {
  const { locale, t } = useTranslations();
  const scenarios = useMemo(() => listScenarios().map((scenario) => localizeScenario(locale, scenario)), [locale]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
      <header className="panel-strong relative overflow-hidden rounded-[2rem] px-8 py-10 lg:px-12 lg:py-14">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top,_rgba(200,76,38,0.18),transparent_55%)] lg:block" />
        <div className="relative max-w-3xl">
          <p className="text-sm uppercase tracking-[0.35em] text-[var(--muted)]">{t("home.brand")}</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em] text-[var(--foreground)] lg:text-7xl">
            {t("home.hero.title")}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">{t("home.hero.body")}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/runs/new"
              className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
            >
              {t("home.launch")}
            </Link>
            <a
              href="https://github.com/qicesun/chaos-swarm"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[var(--line)] px-6 py-3 text-sm font-semibold text-[var(--foreground)]"
            >
              {t("home.repo")}
            </a>
          </div>
        </div>
      </header>

      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        {featureCards.map((card) => (
          <article key={card.titleKey} className="panel rounded-[1.75rem] p-6">
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">{t("home.capability")}</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{t(card.titleKey)}</h2>
            <p className="mt-3 text-base leading-7 text-[var(--muted)]">{t(card.bodyKey)}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="panel-strong rounded-[2rem] p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">{t("home.targets")}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">{t("home.targetsTitle")}</h2>
            </div>
            <Link href="/runs/new" className="text-sm font-semibold text-[var(--accent)]">
              {t("home.configure")}
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {scenarios.map((scenario) => (
              <Link
                key={scenario.id}
                href={`/runs/new?scenario=${scenario.id}`}
                className="rounded-[1.5rem] border border-[var(--line)] bg-white/55 p-5 transition hover:border-[var(--accent-soft)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">{scenario.siteLabel}</p>
                    <h3 className="mt-1 text-xl font-semibold">{scenario.name}</h3>
                  </div>
                  <span className="rounded-full bg-[rgba(200,76,38,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                    {t("home.stages", { count: scenario.frames.length })}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{scenario.description}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{scenario.targetUrl}</p>
              </Link>
            ))}
          </div>
        </div>

        <aside className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">{t("home.mvp")}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">{t("home.mvpTitle")}</h2>
          <ul className="mt-5 space-y-4 text-sm leading-7 text-[var(--muted)]">
            <li>{t("home.mvp.point1")}</li>
            <li>{t("home.mvp.point2")}</li>
            <li>{t("home.mvp.point3")}</li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
