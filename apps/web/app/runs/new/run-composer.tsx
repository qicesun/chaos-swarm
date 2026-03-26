"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "@/components/locale-provider";
import { localizeScenario } from "@/lib/i18n";
import type { DemoScenarioDefinition } from "@/lib/scenarios";

interface RunComposerProps {
  scenarios: DemoScenarioDefinition[];
}

export function RunComposer({ scenarios }: RunComposerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t } = useTranslations();
  const [isPending, startTransition] = useTransition();
  const initialScenario = scenarios[0];
  const requestedScenarioId = searchParams.get("scenario");
  const requestedScenario = scenarios.find((scenario) => scenario.id === requestedScenarioId);
  const [scenarioId, setScenarioId] = useState<string>(requestedScenario?.id ?? initialScenario?.id ?? "saucedemo");
  const [useCustomScenario, setUseCustomScenario] = useState(false);
  const [customTargetUrl, setCustomTargetUrl] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const [agentCount, setAgentCount] = useState(12);
  const [maxSteps, setMaxSteps] = useState(initialScenario?.recommendedMaxSteps ?? 6);
  const [goal, setGoal] = useState("");
  const [strictVisualMode, setStrictVisualMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === scenarioId) ?? scenarios[0],
    [scenarioId, scenarios],
  );
  const localizedScenarios = useMemo(
    () => scenarios.map((scenario) => localizeScenario(locale, scenario)),
    [locale, scenarios],
  );
  const localizedSelectedScenario = useMemo(
    () => (selectedScenario ? localizeScenario(locale, selectedScenario) : null),
    [locale, selectedScenario],
  );

  useEffect(() => {
    if (!selectedScenario || useCustomScenario) {
      return;
    }

    setMaxSteps(selectedScenario.recommendedMaxSteps);
  }, [selectedScenario, useCustomScenario]);

  useEffect(() => {
    if (!requestedScenario || requestedScenario.id === scenarioId) {
      return;
    }

    setScenarioId(requestedScenario.id);
    setGoal("");
  }, [requestedScenario, scenarioId]);

  async function launchRun() {
    setError(null);

    if (useCustomScenario && (!customTargetUrl.trim() || !customGoal.trim())) {
      setError(t("composer.runCreationFailed"));
      return;
    }

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          demoScenario: useCustomScenario ? undefined : scenarioId,
          agentCount,
          maxSteps,
          strictVisualMode,
          goal: useCustomScenario ? customGoal.trim() : goal.trim() || selectedScenario.goal,
          targetUrl: useCustomScenario ? customTargetUrl.trim() : selectedScenario.targetUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(t("composer.runCreationFailed"));
      }

      const payload = (await response.json()) as { runId: string };

      startTransition(() => {
        router.push(`/runs/${payload.runId}`);
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("composer.runCreationFailed"));
    }
  }

  if (!selectedScenario || !localizedSelectedScenario) {
    return null;
  }

  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="panel rounded-[2rem] p-7">
        <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">{t("composer.scenario")}</p>
        <div className="mt-4 grid gap-4">
          {localizedScenarios.map((scenario) => {
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
                    {t("home.stages", { count: scenario.frames.length })}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{scenario.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel-strong rounded-[2rem] p-7">
        <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">{t("composer.runControls")}</p>
        <div className="mt-5 space-y-5">
          <label className="flex cursor-pointer items-start gap-4 rounded-[1.5rem] border border-[var(--line)] bg-white/60 p-5">
            <input
              type="checkbox"
              checked={useCustomScenario}
              onChange={(event) => {
                const enabled = event.target.checked;
                setUseCustomScenario(enabled);
                if (enabled) {
                  setMaxSteps(6);
                } else if (selectedScenario) {
                  setMaxSteps(selectedScenario.recommendedMaxSteps);
                }
              }}
              className="mt-1 h-5 w-5 accent-[var(--accent)]"
            />
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">{t("composer.customMode")}</p>
              <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{t("composer.customModeBody")}</p>
              <p className="mt-2 text-xs leading-6 text-[var(--muted)]">{t("composer.customHint")}</p>
            </div>
          </label>

          {useCustomScenario ? (
            <>
              <label className="block">
                <span className="text-sm font-semibold">{t("composer.customUrl")}</span>
                <input
                  value={customTargetUrl}
                  onChange={(event) => setCustomTargetUrl(event.target.value)}
                  placeholder="https://example.com"
                  className="mt-2 w-full rounded-[1.25rem] border border-[var(--line)] bg-white/75 px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold">{t("composer.customGoal")}</span>
                <textarea
                  value={customGoal}
                  onChange={(event) => setCustomGoal(event.target.value)}
                  placeholder="Find the pricing page and open a plan comparison."
                  className="mt-2 min-h-24 w-full rounded-[1.25rem] border border-[var(--line)] bg-white/75 px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                />
              </label>
            </>
          ) : null}

          <label className="block">
            <span className="text-sm font-semibold">{t("composer.goalOverride")}</span>
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={localizedSelectedScenario.goal}
              className="mt-2 min-h-28 w-full rounded-[1.25rem] border border-[var(--line)] bg-white/75 px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{t("composer.agentCount")}</span>
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
              <span className="text-sm font-semibold">{t("composer.stepBudget")}</span>
              <span className="font-mono text-sm">{maxSteps}</span>
            </div>
            <input
              className="mt-2 w-full accent-[var(--accent)]"
              type="range"
              min={useCustomScenario ? 4 : selectedScenario.minimumMaxSteps}
              max={10}
              step={1}
              value={maxSteps}
              onChange={(event) => setMaxSteps(Number(event.target.value))}
            />
            <p className="mt-2 text-xs leading-6 text-[var(--muted)]">
              {useCustomScenario
                ? "Recommended 6 steps. AI-compiled scenarios keep a minimum of 4 steps so the swarm can establish and verify a goal path."
                : t("composer.recommendedSteps", {
                    recommended: selectedScenario.recommendedMaxSteps,
                    minimum: selectedScenario.minimumMaxSteps,
                  })}
            </p>
          </label>
        </div>

        <div className="mt-8 rounded-[1.5rem] border border-[var(--line)] bg-white/60 p-5">
          <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">{t("composer.executionMode")}</p>
          <h3 className="mt-2 text-lg font-semibold">{t("composer.executionTitle")}</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{t("composer.executionBody")}</p>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-4 rounded-[1.5rem] border border-[var(--line)] bg-white/60 p-5">
          <input
            type="checkbox"
            checked={strictVisualMode}
            onChange={(event) => setStrictVisualMode(event.target.checked)}
            className="mt-1 h-5 w-5 accent-[var(--accent)]"
          />
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">{t("composer.strictVisualMode")}</p>
            <h3 className="mt-2 text-lg font-semibold">
              {strictVisualMode ? t("composer.strictVisualOn") : t("composer.strictVisualOff")}
            </h3>
            <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{t("composer.strictVisualBody")}</p>
          </div>
        </label>

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
          {isPending ? t("composer.launching") : t("composer.launch")}
        </button>
      </div>
    </section>
  );
}
