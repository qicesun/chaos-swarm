import {
  type AgentRunResultLike,
  type EfiBreakdown,
  type EfiComponent,
  type FailureCluster,
  type FunnelStage,
  type HeatmapPoint,
  type ReportDocument,
  type ReportInput,
  type ReportSection,
} from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function max(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((acc, value) => Math.max(acc, value), values[0]);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function latestStep(run: AgentRunResultLike) {
  return run.steps.at(-1);
}

function computeEfiComponents(agentRuns: AgentRunResultLike[]): EfiComponent[] {
  const frustrations = agentRuns.map((run) => latestStep(run)?.frustration ?? 0);
  const failures = agentRuns.map((run) => (run.failed ? 1 : 0));
  const drag = agentRuns.map((run) => run.steps.length / Math.max(run.config.maxSteps, 1));
  const errorPressure = agentRuns.map((run) =>
    run.steps.reduce(
      (count, step) => count + (step.observation.page.errorFlags.length > 0 ? 1 : 0),
      0,
    ) / Math.max(run.steps.length, 1),
  );

  const components: EfiComponent[] = [
    {
      name: "frustration",
      weight: 0.4,
      score: round(average(frustrations) * 100),
      contribution: 0,
    },
    {
      name: "drop-off",
      weight: 0.3,
      score: round(average(failures) * 100),
      contribution: 0,
    },
    {
      name: "interaction-drag",
      weight: 0.2,
      score: round(average(drag) * 100),
      contribution: 0,
    },
    {
      name: "error-pressure",
      weight: 0.1,
      score: round(average(errorPressure) * 100),
      contribution: 0,
    },
  ];

  for (const component of components) {
    component.contribution = round(component.score * component.weight);
  }

  return components;
}

export function computeEfi(agentRuns: AgentRunResultLike[]): EfiBreakdown {
  const components = computeEfiComponents(agentRuns);
  const score = round(clamp(components.reduce((sum, component) => sum + component.contribution, 0), 0, 100));
  return { score, components };
}

function buildFunnel(agentRuns: AgentRunResultLike[]): FunnelStage[] {
  const total = agentRuns.length;
  const touched = agentRuns.filter((run) => run.steps.length > 0).length;
  const progressed = agentRuns.filter((run) => run.steps.some((step) => step.decision.kind !== "wait")).length;
  const completed = agentRuns.filter((run) => run.completed).length;

  return [
    { name: "Started", total, completed: touched, dropped: total - touched },
    { name: "Interacted", total: touched, completed: progressed, dropped: touched - progressed },
    { name: "Completed", total: progressed, completed, dropped: progressed - completed },
  ];
}

function buildFailureClusters(agentRuns: AgentRunResultLike[]): FailureCluster[] {
  const groups = new Map<string, FailureCluster>();

  for (const run of agentRuns) {
    if (!run.failed) {
      continue;
    }
    const last = latestStep(run);
    const label = last
      ? `${last.decision.kind}:${last.action.kind}:${run.finalPage.loadState}`
      : "unstarted";
    const existing = groups.get(label) ?? {
      label,
      count: 0,
      personas: [],
      reasons: [],
    };
    existing.count += 1;
    existing.personas.push(run.persona.archetype);
    if (last) {
      existing.reasons.push(last.observation.summary);
      existing.reasons.push(last.action.details);
    }
    groups.set(label, existing);
  }

  return [...groups.values()].map((cluster) => ({
    ...cluster,
    personas: [...new Set(cluster.personas)],
    reasons: [...new Set(cluster.reasons)].slice(0, 4),
  }));
}

function buildHighlightReel(agentRuns: AgentRunResultLike[]): string[] {
  return [...agentRuns]
    .sort((left, right) => max(right.steps.map((step) => step.frustration)) - max(left.steps.map((step) => step.frustration)))
    .slice(0, 3)
    .map((run) => {
      const peak = max(run.steps.map((step) => step.frustration));
      return `${run.agentId} (${run.persona.archetype}) peak frustration ${round(peak * 100)}% on ${run.config.goal}`;
    });
}

function buildHeatmap(agentRuns: AgentRunResultLike[]): HeatmapPoint[] {
  const points: HeatmapPoint[] = [];
  for (const run of agentRuns) {
    for (const step of run.steps) {
      points.push({
        step: step.step,
        frustration: round(step.frustration * 100),
        confidence: round(step.confidence * 100),
        note: `${run.persona.archetype}: ${step.decision.kind} -> ${step.action.kind}`,
      });
    }
  }
  return points;
}

function buildSections(report: ReportDocument): ReportSection[] {
  return [
    {
      heading: "Summary",
      body: report.summary,
    },
    {
      heading: "EFI",
      body: `Overall friction index: ${report.efi.score}. Components: ${report.efi.components
        .map((component) => `${component.name}=${component.score}`)
        .join(", ")}.`,
    },
    {
      heading: "Failure Clusters",
      body: report.failureClusters.length === 0
        ? "No failures observed in this run."
        : report.failureClusters
            .map((cluster) => `${cluster.label} (${cluster.count}): ${cluster.reasons.join("; ")}`)
            .join("\n"),
    },
    {
      heading: "Recommendations",
      body:
        "Reduce loading delays, clarify the primary CTA, and lower visual noise in the first interaction frame.",
    },
  ];
}

export function buildReport(input: ReportInput): ReportDocument {
  const efi = computeEfi(input.agentRuns);
  const funnel = buildFunnel(input.agentRuns);
  const failureClusters = buildFailureClusters(input.agentRuns);
  const highlightReel = buildHighlightReel(input.agentRuns);
  const heatmap = buildHeatmap(input.agentRuns);
  const completed = input.agentRuns.filter((run) => run.completed).length;
  const total = input.agentRuns.length;

  const report: ReportDocument = {
    title: `Chaos Swarm report for ${input.goal}`,
    summary: `${completed}/${total} agents completed the task against ${input.targetUrl}.`,
    sections: [],
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    efi,
    funnel,
    failureClusters,
    highlightReel,
    heatmap,
    metadata: {
      targetUrl: input.targetUrl,
      goal: input.goal,
      agentCount: total,
    },
  };

  report.sections = buildSections(report);
  return report;
}

export function renderMarkdown(document: ReportDocument): string {
  const lines = [
    `# ${document.title}`,
    "",
    document.summary,
    "",
    `Generated at: ${document.generatedAt}`,
    "",
    "## EFI",
    `Score: ${document.efi.score}`,
    "",
    ...document.efi.components.map((component) => `- ${component.name}: ${component.score} (${component.weight})`),
    "",
    "## Funnel",
    ...document.funnel.map((stage) => `- ${stage.name}: ${stage.completed}/${stage.total} completed, ${stage.dropped} dropped`),
    "",
    "## Failure Clusters",
    ...(document.failureClusters.length === 0
      ? ["- None"]
      : document.failureClusters.map((cluster) => `- ${cluster.label}: ${cluster.count}`)),
    "",
    "## Highlight Reel",
    ...(document.highlightReel.length === 0 ? ["- None"] : document.highlightReel.map((item) => `- ${item}`)),
    "",
    ...document.sections.flatMap((section) => [`## ${section.heading}`, section.body, ""]),
  ];

  return lines.join("\n").trim();
}

export function renderJson(document: ReportDocument): string {
  return JSON.stringify(document, null, 2);
}
