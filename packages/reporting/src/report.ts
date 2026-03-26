import {
  type AgentRunResultLike,
  type EfiBreakdown,
  type EfiComponent,
  type AgentStory,
  type ExecutionQuality,
  type FailureCluster,
  type FunnelStage,
  type HeatmapPoint,
  type LocalizedReportCopy,
  type ReadableInsight,
  type ReadableReport,
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

const BLOCKED_PATTERN =
  /robot or human|captcha|access denied|verify you are human|blocked|cloudflare|invalid ssl certificate|attention required/i;
const TIMEOUT_PATTERN = /timeout|timed out|page\.goto|waitforurl|waiting until/i;
const INTERSTITIAL_PATTERN = /google_vignette|interstitial|overlay/i;
const STRICT_VISUAL_PATTERN = /strict visual mode blocked dom fallback/i;

interface FailureClassification {
  signature: string;
  label: string;
  operational: boolean;
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function classifyFailure(run: AgentRunResultLike): FailureClassification {
  const last = latestStep(run);
  const errorBlob = [last?.action.details, last?.observation.summary, ...run.finalPage.errorFlags]
    .filter(Boolean)
    .join(" | ");

  if (!last) {
    return {
      signature: "unstarted",
      label: "Run never started",
      operational: true,
    };
  }

  if (run.steps.length >= run.config.maxSteps && run.finalPage.errorFlags.length === 0) {
    return {
      signature: `budget_exhausted_after_${last.action.kind}`,
      label: "Step budget exhausted before completion",
      operational: false,
    };
  }

  if (STRICT_VISUAL_PATTERN.test(errorBlob)) {
    return {
      signature: "strict_visual_execution_limit",
      label: "Strict visual mode halted execution",
      operational: true,
    };
  }

  if (BLOCKED_PATTERN.test(errorBlob)) {
    return {
      signature: "environment_blocked",
      label: "Site or environment blocked execution",
      operational: true,
    };
  }

  if (TIMEOUT_PATTERN.test(errorBlob)) {
    const interruptedByInterstitial =
      INTERSTITIAL_PATTERN.test(errorBlob) || INTERSTITIAL_PATTERN.test(last.observation.page.url);

    return {
      signature: interruptedByInterstitial
        ? "runner_interstitial_timeout"
        : `runner_navigation_timeout_after_${last.decision.kind}`,
      label: interruptedByInterstitial
        ? "Interstitial or ad overlay interrupted execution"
        : "Execution runner timed out during navigation",
      operational: true,
    };
  }

  if (last.action.kind === "escalate" || run.finalPage.errorFlags.length > 0) {
    const topFlag = run.finalPage.errorFlags[0] ?? last.action.details;
    return {
      signature: `runner_error_${normalizeToken(topFlag || "unknown")}`,
      label: "Execution runner error",
      operational: true,
    };
  }

  return {
    signature: `incomplete_after_${last.decision.kind}_${last.action.kind}_${run.finalPage.loadState}`,
    label: `Incomplete after ${last.action.kind}`,
    operational: false,
  };
}

function computeEfiComponents(agentRuns: AgentRunResultLike[]): EfiComponent[] {
  const classifications = agentRuns.map((run) => classifyFailure(run));
  const frustrations = agentRuns.map((run, index) =>
    classifications[index].operational ? 0 : latestStep(run)?.frustration ?? 0,
  );
  const failures = agentRuns.map((run, index) =>
    run.failed && !classifications[index].operational ? 1 : 0,
  );
  const drag = agentRuns.map((run, index) =>
    classifications[index].operational ? 0 : run.steps.length / Math.max(run.config.maxSteps, 1),
  );
  const errorPressure = agentRuns.map((run, index) =>
    classifications[index].operational
      ? 0
      : run.steps.reduce(
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

function buildExecutionValiditySection(report: ReportDocument) {
  const operationalClusters = report.failureClusters.filter(
    (cluster) =>
      cluster.signature === "environment_blocked" ||
      cluster.signature.startsWith("runner_") ||
      cluster.signature === "unstarted",
  );

  if (operationalClusters.length === 0) {
    return null;
  }

  const totalOperational = operationalClusters.reduce((sum, cluster) => sum + cluster.count, 0);
  return {
    heading: "Execution Validity",
    body: `${totalOperational} run(s) were classified as runner or environment failures and discounted from the UX EFI score: ${operationalClusters
      .map((cluster) => `${cluster.label} [${cluster.signature}] x${cluster.count}`)
      .join("; ")}.`,
  } satisfies ReportSection;
}

function computeExecutionQuality(agentRuns: AgentRunResultLike[]): ExecutionQuality {
  let totalInteractionActions = 0;
  let visualOnlyActions = 0;
  let domAssistedActions = 0;
  let domOnlyActions = 0;

  for (const run of agentRuns) {
    for (const step of run.steps) {
      const mode =
        step.action.execution?.mode ??
        (step.action.kind === "scroll"
          ? "visual_only"
          : step.action.kind === "click" || step.action.kind === "type"
            ? "none"
            : "none");

      if (mode === "none") {
        continue;
      }

      totalInteractionActions += 1;

      if (mode === "visual_only") {
        visualOnlyActions += 1;
      }

      if (mode === "visual_with_dom_assist") {
        domAssistedActions += 1;
      }

      if (mode === "dom_only") {
        domOnlyActions += 1;
      }
    }
  }

  const strictVisualMode = agentRuns[0]?.config.strictVisualMode ?? false;

  return {
    strictVisualMode,
    totalInteractionActions,
    visualOnlyActions,
    domAssistedActions,
    domOnlyActions,
    visualPurity:
      totalInteractionActions === 0 ? 100 : round((visualOnlyActions / totalInteractionActions) * 100),
    domAssistRate:
      totalInteractionActions === 0
        ? 0
        : round(((domAssistedActions + domOnlyActions) / totalInteractionActions) * 100),
  };
}

function buildExecutionPuritySection(report: ReportDocument) {
  const metrics = report.executionQuality;

  return {
    heading: "Execution Purity",
    body: `Strict visual mode: ${metrics.strictVisualMode ? "on" : "off"}. Visual purity ${metrics.visualPurity}%, DOM assist rate ${metrics.domAssistRate}% across ${metrics.totalInteractionActions} interactive action(s). Visual-only=${metrics.visualOnlyActions}, visual+DOM=${metrics.domAssistedActions}, DOM-only=${metrics.domOnlyActions}.`,
  } satisfies ReportSection;
}

function localized(en: string, zh: string): LocalizedReportCopy {
  return { en, zh };
}

function topPressureLabels(report: ReportDocument) {
  return report.efi.components
    .slice()
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((component) => component.name)
    .join(", ");
}

function hasOperationalNoise(report: ReportDocument) {
  return report.failureClusters.some(
    (cluster) =>
      cluster.signature.startsWith("runner_") ||
      cluster.signature === "environment_blocked" ||
      cluster.signature === "strict_visual_execution_limit",
  );
}

function buildAgentStories(agentRuns: AgentRunResultLike[]): AgentStory[] {
  return agentRuns.slice(0, 4).map((run) => {
    const last = latestStep(run);
    const stage = last?.observation.page.url ?? run.finalPage.url;
    const status = run.completed ? "completed" : "failed";

    return {
      agentId: run.agentId,
      persona: run.persona.archetype,
      status,
      summary: localized(
        run.completed
          ? `${run.agentId} (${run.persona.archetype}) completed in ${run.steps.length} steps and ended on ${stage}.`
          : `${run.agentId} (${run.persona.archetype}) stopped after ${run.steps.length} steps. The last meaningful state was ${stage}.`,
        run.completed
          ? `${run.agentId}（${run.persona.archetype}）用了 ${run.steps.length} 步完成任务，最终停在 ${stage}。`
          : `${run.agentId}（${run.persona.archetype}）在 ${run.steps.length} 步后停下，最后一个关键状态停在 ${stage}。`,
      ),
    };
  });
}

function buildReadableMetrics(report: ReportDocument): ReadableInsight[] {
  return [
    {
      title: localized("What the EFI means", "EFI 到底代表什么"),
      body: localized(
        `EFI is ${report.efi.score}. Higher means the flow felt harder for the swarm. In this run the strongest pressure came from ${topPressureLabels(report)}.`,
        `EFI 是 ${report.efi.score}。数值越高，说明这条流程对蜂群来说越困难、越容易产生阻力。这次主要压力来自 ${topPressureLabels(report)}。`,
      ),
    },
    {
      title: localized("How visual the run stayed", "这次运行有多像真人操作"),
      body: localized(
        `Visual purity was ${report.executionQuality.visualPurity}%. DOM assist rate was ${report.executionQuality.domAssistRate}%. Higher visual purity means the agents mostly succeeded with screen-driven actions instead of runtime recovery.`,
        `视觉纯度是 ${report.executionQuality.visualPurity}% ，DOM 兜底率是 ${report.executionQuality.domAssistRate}% 。视觉纯度越高，说明 agent 越多是在像真实用户一样依赖屏幕操作，而不是靠运行时结构化恢复。`,
      ),
    },
    {
      title: localized("How much of this result to trust", "这次结果有多可信"),
      body: localized(
        hasOperationalNoise(report)
          ? "Part of this run was affected by runtime or environment constraints, so treat the UX signal carefully."
          : "This run was mostly clean operationally, so the reported friction is more likely to reflect the product itself.",
        hasOperationalNoise(report)
          ? "这次运行有一部分受到了运行时限制或环境阻断的影响，所以 UX 结论需要谨慎解读。"
          : "这次运行在工程层面比较干净，因此报告中的阻力更可能来自产品本身。",
      ),
    },
  ];
}

function buildReadableFindings(report: ReportDocument): ReadableInsight[] {
  if (report.failureClusters.length === 0) {
    return [
      {
        title: localized("No clear breakage surfaced", "没有出现明显断点"),
        body: localized(
          "The swarm did not converge on a single visible failure cluster. This usually means the baseline path is stable at the current sample size.",
          "蜂群没有收敛到单一的明显失败簇。这通常意味着在当前样本量下，基线路径总体是稳定的。",
        ),
      },
    ];
  }

  return report.failureClusters.slice(0, 3).map((cluster) => ({
    title: localized(cluster.label, cluster.label),
    body: localized(
      `Affected ${cluster.count} agent(s). Signature: ${cluster.signature}. Main reasons: ${cluster.reasons.join("; ")}`,
      `影响了 ${cluster.count} 个 agent。签名：${cluster.signature}。主要原因：${cluster.reasons.join("；")}`,
    ),
  }));
}

function buildReadableReport(report: ReportDocument, input: ReportInput): ReadableReport {
  const completed = input.agentRuns.filter((run) => run.completed).length;
  const total = input.agentRuns.length;

  return {
    overview: localized(
      `${completed}/${total} agents finished the goal. Read this report as: what happened, where the swarm slowed down, and whether the result came from UX friction or runtime constraints.`,
      `${completed}/${total} 个 agent 完成了目标。读这份报告时请重点看三件事：发生了什么、蜂群主要卡在哪、这些结果来自 UX 阻力还是运行时限制。`,
    ),
    metrics: buildReadableMetrics(report),
    findings: buildReadableFindings(report),
    agentStories: buildAgentStories(input.agentRuns),
  };
}

export function computeEfi(agentRuns: AgentRunResultLike[]): EfiBreakdown {
  const components = computeEfiComponents(agentRuns);
  const score = round(
    clamp(
      components.reduce((sum, component) => sum + component.contribution, 0),
      0,
      100,
    ),
  );

  return { score, components };
}

function buildFunnel(agentRuns: AgentRunResultLike[]): FunnelStage[] {
  const total = agentRuns.length;
  const touched = agentRuns.filter((run) => run.steps.length > 0).length;
  const progressed = agentRuns.filter((run) =>
    run.steps.some((step) => step.decision.kind !== "wait"),
  ).length;
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
    const classification = classifyFailure(run);
    const existing = groups.get(classification.signature) ?? {
      signature: classification.signature,
      label: classification.label,
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

    groups.set(classification.signature, existing);
  }

  return [...groups.values()].map((cluster) => ({
    ...cluster,
    personas: [...new Set(cluster.personas)],
    reasons: [...new Set(cluster.reasons)].slice(0, 4),
  }));
}

function buildHighlightReel(agentRuns: AgentRunResultLike[]): string[] {
  return [...agentRuns]
    .sort(
      (left, right) =>
        max(right.steps.map((step) => step.frustration)) -
        max(left.steps.map((step) => step.frustration)),
    )
    .slice(0, 3)
    .map((run) => {
      const peak = max(run.steps.map((step) => step.frustration));
      return `${run.agentId} (${run.persona.archetype}) peak frustration ${round(
        peak * 100,
      )}% on ${run.config.goal}`;
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
  const executionValidity = buildExecutionValiditySection(report);
  const executionPurity = buildExecutionPuritySection(report);

  return [
    {
      heading: "Summary",
      body: report.summary,
    },
    executionPurity,
    ...(executionValidity ? [executionValidity] : []),
    {
      heading: "EFI",
      body: `Overall friction index: ${report.efi.score}. Components: ${report.efi.components
        .map((component) => `${component.name}=${component.score}`)
        .join(", ")}.`,
    },
    {
      heading: "Failure Clusters",
      body:
        report.failureClusters.length === 0
          ? "No failures observed in this run."
          : report.failureClusters
              .map(
                (cluster) =>
                  `${cluster.label} [${cluster.signature}] (${cluster.count}): ${cluster.reasons.join(
                    "; ",
                  )}`,
              )
              .join("\n"),
    },
    {
      heading: "Recommendations",
      body: executionValidity
        ? "Stabilize the affected scenario runtime first, then interpret the remaining EFI as UX signal. After runner issues are removed, reduce loading delays, clarify the primary CTA, and lower visual noise in the first interaction frame."
        : "Reduce loading delays, clarify the primary CTA, and lower visual noise in the first interaction frame.",
    },
  ];
}

export function buildReport(input: ReportInput): ReportDocument {
  const efi = computeEfi(input.agentRuns);
  const funnel = buildFunnel(input.agentRuns);
  const failureClusters = buildFailureClusters(input.agentRuns);
  const highlightReel = buildHighlightReel(input.agentRuns);
  const heatmap = buildHeatmap(input.agentRuns);
  const executionQuality = computeExecutionQuality(input.agentRuns);
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
    executionQuality,
    readable: {
      overview: localized("", ""),
      metrics: [],
      findings: [],
      agentStories: [],
    },
    metadata: {
      targetUrl: input.targetUrl,
      goal: input.goal,
      agentCount: total,
      strictVisualMode: executionQuality.strictVisualMode,
    },
  };

  report.readable = buildReadableReport(report, input);
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
    ...document.efi.components.map(
      (component) => `- ${component.name}: ${component.score} (${component.weight})`,
    ),
    "",
    "## Execution Purity",
    `- Strict visual mode: ${document.executionQuality.strictVisualMode ? "on" : "off"}`,
    `- Visual purity: ${document.executionQuality.visualPurity}%`,
    `- DOM assist rate: ${document.executionQuality.domAssistRate}%`,
    `- Total interactive actions: ${document.executionQuality.totalInteractionActions}`,
    `- Visual-only actions: ${document.executionQuality.visualOnlyActions}`,
    `- Visual+DOM actions: ${document.executionQuality.domAssistedActions}`,
    `- DOM-only actions: ${document.executionQuality.domOnlyActions}`,
    "",
    "## Funnel",
    ...document.funnel.map(
      (stage) =>
        `- ${stage.name}: ${stage.completed}/${stage.total} completed, ${stage.dropped} dropped`,
    ),
    "",
    "## Failure Clusters",
    ...(document.failureClusters.length === 0
      ? ["- None"]
      : document.failureClusters.map(
          (cluster) => `- ${cluster.label} [${cluster.signature}]: ${cluster.count}`,
        )),
    "",
    "## Highlight Reel",
    ...(document.highlightReel.length === 0
      ? ["- None"]
      : document.highlightReel.map((item) => `- ${item}`)),
    "",
    ...document.sections.flatMap((section) => [`## ${section.heading}`, section.body, ""]),
  ];

  return lines.join("\n").trim();
}

export function renderJson(document: ReportDocument): string {
  return JSON.stringify(document, null, 2);
}
