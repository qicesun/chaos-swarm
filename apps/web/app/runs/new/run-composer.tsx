"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DemoScenarioDefinition, DemoScenarioId } from "@/lib/scenarios";

interface RunComposerProps {
  scenarios: DemoScenarioDefinition[];
}

export function RunComposer({ scenarios }: RunComposerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scenarioId, setScenarioId] = useState<DemoScenarioId>(scenarios[0]?.id ?? "saucedemo");
  const [agentCount, setAgentCount] = useState(12);
  const [maxSteps, setMaxSteps] = useState(5);
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === scenarioId) ?? scenarios[0],
    [scenarioId, scenarios],
  );

  async function launchRun() {
    setError(null);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          demoScenario: scenarioId,
          agentCount,
          maxSteps,
          goal: goal.trim() || selectedScenario.goal,
          targetUrl: selectedScenario.targetUrl,
        }),
      });

      if (!response.ok) {
        throw new Error("Run creation failed.");
      }

      const payload = (await response.json()) as { runId: string };

      startTransition(() => {
        router.push(`/runs/${payload.runId}`);
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Run creation failed.");
    }
  }

  if (!selectedScenario) {
    return null;
  }

  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="panel rounded-[2rem] p-7">
        <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Scenario</p>
        <div className="mt-4 grid gap-4">
          {scenarios.map((scenario) => {
            const selected = scenario.id === scenarioId;

            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => setScenarioId(scenario.id)}
                className={`rounded-[1.5rem] border px-5 py-5 text-left transition ${
                  selected
                    ? "border-[var(--accent)] bg-[rgba(200,76,38,0.1)]"
                    : "border-[var(--line)] bg-white/50 hover:border-[var(--accent-soft)]"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">{scenario.siteLabel}</p>
                    <h2 className="mt-1 text-xl font-semibold">{scenario.name}</h2>
                  </div>
                  <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]">
                    {scenario.frames.length} stages
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{scenario.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel-strong rounded-[2rem] p-7">
        <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Run controls</p>
        <div className="mt-5 space-y-5">
          <label className="block">
            <span className="text-sm font-semibold">Goal override</span>
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={selectedScenario.goal}
              className="mt-2 min-h-28 w-full rounded-[1.25rem] border border-[var(--line)] bg-white/75 px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Agent count</span>
              <span className="font-mono text-sm">{agentCount}</span>
            </div>
            <input
              className="mt-2 w-full accent-[var(--accent)]"
              type="range"
              min={8}
              max={24}
              step={2}
              value={agentCount}
              onChange={(event) => setAgentCount(Number(event.target.value))}
            />
          </label>

          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Step budget</span>
              <span className="font-mono text-sm">{maxSteps}</span>
            </div>
            <input
              className="mt-2 w-full accent-[var(--accent)]"
              type="range"
              min={4}
              max={8}
              step={1}
              value={maxSteps}
              onChange={(event) => setMaxSteps(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="mt-8 rounded-[1.5rem] border border-[var(--line)] bg-white/60 p-5">
          <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Execution mode</p>
          <h3 className="mt-2 text-lg font-semibold">Live local execution, cloud-ready</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
            This build executes flows with local Playwright contexts and streams timeline updates live. Browserbase and
            Trigger.dev remain the next scale layer for cloud fan-out.
          </p>
        </div>

        {error ? (
          <p className="mt-5 rounded-[1rem] border border-[rgba(181,41,23,0.2)] bg-[rgba(181,41,23,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={launchRun}
          disabled={isPending}
          className="mt-6 w-full rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Launching..." : "Launch chaos swarm"}
        </button>
      </div>
    </section>
  );
}
