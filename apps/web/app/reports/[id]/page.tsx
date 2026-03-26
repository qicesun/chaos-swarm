import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import type { LocalizedReportCopy, AgentStory, ReportDocument } from "@chaos-swarm/reporting";
import { T } from "@/components/locale-provider";
import { localizeStageLabel } from "@/lib/i18n";
import { getScenario } from "@/lib/scenarios";
import { getRunRecord } from "@/lib/run-service";

interface ReportPageProps {
  params: Promise<{ id: string }>;
}

type Locale = "en" | "zh";

function readLocaleFromCookieStore(store: Awaited<ReturnType<typeof cookies>>): Locale {
  const cookieValue = store.get("chaos-swarm-locale")?.value;
  return cookieValue === "zh" ? "zh" : "en";
}

function pick(locale: Locale, copy: LocalizedReportCopy) {
  return locale === "zh" ? copy.zh : copy.en;
}

function completionLabel(report: ReportDocument) {
  if (report.funnel.length === 0) {
    return "n/a";
  }

  const terminalStage =
    report.funnel.find((stage) => /complete|completed/i.test(stage.name)) ??
    report.funnel[report.funnel.length - 1];

  return `${terminalStage.completed}/${terminalStage.total}`;
}

function naLabel(locale: Locale) {
  return locale === "zh" ? "暂无" : "n/a";
}

function boolLabel(locale: Locale, value: boolean) {
  return value ? (locale === "zh" ? "开启" : "On") : locale === "zh" ? "关闭" : "Off";
}

function metricLabel(
  locale: Locale,
  key: "efi" | "completion" | "failures" | "highlights" | "visualPurity" | "domAssist",
) {
  if (locale === "zh") {
    if (key === "efi") return "总体阻力 EFI";
    if (key === "completion") return "完成情况";
    if (key === "failures") return "主要失败模式";
    if (key === "highlights") return "高光片段";
    if (key === "visualPurity") return "像真人操作的程度";
    return "DOM 恢复占比";
  }

  if (key === "efi") return "Overall friction (EFI)";
  if (key === "completion") return "Completion";
  if (key === "failures") return "Main failure patterns";
  if (key === "highlights") return "Highlight moments";
  if (key === "visualPurity") return "Human-like execution";
  return "DOM recovery share";
}

function validityCopy(locale: Locale, report: ReportDocument) {
  const hasOperationalNoise = report.failureClusters.some(
    (cluster) =>
      cluster.signature.startsWith("runner_") ||
      cluster.signature === "environment_blocked" ||
      cluster.signature === "strict_visual_execution_limit",
  );

  if (locale === "zh") {
    return hasOperationalNoise
      ? "这次结果混入了一部分运行时或环境噪音，建议先看执行有效性，再解读 UX 结论。"
      : "这次结果主要反映产品体验本身，更适合作为 UX 证据来阅读。";
  }

  return hasOperationalNoise
    ? "Part of this result was shaped by runtime or environment noise, so read execution validity before treating it as pure UX evidence."
    : "This result mostly reflects product behavior rather than runtime noise, so it is safer to read as UX evidence.";
}

function metricGuide(locale: Locale) {
  if (locale === "zh") {
    return [
      {
        title: "总体阻力 EFI",
        body: "体验阻力指数。越高表示这条路径对蜂群越费力，不一定全是失败，也可能是慢、绕、犹豫多。",
      },
      {
        title: "像真人操作的程度",
        body: "视觉纯度。越高表示 agent 越多是像真人一样靠屏幕和坐标完成动作。",
      },
      {
        title: "DOM 恢复占比",
        body: "DOM 兜底率。越高表示运行时越频繁需要结构化恢复，说明这次结果离纯视觉用户行为更远。",
      },
    ];
  }

  return [
    {
      title: "Overall friction (EFI)",
      body: "Experience friction index. Higher means the path felt harder, slower, or more fragile to the swarm.",
    },
    {
      title: "Human-like execution",
      body: "Higher means the agents stayed closer to screen-first, human-like interaction instead of runtime recovery.",
    },
    {
      title: "DOM recovery share",
      body: "Higher means the runtime had to recover more often with structure-aware help, so the run was less purely visual.",
    },
  ];
}

