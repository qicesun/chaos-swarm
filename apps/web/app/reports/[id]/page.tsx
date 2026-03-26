import { notFound } from "next/navigation";
import { getRunRecord } from "@/lib/run-service";

interface ReportPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { id } = await params;
  const record = getRunRecord(id);

  if (!record) {
    notFound();
  }

  const report = record.report;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
      <section className="panel-strong rounded-[2rem] px-8 py-9">
        <p className="text-sm uppercase tracking-[0.3em] text-[var(--muted)]">Report</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{report.title}</h1>
        <p className="mt-4 max-w-4xl text-lg leading-8 text-[var(--muted)]">{report.summary}</p>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-4">
        <MetricCard label="EFI" value={String(report.efi.score)} />
        <MetricCard label="Failure clusters" value={String(report.failureClusters.length)} />
        <MetricCard label="Highlights" value={String(report.highlightReel.length)} />
        <MetricCard label="Heat points" value={String(report.heatmap.length)} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.95fr]">
        <article className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">EFI breakdown</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Experience friction index</h2>
          <div className="mt-6 space-y-4">
            {report.efi.components.map((component) => (
              <div key={component.name}>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold uppercase tracking-[0.18em]">{component.name}</span>
                  <span className="font-mono text-sm text-[var(--muted)]">
                    {component.score} / contribution {component.contribution}
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
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Funnel</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Synthetic drop-off</h2>
          <div className="mt-5 space-y-4">
            {report.funnel.map((stage) => (
              <div key={stage.name} className="rounded-[1.4rem] border border-[var(--line)] bg-white/60 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-semibold">{stage.name}</span>
                  <span className="font-mono text-sm text-[var(--muted)]">
                    {stage.completed}/{stage.total}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">{stage.dropped} agents dropped at this boundary.</p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Failure clusters</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">What bent the swarm</h2>
          <div className="mt-5 space-y-4">
            {report.failureClusters.length === 0 ? (
              <div className="rounded-[1.4rem] border border-[rgba(32,109,71,0.16)] bg-[rgba(32,109,71,0.08)] p-4 text-sm text-[var(--success)]">
                No failure clusters were observed in this run.
              </div>
            ) : (
              report.failureClusters.map((cluster) => (
                <div key={cluster.label} className="rounded-[1.4rem] border border-[var(--line)] bg-white/60 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-semibold">{cluster.label}</h3>
                    <span className="font-mono text-sm text-[var(--muted)]">{cluster.count}</span>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{cluster.reasons.join("; ")}</p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Friction heat</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Telemetry intensity map</h2>
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
              The current heatmap uses frustration and step depth as a proxy surface until screenshot overlays are added.
            </p>
          </div>
        </article>
      </section>

      <section className="mt-8 panel rounded-[2rem] p-7">
        <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Narrative</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Analyst summary</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {report.sections.map((section) => (
            <div key={section.heading} className="rounded-[1.5rem] border border-[var(--line)] bg-white/60 p-5">
              <h3 className="text-lg font-semibold">{section.heading}</h3>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[var(--muted)]">{section.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded-[1.7rem] p-5">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p className="metric-value mt-3 text-4xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
