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
  const scenario = useMemo(() => run.scenarioProfile ?? getScenario(run.scenarioId), [run.scenarioId, run.scenarioProfile]);
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

  const founderGuide = [
    {
      title: "1. Start with the top metrics / 先看顶部指标",
      body: "They show scale, completion, and whether the run is getting stuck. / 这四个数字先告诉你规模、完成度，以及这次运行有没有明显卡住。",
    },
    {
      title: "2. Read each agent as one storyline / 每个 agent 都是一条故事线",
      body: "The card shows what the agent tried, why it chose that move, and whether it finished. / 卡片里会显示它做了什么、为什么这么做，以及最后有没有完成。",
    },
    {
      title: "3. Open the timeline only when you need detail / 只有需要细节时再看时间线",
      body: "If something looks off, use the timeline to inspect the exact step, page state, and action mode. / 如果哪里看起来不对，再打开时间线看具体步骤、页面状态和动作方式。",
    },
  ];

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
            <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Plain-language guide / 直白说明</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">How to read this run / 这次运行怎么看</h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-[var(--muted)]">
            A founder-friendly summary first, then the technical detail if you want it. / 先看给负责人看的简版，
            需要细节时再往下看技术信息。
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {founderGuide.map((item) => (
            <article key={item.title} className="rounded-[1.25rem] border border-[var(--line)] bg-white/60 p-4">
              <p className="text-sm font-semibold tracking-tight">{item.title}</p>
              <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{item.body}</p>
            </article>
          ))}
        </div>
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
                            Step {latestEvent.step}
                          </span>
                        </div>
                        <p className="mt-3 text-base font-semibold">{latestEvent.title}</p>
                        <p className="mt-1 text-sm leading-7 text-[var(--muted)]">{latestEvent.detail}</p>
                        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{t("run.why")}</p>
                        <p className="mt-1 text-sm leading-7 text-[var(--muted)]">{latestEvent.rationale}</p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-[1rem] bg-[rgba(23,20,18,0.04)] px-3 py-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Signal / 信号</p>
                            <p className="mt-1 text-sm">
                              Frustration / 挫折 {latestEvent.frustration}% · Confidence / 信心 {latestEvent.confidence}%
                            </p>
                            <p className="mt-2 text-xs leading-6 text-[var(--muted)]">
                              A quick health check, not a diagnosis. / 这是快速状态信号，不是诊断结果。
                            </p>
                          </div>
                          <div className="rounded-[1rem] bg-[rgba(23,20,18,0.04)] px-3 py-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                              System state / 系统状态
                            </p>
                            <p className="mt-1 text-sm text-[var(--muted)]">
                              Action / 动作 {latestEvent.actionCode} · Page state / 页面状态 {latestEvent.loadState} ·
                              Assist mode / 辅助方式 {formatExecutionAssistMode(latestEvent.executionAssistMode, locale)}
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
                      Step {event.step}
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
                  <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Why / 原因</p>
                  <p className="text-sm leading-7 text-[var(--muted)]">{event.rationale}</p>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Signal / 信号</p>
                  <p className="text-sm">
                    Frustration / 挫折 {event.frustration}% · Confidence / 信心 {event.confidence}%
                  </p>
                  <p className="mt-2 text-xs leading-6 text-[var(--muted)]">
                    This is a rough signal for progress, stress, and certainty. / 这只是进展、压力和确定性的粗略信号。
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                    {event.actionOk ? t("run.stepSucceeded") : t("run.stepFailed")}
                  </p>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">System state / 系统状态</p>
                  <p className="text-sm leading-7 text-[var(--muted)]">
                    Action / 动作 {event.actionCode}. Page state / 页面状态 {event.loadState}. Assist mode / 辅助方式{" "}
                    {formatExecutionAssistMode(event.executionAssistMode, locale)}.
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
    return locale === "zh" ? "混乱型 / Chaos Agent" : "Chaos Agent / 混乱型";
  }

  if (archetype === "Speedrunner") {
    return locale === "zh" ? "速度型 / Speedrunner" : "Speedrunner / 速度型";
  }

  return locale === "zh" ? "新手型 / Novice" : "Novice / 新手型";
}

function formatExecutionAssistMode(
  mode: RunRecord["events"][number]["executionAssistMode"],
  locale: "en" | "zh",
) {
  if (mode === "visual_only") {
    return locale === "zh" ? "仅视觉 / visual only" : "visual only / 仅视觉";
  }

  if (mode === "visual_with_dom_assist") {
    return locale === "zh" ? "视觉 + DOM 辅助 / visual + DOM assist" : "visual + DOM assist / 视觉 + DOM 辅助";
  }

  if (mode === "dom_only") {
    return locale === "zh" ? "仅 DOM / DOM only" : "DOM only / 仅 DOM";
  }

  return locale === "zh" ? "无直接交互 / no direct interaction" : "no direct interaction / 无直接交互";
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