function topFailurePattern(locale: Locale, report: ReportDocument) {
  const cluster = report.failureClusters[0];

  if (!cluster) {
    return locale === "zh"
      ? "这次运行没有收敛到单一主导失败模式，更像是在展示一条整体比较稳定的基线路径。"
      : "This run did not converge on a single dominant failure pattern. It behaved more like a stable baseline path.";
  }

  return locale === "zh"
    ? `最强的失败模式是“${cluster.label}”。共有 ${cluster.count} 个 agent 受影响，主要原因包括：${cluster.reasons.join("；")}。`
    : `The strongest failure pattern was "${cluster.label}". It affected ${cluster.count} agent(s). Main reasons: ${cluster.reasons.join("; ")}.`;
}

function nextActionCopy(locale: Locale, report: ReportDocument) {
  const firstFinding = report.readable.findings[0];

  if (firstFinding) {
    return pick(locale, firstFinding.body);
  }

  return locale === "zh"
    ? "优先检查最靠前、最影响完成率的边界，然后再决定是产品问题还是执行问题。"
    : "Inspect the earliest high-impact boundary first, then decide whether the issue is product friction or execution noise.";
}

function atAGlance(locale: Locale, report: ReportDocument) {
  return [
    {
      title: locale === "zh" ? "发生了什么" : "What happened",
      body: pick(locale, report.readable.overview),
    },
    {
      title: locale === "zh" ? "这次结果可信吗？" : "Can I trust this result?",
      body: validityCopy(locale, report),
    },
    {
      title: locale === "zh" ? "最大问题在哪？" : "What bent the run most?",
      body: topFailurePattern(locale, report),
    },
    {
      title: locale === "zh" ? "下一步建议" : "What should I do next?",
      body: nextActionCopy(locale, report),
    },
  ];
}

function displaySectionHeading(locale: Locale, heading: string) {
  if (locale !== "zh") {
    return heading;
  }

  if (heading === "Summary") return "总结";
  if (heading === "Execution Purity") return "执行真实性";
  if (heading === "EFI") return "总体阻力 EFI";
  if (heading === "Failure Clusters") return "主要失败模式";
  if (heading === "Recommendations") return "建议";
  if (heading === "Status") return "状态";
  return heading;
}

function displayFunnelStage(locale: Locale, stageName: string, scenario: ReturnType<typeof getScenario> | null) {
  if (locale === "zh" && /goal complete/i.test(stageName)) {
    return "目标完成";
  }

  if (scenario) {
    return localizeStageLabel(locale, scenario, stageName);
  }

  return stageName;
}


