"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RunRecord } from "@/lib/types";

interface RunMonitorProps {
  initialRun: RunRecord;
}

export function RunMonitor({ initialRun }: RunMonitorProps) {
  const [run, setRun] = useState(initialRun);

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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
      <section className="panel-strong rounded-[2rem] px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm uppercase tracking-[0.3em] text-[var(--muted)]">Run details</p>
              <StatusBadge status={run.status} />
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{run.scenarioName}</h1>
            <p className="mt-3 max-w-3xl text-base leading-8 text-[var(--muted)]">{run.goal}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {reportReady ? (
              <Link
                href={`/reports/${run.id}`}
                className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white"
              >
                Open report
              </Link>
            ) : (
              <span className="rounded-full border border-[var(--line)] bg-white/60 px-5 py-3 text-sm font-semibold text-[var(--muted)]">
                Report pending
              </span>
            )}
            <Link
              href="/runs/new"
              className="rounded-full border border-[var(--line)] px-5 py-3 text-sm font-semibold"
            >
              Launch another
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-4">
        <MetricCard label="Agents" value={String(run.agentCount)} />
        <MetricCard label="Completed" value={`${run.summary.completed}/${run.agentCount}`} />
        <MetricCard label="Average steps" value={String(run.summary.averageSteps)} />
        <MetricCard label="Peak frustration" value={`${run.summary.peakFrustration}%`} tone="danger" />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="panel rounded-[2rem] p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Stage pressure</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Where the swarm slowed down</h2>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {run.stageSummary.map((stage) => (
              <div key={stage.label} className="rounded-[1.4rem] border border-[var(--line)] bg-white/60 p-4">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold">{stage.label}</h3>
                  <span className="font-mono text-sm text-[var(--muted)]">{stage.reached} reached</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-[rgba(23,20,18,0.08)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${Math.min(100, (stage.reached / Math.max(run.agentCount, 1)) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">{stage.stuck} agents encountered visible friction here.</p>
              </div>
            ))}
          </div>
        </article>

        <aside className="panel rounded-[2rem] p-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Warnings</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Runtime posture</h2>
          <div className="mt-5 space-y-3">
            {run.warnings.length === 0 ? (
              <div className="rounded-[1.25rem] border border-[rgba(32,109,71,0.16)] bg-[rgba(32,109,71,0.08)] p-4 text-sm text-[var(--success)]">
                No runtime warnings were generated for this run.
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
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Storage / execution</p>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              {run.storageMode} persistence, {run.executionMode} execution. The current run ID is{" "}
              <span className="font-mono text-[var(--foreground)]">{run.id}</span>.
            </p>
          </div>
        </aside>
      </section>

      <section className="mt-8 panel rounded-[2rem] p-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Timeline</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Synthetic event stream</h2>
          </div>
          <p className="text-sm text-[var(--muted)]">
            {run.status === "completed" ? "Run finished." : run.status === "failed" ? "Run failed." : "Live polling every 1.2s."}
          </p>
        </div>
        <div className="mt-6 space-y-3">
          {run.events.length === 0 ? (
            <div className="rounded-[1.3rem] border border-[var(--line)] bg-white/60 px-4 py-4 text-sm text-[var(--muted)]">
              No events have been captured yet. The worker is still warming up the first browser context.
            </div>
          ) : (
            run.events.slice(-24).reverse().map((event) => (
              <div
                key={event.id}
                className="grid gap-3 rounded-[1.3rem] border border-[var(--line)] bg-white/60 px-4 py-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1.2fr]"
              >
                <div>
                  <p className="font-semibold">{event.agentId}</p>
                  <p className="text-sm text-[var(--muted)]">{event.url}</p>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Action</p>
                  <p className="text-sm">{event.action}</p>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Emotion</p>
                  <p className="text-sm">
                    {event.frustration}% frustration / {event.confidence}% confidence
                  </p>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Note</p>
                  <p className="text-sm leading-7 text-[var(--muted)]">{event.note}</p>
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

function StatusBadge({ status }: { status: RunRecord["status"] }) {
  const palette =
    status === "completed"
      ? "border-[rgba(32,109,71,0.18)] bg-[rgba(32,109,71,0.08)] text-[var(--success)]"
      : status === "failed"
        ? "border-[rgba(181,41,23,0.18)] bg-[rgba(181,41,23,0.08)] text-[var(--danger)]"
        : "border-[rgba(200,76,38,0.18)] bg-[rgba(200,76,38,0.08)] text-[var(--accent)]";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${palette}`}>
      {status}
    </span>
  );
}
