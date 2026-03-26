"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/components/locale-provider";
import { localizeScenarioGoal, localizeScenarioName, localizeStageLabel } from "@/lib/i18n";
import { getScenario } from "@/lib/scenarios";
import type { RunRecord } from "@/lib/types";

interface RunMonitorProps {
  initialRun: RunRecord;
}

export function RunMonitor({ initialRun }: RunMonitorProps) {
  const { locale, t } = useTranslations();
  const [run, setRun] = useState(initialRun);
  const [timelineMode, setTimelineMode] = useState<"agents" | "feed">("agents");
  const [personaFilter, setPersonaFilter] = useState<"all" | "Speedrunner" | "Novice" | "ChaosAgent">("all");
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | "succeeded" | "failed">("all");

  useEffect(() => {
    if (run.status === "completed" || run.status === "failed") {
      return;
    }

    let active = true;

    async function refresh() {
      try {
        const response = await fetch(`/api/runs/${run.id}`, { cache: "no-store" });

        if (!response.ok || !active) {
          return;
        }

        const payload = (await response.json()) as RunRecord;

        if (active) {
          setRun(payload);
        }
      } catch {
        // Keep the current snapshot and retry on the next interval.
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 1200);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [run.id, run.status]);

  const reportReady = run.status === "completed";
  const scenario = useMemo(() => getScenario(run.scenarioId), [run.scenarioId]);
  const scenarioName = localizeScenarioName(locale, scenario, run.scenarioName);
  const scenarioGoal = localizeScenarioGoal(locale, scenario, run.goal);
  const runStatusLabel =
    run.status === "completed"
      ? t("run.status.completed")
      : run.status === "failed"
        ? t("run.status.failed")
        : run.status === "running"
          ? t("run.status.running")
          : t("run.status.queued");
  const latestEventsByAgent = Array.from(
    run.events.reduce((map, event) => {
      map.set(event.agentId, event);
      return map;
    }, new Map<string, RunRecord["events"][number]>()),
  )
    .map(([, event]) => event)
    .sort((left, right) => left.agentId.localeCompare(right.agentId));
  const sourceEvents = timelineMode === "agents" ? latestEventsByAgent : run.events.slice(-32).reverse();
  const visibleEvents = sourceEvents.filter((event) => {
    if (personaFilter !== "all" && event.persona !== personaFilter) {
      return false;
    }

    if (outcomeFilter === "succeeded" && !event.actionOk) {
      return false;
    }

    if (outcomeFilter === "failed" && event.actionOk) {
      return false;
    }

    return true;
  });
  const latestEventMap = latestEventsByAgent.reduce(
    (map, event) => {
      map[event.agentId] = event;
      return map;
    },
    {} as Record<string, RunRecord["events"][number]>,
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
      <section className="panel-strong rounded-[2rem] px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm uppercase tracking-[0.3em] text-[var(--muted)]">{t("run.details")}</p>
              <StatusBadge status={run.status} label={runStatusLabel} />
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{scenarioName}</h1>
            <p className="mt-3 max-w-3xl text-base leading-8 text-[var(--muted)]">{scenarioGoal}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {reportReady ? (
              <Link
                href={`/reports/${run.id}`}
                className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white"
              >
                {t("run.openReport")}
              </Link>
            ) : (
              <span className="rounded-full border border-[var(--line)] bg-white/60 px-5 py-3 text-sm font-semibold text-[var(--muted)]">
                {t("run.reportPending")}
              </span>
            )}
            <Link
              href="/runs/new"
              className="rounded-full border border-[var(--line)] px-5 py-3 text-sm font-semibold"
            >
              {t("run.launchAnother")}
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-4">
        <MetricCard label={t("run.agents")} value={String(run.agentCount)} />
        <MetricCard label={t("run.completed")} value={`${run.summary.completed}/${run.agentCount}`} />
        <MetricCard label={t("run.averageSteps")} value={String(run.summary.averageSteps)} />
        <MetricCard label={t("run.peakFrustration")} value={`${run.summary.peakFrustration}%`} tone="danger" />
      </section>

      <section className="mt-8 panel rounded-[2rem] p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">{t("run.swarmBoard")}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">{t("run.swarmBoardTitle")}</h2>
          </div>
          <p className="text-sm text-[var(--muted)]">
            {run.status === "completed"
              ? t("run.swarmBoardCompleted")
              : run.status === "failed"
                ? t("run.swarmBoardFailed")
                : t("run.swarmBoardLive")}
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {run.agentRuns.length === 0 ? (
            <div className="rounded-[1.3rem] border border-[var(--line)] bg-white/60 px-4 py-4 text-sm text-[var(--muted)] md:col-span-2 xl:col-span-3">
              {t("run.noAgentState")}
            </div>
          ) : (
            run.agentRuns
              .slice()
              .sort((left, right) => left.agentId.localeCompare(right.agentId))
              .map((agentRun) => {
                const latestEvent = latestEventMap[agentRun.agentId];

                return (
                  <article key={agentRun.agentId} className="rounded-[1.4rem] border border-[var(--line)] bg-white/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{agentRun.agentId}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                          {formatPersonaLabel(agentRun.persona.archetype, locale)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${agentStatusPalette(agentRun)}`}
                      >
                        {agentRun.failed
                          ? t("run.agentStatus.failed")
                          : agentRun.completed
                            ? t("run.agentStatus.completed")
                            : t("run.agentStatus.running")}
                      </span>
                    </div>

                    {latestEvent ? (
                      <>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {latestEvent.stageLabel ? (
                            <span className="rounded-full bg-[rgba(200,76,38,0.1)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                              {localizeStageLabel(locale, scenario, latestEvent.stageLabel)}
                            </span>
                          ) : null}
                          <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                            step {latestEvent.step}
                          </span>
                        </div>
                        <p className="mt-3 text-base font-semibold">{latestEvent.title}</p>
                        <p className="mt-1 text-sm leading-7 text-[var(--muted)]">{latestEvent.detail}</p>
                        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{t("run.why")}</p>
                        <p className="mt-1 text-sm leading-7 text-[var(--muted)]">{latestEvent.rationale}</p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-[1rem] bg-[rgba(23,20,18,0.04)] px-3 py-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("run.emotion")}</p>
                            <p className="mt-1 text-sm">
                              {latestEvent.frustration}% frustration / {latestEvent.confidence}% confidence
                            </p>
                          </div>
                          <div className="rounded-[1rem] bg-[rgba(23,20,18,0.04)] px-3 py-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("run.technicalState")}</p>
                            <p className="mt-1 text-sm text-[var(--muted)]">
                              {latestEvent.actionCode} on a {latestEvent.loadState} page ·{" "}
                              {formatExecutionAssistMode(latestEvent.executionAssistMode, locale)}
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{t("run.noLatestEvent")}</p>
                    )}
                  </article>
                );
              })
          )}
        </div>
      </section>

      {run.personaSummary.length > 0 ? (
        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          {run.personaSummary.map((persona) => (
            <div key={persona.archetype} className="panel rounded-[1.7rem] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">
                    {formatPersonaLabel(persona.archetype, locale)}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{persona.total}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${personaTone(persona.archetype)}`}
                >
                  {t("run.personaSummaryTag")}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-[var(--muted)]">
                <div className="rounded-[1rem] bg-white/60 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em]">{t("run.personaSummaryCompleted")}</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{persona.completed}</p>
                </div>
                <div className="rounded-[1rem] bg-white/60 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em]">{t("run.personaSummaryFailed")}</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{persona.failed}</p>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="panel rounded-[2rem] p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">{t("run.stagePressure")}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">{t("run.stagePressureTitle")}</h2>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {run.stageSummary.map((stage) => (
              <div key={stage.label} className="rounded-[1.4rem] border border-[var(--line)] bg-white/60 p-4">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold">{localizeStageLabel(locale, scenario, stage.label)}</h3>
                  <span className="font-mono text-sm text-[var(--muted)]">{t("run.reached", { count: stage.reached })}</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-[rgba(23,20,18,0.08)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${Math.min(100, (stage.reached / Math.max(run.agentCount, 1)) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">{t("run.frictionHere", { count: stage.stuck })}</p>
              </div>
            ))}
          </div>
        </article>

        <aside className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">{t("run.warnings")}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">{t("run.runtimePosture")}</h2>
          <div className="mt-5 space-y-3">
            {run.warnings.length === 0 ? (
              <div className="rounded-[1.25rem] border border-[rgba(32,109,71,0.16)] bg-[rgba(32,109,71,0.08)] p-4 text-sm text-[var(--success)]">
                {t("run.noWarnings")}
              </div>
            ) : (
              run.warnings.map((warning) => (
                <div
                  key={warning}
                  className="rounded-[1.25rem] border border-[rgba(200,76,38,0.18)] bg-[rgba(200,76,38,0.08)] p-4 text-sm leading-7 text-[var(--foreground)]"
                >
                  {warning}
                </div>
              ))
            )}
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-[var(--line)] bg-white/55 p-5">
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">{t("run.storageExecution")}</p>
            <p className="mt-3 break-all text-sm leading-7 text-[var(--muted)]">
              {t("run.storageExecutionBody", {
                storageMode: run.storageMode,
                executionMode: run.executionMode,
                runId: run.id,
              })}
            </p>
          </div>
        </aside>
      </section>

      <section className="mt-8 panel rounded-[2rem] p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">{t("run.timeline")}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">{t("run.timelineTitle")}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex overflow-hidden rounded-full border border-[var(--line)] bg-white/70">
              <button
                type="button"
                onClick={() => setTimelineMode("agents")}
                className={`px-4 py-2 text-sm font-semibold ${
                  timelineMode === "agents" ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"
                }`}
              >
                {t("run.latestPerAgent")}
              </button>
              <button
                type="button"
                onClick={() => setTimelineMode("feed")}
                className={`px-4 py-2 text-sm font-semibold ${
                  timelineMode === "feed" ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"
                }`}
              >
                {t("run.fullFeed")}
              </button>
            </div>
            <select
              value={personaFilter}
              onChange={(event) => setPersonaFilter(event.target.value as "all" | "Speedrunner" | "Novice" | "ChaosAgent")}
              className="rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm text-[var(--foreground)]"
            >
              <option value="all">{t("run.allPersonas")}</option>
              <option value="Speedrunner">{formatPersonaLabel("Speedrunner", locale)}</option>
              <option value="Novice">{formatPersonaLabel("Novice", locale)}</option>
              <option value="ChaosAgent">{formatPersonaLabel("ChaosAgent", locale)}</option>
            </select>
            <select
              value={outcomeFilter}
              onChange={(event) => setOutcomeFilter(event.target.value as "all" | "succeeded" | "failed")}
              className="rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm text-[var(--foreground)]"
            >
              <option value="all">{t("run.anyOutcome")}</option>
              <option value="succeeded">{t("run.outcomeSucceeded")}</option>
              <option value="failed">{t("run.outcomeFailed")}</option>
            </select>
            <p className="text-sm text-[var(--muted)]">
              {run.status === "completed"
                ? t("run.timelineFinished")
                : run.status === "failed"
                  ? t("run.timelineFailed")
                  : t("run.timelineLive")}
            </p>
          </div>
        </div>
        <div className="mt-3 text-sm text-[var(--muted)]">
          {t("run.timelineShowing", {
            visible: visibleEvents.length,
            total: sourceEvents.length,
            kind: timelineMode === "agents" ? t("run.timelineAgentStates") : t("run.timelineRecentEvents"),
          })}
        </div>
        <div className="mt-6 space-y-3">
          {run.events.length === 0 ? (
            <div className="rounded-[1.3rem] border border-[var(--line)] bg-white/60 px-4 py-4 text-sm text-[var(--muted)]">
              {t("run.timelineEmpty")}
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="rounded-[1.3rem] border border-[var(--line)] bg-white/60 px-4 py-4 text-sm text-[var(--muted)]">
              {t("run.timelineNoMatch")}
            </div>
          ) : (
            visibleEvents.map((event) => (
              <div
                key={event.id}
                className="grid gap-3 rounded-[1.3rem] border border-[var(--line)] bg-white/60 px-4 py-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1.2fr]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{event.agentId}</p>
                    <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      step {event.step}
                    </span>
                    {event.stageLabel ? (
                      <span className="rounded-full bg-[rgba(200,76,38,0.1)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                        {localizeStageLabel(locale, scenario, event.stageLabel)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-base font-semibold">{event.title}</p>
                  <p className="mt-1 text-sm leading-7 text-[var(--muted)]">{event.detail}</p>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">{t("run.why")}</p>
                  <p className="text-sm leading-7 text-[var(--muted)]">{event.rationale}</p>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">{t("run.emotion")}</p>
                  <p className="text-sm">
                    {event.frustration}% frustration / {event.confidence}% confidence
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                    {event.actionOk ? t("run.stepSucceeded") : t("run.stepFailed")}
                  </p>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">{t("run.technicalDetail")}</p>
                  <p className="text-sm leading-7 text-[var(--muted)]">
                    {event.actionCode} on a {event.loadState} page. {formatExecutionAssistMode(event.executionAssistMode, locale)}.
                  </p>
                  <p className="mt-2 break-all text-sm leading-7 text-[var(--muted)]">{event.url}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="panel rounded-[1.7rem] p-5">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p
        className={`metric-value mt-3 text-4xl font-semibold tracking-tight ${
          tone === "danger" ? "text-[var(--danger)]" : "text-[var(--foreground)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function formatPersonaLabel(archetype: "Speedrunner" | "Novice" | "ChaosAgent", locale: "en" | "zh") {
  if (archetype === "ChaosAgent") {
    return locale === "zh" ? "混沌型" : "Chaos Agent";
  }

  if (archetype === "Speedrunner") {
    return locale === "zh" ? "速通型" : archetype;
  }

  return locale === "zh" ? "新手型" : archetype;
}

function formatExecutionAssistMode(
  mode: RunRecord["events"][number]["executionAssistMode"],
  locale: "en" | "zh",
) {
  if (mode === "visual_only") {
    return locale === "zh" ? "纯视觉执行" : "visual only";
  }

  if (mode === "visual_with_dom_assist") {
    return locale === "zh" ? "视觉执行 + DOM 兜底" : "visual + DOM assist";
  }

  if (mode === "dom_only") {
    return locale === "zh" ? "纯 DOM 兜底" : "DOM only";
  }

  return locale === "zh" ? "无直接交互" : "no direct interaction";
}

function personaTone(archetype: "Speedrunner" | "Novice" | "ChaosAgent") {
  if (archetype === "Speedrunner") {
    return "bg-[rgba(36,107,168,0.1)] text-[rgb(36,107,168)]";
  }

  if (archetype === "ChaosAgent") {
    return "bg-[rgba(181,41,23,0.1)] text-[var(--danger)]";
  }

  return "bg-[rgba(32,109,71,0.1)] text-[var(--success)]";
}

function agentStatusPalette(agentRun: RunRecord["agentRuns"][number]) {
  if (agentRun.failed) {
    return "bg-[rgba(181,41,23,0.1)] text-[var(--danger)]";
  }

  if (agentRun.completed) {
    return "bg-[rgba(32,109,71,0.1)] text-[var(--success)]";
  }

  return "bg-[rgba(200,76,38,0.1)] text-[var(--accent)]";
}

function StatusBadge({ status, label }: { status: RunRecord["status"]; label: string }) {
  const palette =
    status === "completed"
      ? "border-[rgba(32,109,71,0.18)] bg-[rgba(32,109,71,0.08)] text-[var(--success)]"
      : status === "failed"
        ? "border-[rgba(181,41,23,0.18)] bg-[rgba(181,41,23,0.08)] text-[var(--danger)]"
        : "border-[rgba(200,76,38,0.18)] bg-[rgba(200,76,38,0.08)] text-[var(--accent)]";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${palette}`}>
      {label}
    </span>
  );
}