export default async function ReportPage({ params }: ReportPageProps) {
  const { id } = await params;
  const record = await getRunRecord(id);

  if (!record) {
    notFound();
  }

  if (record.status !== "completed") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8 lg:px-10">
        <section className="panel-strong rounded-[2rem] px-8 py-9">
          <p className="text-sm uppercase tracking-[0.3em] text-[var(--muted)]">
            <T k="report.label" />
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            <T k="report.pendingTitle" />
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--muted)]">
            <T k="report.pendingBody" />
          </p>
          <div className="mt-8">
            <Link
              href={`/runs/${record.id}`}
              className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white"
            >
              <T k="report.backToRun" />
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const locale = readLocaleFromCookieStore(await cookies());
  const report = record.report;
  const overview = pick(locale, report.readable.overview);
  const summaryCards = atAGlance(locale, report);
  const scenario = record.scenarioProfile ?? getScenario(record.scenarioId);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
      <section className="panel-strong rounded-[2rem] px-8 py-9">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-4xl">
            <p className="text-sm uppercase tracking-[0.3em] text-[var(--muted)]">
              <T k="report.label" />
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{report.title}</h1>
            <p className="mt-4 text-lg leading-8 text-[var(--muted)]">{report.summary}</p>
            <div className="mt-6 rounded-[1.5rem] border border-[rgba(200,76,38,0.18)] bg-[rgba(200,76,38,0.08)] p-5">
              <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">
                <T k="report.readerSummary" />
              </p>
              <p className="mt-2 text-base leading-8 text-[var(--foreground)]">{overview}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{validityCopy(locale, report)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/reports/${record.id}/full?format=markdown`}
              className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white"
            >
              <T k="report.downloadMarkdown" />
            </a>
            <a
              href={`/api/reports/${record.id}/full?format=json`}
              className="rounded-full border border-[var(--line)] px-5 py-3 text-sm font-semibold"
            >
              <T k="report.downloadJson" />
            </a>
            <Link
              href={`/runs/${record.id}`}
              className="rounded-full border border-[var(--line)] px-5 py-3 text-sm font-semibold"
            >
              <T k="report.backToRun" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-4 xl:grid-cols-6">
        <MetricCard label={metricLabel(locale, "efi")} value={String(report.efi.score)} />
        <MetricCard label={metricLabel(locale, "completion")} value={completionLabel(report).replace("n/a", naLabel(locale))} />
        <MetricCard label={metricLabel(locale, "failures")} value={String(report.failureClusters.length)} />
        <MetricCard label={metricLabel(locale, "highlights")} value={String(report.highlightReel.length)} />
        <MetricCard label={metricLabel(locale, "visualPurity")} value={`${report.executionQuality.visualPurity}%`} />
        <MetricCard label={metricLabel(locale, "domAssist")} value={`${report.executionQuality.domAssistRate}%`} />
      </section>

      <section className="mt-8 panel rounded-[2rem] p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
              {locale === "zh" ? "快速结论" : "At a glance"}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {locale === "zh" ? "先看这四张卡片" : "Start with these four cards"}
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
            {locale === "zh"
              ? "先理解这次运行意味着什么，再回头读指标、漏斗和失败细节。"
              : "Understand what this run means first, then come back to the metrics, funnel, and detailed failure evidence."}
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {summaryCards.map((card) => (
            <ReadableCard key={card.title} title={card.title}>
              {card.body}
            </ReadableCard>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
            <T k="report.readerMetrics" />
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            <T k="report.readerMetricsTitle" />
          </h2>
          <div className="mt-5 grid gap-4">
            {report.readable.metrics.map((insight, index) => (
              <ReadableCard key={`${pick(locale, insight.title)}-${index}`} title={pick(locale, insight.title)}>
                {pick(locale, insight.body)}
              </ReadableCard>
            ))}
            {metricGuide(locale).map((item) => (
              <ReadableCard key={item.title} title={item.title}>
                {item.body}
              </ReadableCard>
            ))}
          </div>
        </article>

        <aside className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
            <T k="report.readerFindings" />
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            <T k="report.readerFindingsTitle" />
          </h2>
          <div className="mt-5 space-y-4">
            {report.readable.findings.map((insight, index) => (
              <ReadableCard key={`${pick(locale, insight.title)}-${index}`} title={pick(locale, insight.title)}>
                {pick(locale, insight.body)}
              </ReadableCard>
            ))}
          </div>
        </aside>
      </section>

      <section className="mt-8 panel rounded-[2rem] p-7">
        <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
          <T k="report.agentStories" />
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          <T k="report.agentStoriesTitle" />
        </h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {report.readable.agentStories.map((story, index) => (
            <AgentStoryCard key={`${story.agentId}-${index}`} locale={locale} story={story} />
          ))}
        </div>
      </section>

      <section className="mt-8 panel rounded-[2rem] p-7">
        <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
          <T k="report.portablePack" />
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          <T k="report.portablePackTitle" />
        </h2>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-[var(--muted)]">
          <T k="report.portablePackBody" />
        </p>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.95fr]">
        <article className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
            <T k="report.efiBreakdown" />
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            <T k="report.efiTitle" />
          </h2>
          <div className="mt-6 space-y-4">
            {report.efi.components.map((component) => (
              <div key={component.name}>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold uppercase tracking-[0.18em]">{component.name}</span>
                  <span className="font-mono text-sm text-[var(--muted)]">
                    <T
                      k="report.contribution"
                      values={{ score: component.score, contribution: component.contribution }}
                    />
                  </span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-[rgba(23,20,18,0.08)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${Math.min(100, component.score)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <aside className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
            <T k="report.funnel" />
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            <T k="report.funnelTitle" />
          </h2>
          <div className="mt-5 space-y-4">
            {report.funnel.map((stage) => (
              <div key={stage.name} className="rounded-[1.4rem] border border-[var(--line)] bg-white/60 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-semibold">{displayFunnelStage(locale, stage.name, scenario)}</span>
                  <span className="font-mono text-sm text-[var(--muted)]">
                    {stage.completed}/{stage.total}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  <T k="report.funnelDropped" values={{ count: stage.dropped }} />
                </p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
            <T k="report.executionPurity" />
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            <T k="report.executionPurityTitle" />
          </h2>
          <div className="mt-6 grid gap-4">
            <MetricRow
              label={<T k="report.strictVisualMode" />}
              value={boolLabel(locale, report.executionQuality.strictVisualMode)}
            />
            <MetricRow label={<T k="report.visualPurity" />} value={`${report.executionQuality.visualPurity}%`} />
            <MetricRow label={<T k="report.domAssistRate" />} value={`${report.executionQuality.domAssistRate}%`} />
            <MetricRow
              label={<T k="report.totalInteractionActions" />}
              value={String(report.executionQuality.totalInteractionActions)}
            />
            <MetricRow
              label={<T k="report.visualOnlyActions" />}
              value={String(report.executionQuality.visualOnlyActions)}
            />
            <MetricRow
              label={<T k="report.domAssistedActions" />}
              value={String(report.executionQuality.domAssistedActions)}
            />
            <MetricRow
              label={<T k="report.domOnlyActions" />}
              value={String(report.executionQuality.domOnlyActions)}
            />
          </div>
        </article>

        <article className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
            <T k="report.failureClusters" />
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            <T k="report.failureTitle" />
          </h2>
          <div className="mt-5 space-y-4">
            {report.failureClusters.length === 0 ? (
              <div className="rounded-[1.4rem] border border-[rgba(32,109,71,0.16)] bg-[rgba(32,109,71,0.08)] p-4 text-sm text-[var(--success)]">
                <T k="report.noFailureClusters" />
              </div>
            ) : (
              report.failureClusters.map((cluster) => (
                <div key={cluster.signature} className="rounded-[1.4rem] border border-[var(--line)] bg-white/60 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{cluster.label}</h3>
                      <p className="mt-1 font-mono text-xs text-[var(--muted)]">{cluster.signature}</p>
                    </div>
                    <span className="font-mono text-sm text-[var(--muted)]">{cluster.count}</span>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                    {cluster.reasons.join(locale === "zh" ? "；" : "; ")}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
            <T k="report.frictionHeat" />
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            <T k="report.frictionHeatTitle" />
          </h2>
          <div className="mt-5 rounded-[1.8rem] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(244,232,215,0.72))] p-4">
            <div className="relative aspect-[1.35/1] overflow-hidden rounded-[1.4rem] border border-dashed border-[var(--line)] bg-[radial-gradient(circle_at_center,rgba(200,76,38,0.08),transparent_42%)]">
              {report.heatmap.slice(0, 42).map((point, index) => (
                <div
                  key={`${point.note}-${point.step}-${index}`}
                  className="heat-dot"
                  style={{
                    left: `${12 + (point.step / Math.max(record.summary.averageSteps * 2, 1)) * 76}%`,
                    top: `${100 - Math.min(90, point.frustration)}%`,
                    opacity: Math.max(0.28, point.frustration / 100),
                  }}
                  title={point.note}
                />
              ))}
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              <T k="report.heatNote" />
            </p>
          </div>
        </article>

        <article className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
            <T k="report.narrative" />
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            <T k="report.narrativeTitle" />
          </h2>
          <div className="mt-5 grid gap-4">
            {report.sections.map((section) => (
              <div key={section.heading} className="rounded-[1.5rem] border border-[var(--line)] bg-white/60 p-5">
                <h3 className="text-lg font-semibold">{displaySectionHeading(locale, section.heading)}</h3>
                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[var(--muted)]">{section.body}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="panel rounded-[1.7rem] p-5">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p className="metric-value mt-3 text-4xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function MetricRow({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[1rem] bg-[rgba(23,20,18,0.04)] px-4 py-3">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

function ReadableCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/60 p-5">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{children}</p>
    </div>
  );
}

function AgentStoryCard({ locale, story }: { locale: Locale; story: AgentStory }) {
  const statusLabel =
    locale === "zh"
      ? story.status === "completed"
        ? "完成"
        : "失败"
      : story.status === "completed"
        ? "Completed"
        : "Failed";

  const badgeTone =
    story.status === "completed"
      ? "bg-[rgba(32,109,71,0.1)] text-[var(--success)]"
      : "bg-[rgba(181,41,23,0.1)] text-[var(--danger)]";

  return (
    <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/60 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{story.agentId}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{story.persona}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${badgeTone}`}>
          {statusLabel}
        </span>
      </div>
      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{pick(locale, story.summary)}</p>
    </div>
  );
}
