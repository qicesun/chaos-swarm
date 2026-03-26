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

type Locale = "en" | "zh";
type TimelineMode = "agents" | "feed";
type OutcomeFilter = "all" | "succeeded" | "failed";
type PersonaFilter = "all" | "Speedrunner" | "Novice" | "ChaosAgent";

function pick(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function personaLabel(archetype: "Speedrunner" | "Novice" | "ChaosAgent", locale: Locale) {
  if (archetype === "Speedrunner") return pick(locale, "Speedrunner", "速通型");
  if (archetype === "ChaosAgent") return pick(locale, "Chaos Agent", "混乱型");
  return pick(locale, "Novice", "新手型");
}

function executionAssistLabel(mode: RunRecord["events"][number]["executionAssistMode"], locale: Locale) {
  if (mode === "visual_only") return pick(locale, "Pure visual", "纯视觉");
  if (mode === "visual_with_dom_assist") return pick(locale, "Visual + DOM recovery", "视觉 + DOM 恢复");
  if (mode === "dom_only") return pick(locale, "DOM only", "纯 DOM");
  return pick(locale, "No direct interaction", "没有直接交互");
}

function statusPalette(status: RunRecord["status"]) {
  if (status === "completed") return "border-[rgba(32,109,71,0.18)] bg-[rgba(32,109,71,0.08)] text-[var(--success)]";
  if (status === "failed") return "border-[rgba(181,41,23,0.18)] bg-[rgba(181,41,23,0.08)] text-[var(--danger)]";
  return "border-[rgba(200,76,38,0.18)] bg-[rgba(200,76,38,0.08)] text-[var(--accent)]";
}

function statusLabel(status: RunRecord["status"], locale: Locale) {
  if (status === "completed") return pick(locale, "completed", "已完成");
  if (status === "failed") return pick(locale, "failed", "失败");
  if (status === "running") return pick(locale, "running", "运行中");
  return pick(locale, "queued", "排队中");
}

function eventTitle(event: RunRecord["events"][number], locale: Locale) {
  return locale === "zh" ? event.titleZh ?? event.title : event.title;
}

function eventDetail(event: RunRecord["events"][number], locale: Locale) {
  return locale === "zh" ? event.detailZh ?? event.detail : event.detail;
}

function eventRationale(event: RunRecord["events"][number], locale: Locale) {
  return locale === "zh" ? event.rationaleZh ?? event.rationale : event.rationale;
}

function localizeWarning(locale: Locale, warning: string) {
  if (locale !== "zh") {
    return warning;
  }

  if (/^OpenAI autonomous agent runtime is active via /i.test(warning)) {
    const model = warning.replace(/^OpenAI autonomous agent runtime is active via /i, "").replace(/\.$/, "");
    return `OpenAI 自主 Agent 运行时已启用，当前模型是 ${model}。`;
  }

  if (warning === "OPENAI_API_KEY is missing, so autonomous agent execution cannot start.") {
    return "缺少 OPENAI_API_KEY，因此无法启动真实的 AI Agent 执行。";
  }

  if (warning === "Browser execution is still in simulation mode.") {
    return "浏览器执行仍处于 simulation 模式。";
  }

  if (warning === "Local Playwright execution is active on this workstation; Browserbase fan-out is not enabled yet.") {
    return "当前使用这台机器上的本地 Playwright 执行；Browserbase 云端扇出还没有启用。";
  }

  if (warning === "Browserbase cloud execution is active for public runs.") {
    return "公开运行当前走 Browserbase 云端执行。";
  }

  if (warning === "Hybrid execution is configured, but Browserbase credentials are incomplete.") {
    return "已经配置 hybrid 执行，但 Browserbase 凭据还不完整。";
  }

  if (warning === "Strict visual mode is enabled: click and fill actions will not fall back to DOM locators.") {
    return "严格视觉模式已开启：点击和输入动作失败后不会再回退到 DOM locator。";
  }

  if (warning === "Hybrid visual mode is enabled: coordinate-first execution can fall back to DOM locators when needed.") {
    return "当前是混合视觉模式：优先按坐标执行，必要时会回退到 DOM locator。";
  }

  if (warning === "Supabase persistence is disabled.") {
    return "Supabase 持久化当前未启用。";
  }

  if (/^Supabase persistence is active via /i.test(warning)) {
    const mode = warning.replace(/^Supabase persistence is active via /i, "").replace(/\.$/, "");
    return `Supabase 持久化已启用，当前模式是 ${mode}。`;
  }

  if (warning === "This run is using an AI-compiled scenario profile generated from the supplied URL and goal.") {
    return "这次运行使用了根据你提供的 URL 和目标由 AI 自动编译出来的场景画像。";
  }

  if (/^This run fell back to the deterministic custom-scenario template/i.test(warning)) {
    const reason = warning.replace(/^This run fell back to the deterministic custom-scenario template\.?\s*/i, "");
    return `这次运行没有成功完成 AI 场景编译，因此回退到了确定性的自定义场景模板。${reason}`;
  }

  return warning;
}

function buildFounderCards(run: RunRecord, locale: Locale) {
  const topStage =
    run.stageSummary.slice().sort((a, b) => b.stuck - a.stuck || b.reached - a.reached)[0] ?? null;
  const topCluster = run.report.failureClusters[0] ?? null;
  const hasOperationalNoise = run.report.failureClusters.some(
    (cluster) =>
      cluster.signature.startsWith("runner_") ||
      cluster.signature === "environment_blocked" ||
      cluster.signature === "strict_visual_execution_limit",
  );

  return [
    {
      title: pick(locale, "What happened", "发生了什么"),
      body:
        run.status === "completed"
          ? locale === "zh"
            ? run.report.readable.overview.zh
            : run.report.readable.overview.en
          : pick(
              locale,
              "The swarm is still running, so this is a live summary rather than a final verdict.",
              "蜂群仍在运行中，所以这里是实时摘要，不是最终结论。",
            ),
    },
    {
      title: pick(locale, "Can I trust this result?", "这次结果可信吗？"),
      body: hasOperationalNoise
        ? pick(
            locale,
            "This run mixes UX signal with runtime or environment noise. Trust blocker patterns more than the raw friction score.",
            "这次运行混入了一部分运行时或环境噪音。优先相信“卡在哪、为什么卡”的模式，不要过度解读绝对阻力分数。",
          )
        : pick(
            locale,
            "This run is operationally clean enough to treat the main friction patterns as product signal.",
            "这次运行在工程层面足够干净，可以把主要阻力模式视为产品信号。",
          ),
    },
    {
      title: pick(locale, "What should I inspect next?", "下一步先检查什么？"),
      body: topCluster
        ? pick(
            locale,
            `Inspect "${topCluster.label}" first. That is the strongest failure pattern in this run.`,
            `先看“${topCluster.label}”。这是这次运行里最强的失败模式。`,
          )
        : topStage
          ? pick(
              locale,
              `Inspect "${topStage.label}" first. That stage concentrated the most visible hesitation.`,
              `先看“${topStage.label}”。这个阶段集中出现了最多的明显犹豫。`,
            )
          : pick(
              locale,
              "No single dominant blocker surfaced yet. Increase sample size or let the run finish.",
              "目前还没有出现单一主导阻断点。可以增加样本量，或先让这次运行跑完。",
            ),
    },
  ];
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

export function RunMonitor({ initialRun }: RunMonitorProps) {
  const { locale, t } = useTranslations();
  const [run, setRun] = useState(initialRun);
  const [timelineMode, setTimelineMode] = useState<TimelineMode>("agents");
  const [personaFilter, setPersonaFilter] = useState<PersonaFilter>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");

  useEffect(() => {
    if (run.status === "completed" || run.status === "failed") return;

    let active = true;
    async function refresh() {
      try {
        const response = await fetch(`/api/runs/${run.id}`, { cache: "no-store" });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as RunRecord;
        if (active) setRun(payload);
      } catch {
        // Keep current snapshot and retry next tick.
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 1200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [run.id, run.status]);

  const scenario = useMemo(() => run.scenarioProfile ?? getScenario(run.scenarioId), [run.scenarioId, run.scenarioProfile]);
  const scenarioName = localizeScenarioName(locale, scenario, run.scenarioName);
  const scenarioGoal = localizeScenarioGoal(locale, scenario, run.goal);
  const founderCards = useMemo(() => buildFounderCards(run, locale), [run, locale]);

  const latestEventsByAgent = Array.from(
    run.events.reduce((map, event) => {
      map.set(event.agentId, event);
      return map;
    }, new Map<string, RunRecord["events"][number]>()),
  )
    .map(([, event]) => event)
    .sort((left, right) => left.agentId.localeCompare(right.agentId));

  const latestEventMap = latestEventsByAgent.reduce(
    (map, event) => {
      map[event.agentId] = event;
      return map;
    },
    {} as Record<string, RunRecord["events"][number]>,
  );

  const sourceEvents = timelineMode === "agents" ? latestEventsByAgent : run.events.slice(-32).reverse();
  const visibleEvents = sourceEvents.filter((event) => {
    if (personaFilter !== "all" && event.persona !== personaFilter) return false;
    if (outcomeFilter === "succeeded" && !event.actionOk) return false;
    if (outcomeFilter === "failed" && event.actionOk) return false;
    return true;
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
      <section className="panel-strong rounded-[2rem] px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm uppercase tracking-[0.3em] text-[var(--muted)]">{t("run.details")}</p>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusPalette(run.status)}`}
              >
                {statusLabel(run.status, locale)}
              </span>
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{scenarioName}</h1>
            <p className="mt-3 text-base leading-8 text-[var(--muted)]">{scenarioGoal}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {run.status === "completed" ? (
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
            <Link href="/runs/new" className="rounded-full border border-[var(--line)] px-5 py-3 text-sm font-semibold">
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
              {pick(locale, "Reader guide", "阅读指引")}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {pick(locale, "What this run means", "这次运行意味着什么")}
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
            {pick(
              locale,
              "Start with these cards. They answer the founder questions first, then the rest of the page gives you proof.",
              "先看下面这几张卡片。它们先回答负责人最关心的问题，后面的页面再给你证据。",
            )}
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {founderCards.map((card) => (
            <article key={card.title} className="rounded-[1.4rem] border border-[var(--line)] bg-white/65 p-5">
              <h3 className="text-base font-semibold">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{card.body}</p>
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
                          {personaLabel(agentRun.persona.archetype, locale)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          agentRun.failed
                            ? "bg-[rgba(181,41,23,0.1)] text-[var(--danger)]"
                            : agentRun.completed
                              ? "bg-[rgba(32,109,71,0.1)] text-[var(--success)]"
                              : "bg-[rgba(200,76,38,0.1)] text-[var(--accent)]"
                        }`}
                      >
                        {agentRun.failed
                          ? pick(locale, "Failed", "失败")
                          : agentRun.completed
                            ? pick(locale, "Completed", "完成")
                            : pick(locale, "Running", "运行中")}
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
                            {pick(locale, "Step", "步骤")} {latestEvent.step}
                          </span>
                        </div>
                        <p className="mt-3 text-base font-semibold">{eventTitle(latestEvent, locale)}</p>
                        <p className="mt-1 text-sm leading-7 text-[var(--muted)]">{eventDetail(latestEvent, locale)}</p>
                        <div className="mt-4 grid gap-3">
                          <div className="rounded-[1rem] bg-[rgba(23,20,18,0.04)] px-3 py-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                              {pick(locale, "Why the agent chose this move", "Agent 为什么这样做")}
                            </p>
                            <p className="mt-1 text-sm leading-7 text-[var(--muted)]">{eventRationale(latestEvent, locale)}</p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[1rem] bg-[rgba(23,20,18,0.04)] px-3 py-3">
                              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                                {pick(locale, "Signal", "信号")}
                              </p>
                              <p className="mt-1 text-sm leading-7 text-[var(--foreground)]">
                                {pick(locale, "Frustration", "挫败值")} {latestEvent.frustration}% ·{" "}
                                {pick(locale, "Confidence", "信心")} {latestEvent.confidence}%
                              </p>
                            </div>
                            <div className="rounded-[1rem] bg-[rgba(23,20,18,0.04)] px-3 py-3">
                              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                                {pick(locale, "How the system executed it", "系统是怎么执行的")}
                              </p>
                              <p className="mt-1 text-sm leading-7 text-[var(--muted)]">
                                {pick(locale, "Action", "动作")} {latestEvent.actionCode}
                                <br />
                                {pick(locale, "Page state", "页面状态")} {latestEvent.loadState}
                                <br />
                                {pick(locale, "Execution mode", "执行方式")}{" "}
                                {executionAssistLabel(latestEvent.executionAssistMode, locale)}
                              </p>
                            </div>
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

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">{t("run.stagePressure")}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">{t("run.stagePressureTitle")}</h2>
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
                  {localizeWarning(locale, warning)}
                </div>
              ))
            )}
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
              onChange={(event) => setPersonaFilter(event.target.value as PersonaFilter)}
              className="rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm text-[var(--foreground)]"
            >
              <option value="all">{t("run.allPersonas")}</option>
              <option value="Speedrunner">{personaLabel("Speedrunner", locale)}</option>
              <option value="Novice">{personaLabel("Novice", locale)}</option>
              <option value="ChaosAgent">{personaLabel("ChaosAgent", locale)}</option>
            </select>
            <select
              value={outcomeFilter}
              onChange={(event) => setOutcomeFilter(event.target.value as OutcomeFilter)}
              className="rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm text-[var(--foreground)]"
            >
              <option value="all">{t("run.anyOutcome")}</option>
              <option value="succeeded">{t("run.outcomeSucceeded")}</option>
              <option value="failed">{t("run.outcomeFailed")}</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
          <span>
            {t("run.timelineShowing", {
              visible: visibleEvents.length,
              total: sourceEvents.length,
              kind: timelineMode === "agents" ? t("run.timelineAgentStates") : t("run.timelineRecentEvents"),
            })}
          </span>
          <span>
            {run.status === "completed"
              ? t("run.timelineFinished")
              : run.status === "failed"
                ? t("run.timelineFailed")
                : t("run.timelineLive")}
          </span>
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
                className="grid gap-4 rounded-[1.3rem] border border-[var(--line)] bg-white/60 px-4 py-4 lg:grid-cols-[1.2fr_0.95fr_0.9fr]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{event.agentId}</p>
                    <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      {pick(locale, "Step", "步骤")} {event.step}
                    </span>
                    {event.stageLabel ? (
                      <span className="rounded-full bg-[rgba(200,76,38,0.1)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                        {localizeStageLabel(locale, scenario, event.stageLabel)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-base font-semibold">{eventTitle(event, locale)}</p>
                  <p className="mt-1 text-sm leading-7 text-[var(--muted)]">{eventDetail(event, locale)}</p>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">
                    {pick(locale, "Why the agent acted", "Agent 为什么这样做")}
                  </p>
                  <p className="mt-1 text-sm leading-7 text-[var(--muted)]">{eventRationale(event, locale)}</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                    {pick(locale, "Frustration", "挫败值")} {event.frustration}% ·{" "}
                    {pick(locale, "Confidence", "信心")} {event.confidence}%
                  </p>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">
                    {pick(locale, "How the system executed it", "系统是怎么执行的")}
                  </p>
                  <p className="mt-1 text-sm leading-7 text-[var(--muted)]">
                    {pick(locale, "Raw action", "原始动作")} {event.actionCode}
                    <br />
                    {pick(locale, "Page state", "页面状态")} {event.loadState}
                    <br />
                    {pick(locale, "Execution mode", "执行方式")} {executionAssistLabel(event.executionAssistMode, locale)}
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
