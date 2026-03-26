import { randomUUID } from "node:crypto";
import { defaultPersonaSet, type AgentPersona, type AgentRunResult } from "@chaos-swarm/agent-core";
import { buildReport, type ReportDocument, type ReportInput } from "@chaos-swarm/reporting";
import { z } from "zod";
import { canUseBrowserbase, env } from "./env";
import { runLiveSwarm } from "./live-runner";
import { getPersistenceMode, loadRunRecord, persistRunRecord } from "./persistence";
import { applyReadableReport, enhanceReadableReport } from "./report-llm";
import { compileScenarioProfile } from "./scenario-compiler";
import { getScenario, hasScenario, listScenarios, type DemoScenarioDefinition } from "./scenarios";
import { upsertRunInStore } from "./store";
import type { PersonaSnapshot, RunRecord, StageSnapshot, TimelineEvent } from "./types";

const createRunSchema = z.object({
  targetUrl: z.string().url().optional(),
  goal: z.string().min(3).optional(),
  agentCount: z.number().int().min(1).max(32).default(12),
  maxSteps: z.number().int().min(2).max(12).default(5),
  strictVisualMode: z.boolean().default(false),
  demoScenario: z
    .string()
    .optional(),
  inputSeeds: z.record(z.string(), z.string()).optional(),
}).superRefine((value, ctx) => {
  if (value.demoScenario && hasScenario(value.demoScenario)) {
    return;
  }

  if (value.targetUrl && value.goal) {
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Provide a known demoScenario or a targetUrl + goal pair for AI scenario compilation.",
    path: ["demoScenario"],
  });
});

const activeJobs = new Map<string, Promise<void>>();

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function selectPersonas(agentCount: number): AgentPersona[] {
  const catalog = defaultPersonaSet();
  return Array.from({ length: agentCount }, (_, index) => catalog[index % catalog.length]);
}

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function describeStepTitle(step: AgentRunResult["steps"][number], stageLabel: string | null) {
  if (step.readableTitle) {
    return step.readableTitle;
  }

  const target = step.decision.target ?? "";

  if (stageLabel && step.action.ok && (step.decision.kind === "wait" || step.decision.kind === "click")) {
    return `Reached ${stageLabel}`;
  }

  if (step.action.kind === "escalate") {
    return "Aborted after a runtime problem";
  }

  if (step.decision.kind === "wait") {
    return "Loaded the next screen";
  }

  if (step.decision.kind === "scroll") {
    return "Scanned the page before acting";
  }

  if (step.decision.kind === "type") {
    if (/login form/i.test(target)) {
      return "Filled the login form";
    }

    if (/registration form/i.test(target)) {
      return "Filled the registration form";
    }

    if (/validation form/i.test(target)) {
      return "Filled the validation form";
    }

    if (/search/i.test(target)) {
      return "Entered a search query";
    }

    return `Entered information into ${target || "the form"}`;
  }

  if (step.decision.kind === "click") {
    if (/login/i.test(target)) {
      return "Submitted the login action";
    }

    if (/register/i.test(target)) {
      return "Submitted the registration action";
    }

    if (/add to cart/i.test(target)) {
      return "Added the item to cart";
    }

    if (/view cart|shopping cart|cart review/i.test(target)) {
      return "Opened the cart view";
    }

    if (/view product/i.test(target)) {
      return "Opened the product detail page";
    }

    if (/form authentication/i.test(target)) {
      return "Opened the authentication module";
    }

    if (/search submit/i.test(target)) {
      return "Submitted the search";
    }

    return `Clicked ${target || "the next control"}`;
  }

  if (step.decision.kind === "retry") {
    return `Retried ${target || "the previous action"}`;
  }

  return `${titleCase(step.decision.kind)} action`;
}

function describeStepDetail(step: AgentRunResult["steps"][number]) {
  if (step.readableDetail) {
    const reason = step.action.ok ? step.successReason : step.failureReason;
    return reason ? `${step.readableDetail} Reason: ${reason}` : step.readableDetail;
  }

  return step.action.details || step.observation.summary;
}

function getStageLabelForStep(step: AgentRunResult["steps"][number], scenario: DemoScenarioDefinition) {
  if (step.stageLabel) {
    return step.stageLabel;
  }

  const matchedStage = scenario.frames.find((stage) =>
    stageMatched(
      {
        agentId: "timeline",
        persona: {
          archetype: "Speedrunner",
          skillLevel: 1,
          patience: 1,
          attentionBias: 1,
          readingSpeed: 1,
          rageThreshold: 1,
        },
        config: {
          targetUrl: step.observation.page.url,
          goal: "",
          maxSteps: step.step + 1,
          demoMode: false,
        },
        startedAt: step.timestamp,
        finishedAt: step.timestamp,
        completed: false,
        failed: false,
        finalPage: step.observation.page,
        summary: step.observation.summary,
        steps: [step],
      },
      scenario,
      stage,
    ),
  );

  return matchedStage?.label ?? null;
}

function toTimeline(agentRuns: AgentRunResult[], scenario: DemoScenarioDefinition): TimelineEvent[] {
  return agentRuns
    .flatMap((run) => {
      return run.steps.map((step) => {
        const stageLabel = getStageLabelForStep(step, scenario);
        const title = describeStepTitle(step, stageLabel);

        return {
          id: `${run.agentId}-${step.step}`,
          agentId: run.agentId,
          persona: run.persona.archetype,
          step: step.step,
          timestamp: step.timestamp,
          stageLabel,
          title,
          detail: describeStepDetail(step),
          rationale: step.decision.rationale,
          action: title,
          actionCode: `${step.decision.kind} -> ${step.action.kind}`,
          decisionKind: step.decision.kind,
          actionOk: step.action.ok,
          loadState: step.observation.page.loadState,
          url: step.observation.page.url,
          note: step.observation.summary,
          frustration: round(step.frustration * 100),
          confidence: round(step.confidence * 100),
          executionAssistMode: step.action.execution?.mode ?? "none",
          domAssisted: step.action.execution?.domAssisted ?? false,
        };
      });
    })
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function buildPersonaSummary(agentRuns: AgentRunResult[]): PersonaSnapshot[] {
  const map = new Map<AgentPersona["archetype"], PersonaSnapshot>();

  for (const run of agentRuns) {
    const current = map.get(run.persona.archetype) ?? {
      archetype: run.persona.archetype,
      total: 0,
      completed: 0,
      failed: 0,
    };

    current.total += 1;
    current.completed += run.completed ? 1 : 0;
    current.failed += run.failed ? 1 : 0;
    map.set(run.persona.archetype, current);
  }

  return [...map.values()];
}

function stageMatched(run: AgentRunResult, scenario: DemoScenarioDefinition, stage: DemoScenarioDefinition["frames"][number]) {
  const stagePath = new URL(stage.url).pathname;
  const stageTargetTokens = stage.targets.map((target) => target.toLowerCase());
  const stageDescriptionTokens = (stage.description ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 4);

  return run.steps.some((step) => {
    if (step.stageId === stage.id || step.stageLabel === stage.label) {
      return true;
    }

    const stepUrl = step.observation.page.url;

    if (stagePath !== "/") {
      if (stepUrl.includes(stagePath)) {
        return true;
      }
    }

    const surfaceText = [
      step.observation.page.title,
      step.observation.summary,
      ...step.observation.page.visibleTargets,
      step.readableDetail,
      step.readableTitle,
    ]
      .filter(Boolean)
      .join(" | ")
      .toLowerCase();

    if (stageTargetTokens.some((token) => surfaceText.includes(token))) {
      return true;
    }

    if (stageDescriptionTokens.some((token) => surfaceText.includes(token))) {
      return true;
    }

    if (stagePath === "/" && step.step === 0) {
      return scenario.domainAllowlist.some((domain) => stepUrl.includes(domain));
    }

    return false;
  });
}

function buildStageSummary(agentRuns: AgentRunResult[], scenario: DemoScenarioDefinition): StageSnapshot[] {
  return scenario.frames.map((frame) => {
    const reachedRuns = agentRuns.filter((run) => stageMatched(run, scenario, frame));
    const stuck = reachedRuns.filter((run) => {
      const stageSteps = run.steps.filter((step) => stageMatched({ ...run, steps: [step] }, scenario, frame));

      if (stageSteps.length === 0) {
        return false;
      }

      const entryFrustration = stageSteps[0].frustration;
      const peakStageFrustration = Math.max(...stageSteps.map((step) => step.frustration), entryFrustration);
      let frictionSignals = 0;

      if (stageSteps.length > 1) {
        frictionSignals += 1;
      }

      if (
        stageSteps.some(
          (step) =>
            step.decision.kind === "scroll" ||
            step.decision.kind === "retry" ||
            step.action.kind === "escalate",
        )
      ) {
        frictionSignals += 1;
      }

      if (
        stageSteps.some(
          (step) =>
            step.observation.page.loadState !== "complete" ||
            step.observation.page.errorFlags.length > 0,
        )
      ) {
        frictionSignals += 1;
      }

      if (peakStageFrustration - entryFrustration >= 0.05) {
        frictionSignals += 1;
      }

      return frictionSignals >= 2;
    }).length;

    return {
      label: frame.label,
      reached: reachedRuns.length,
      stuck,
    };
  });
}

function buildSummary(agentRuns: AgentRunResult[]) {
  const completed = agentRuns.filter((run) => run.completed).length;
  const failed = agentRuns.filter((run) => run.failed).length;
  const averageSteps =
    agentRuns.reduce((sum, run) => sum + run.steps.length, 0) / Math.max(agentRuns.length, 1);
  const peakFrustration = Math.max(...agentRuns.flatMap((run) => run.steps.map((step) => step.frustration)), 0);

  return {
    completed,
    failed,
    averageSteps: round(averageSteps),
    peakFrustration: round(peakFrustration * 100),
  };
}

function buildWarnings(strictVisualMode: boolean) {
  const warnings: string[] = [];
  const persistenceMode = getPersistenceMode();

  if (env.openAiApiKey) {
    warnings.push(`OpenAI autonomous agent runtime is active via ${env.agentModel}.`);
  } else {
    warnings.push("OPENAI_API_KEY is missing, so autonomous agent execution cannot start.");
  }

  if (env.executionMode === "simulation") {
    warnings.push("Browser execution is still in simulation mode.");
  } else if (env.executionMode === "local") {
    warnings.push("Local Playwright execution is active on this workstation; Browserbase fan-out is not enabled yet.");
  } else if (env.executionMode === "hybrid") {
    warnings.push(
      canUseBrowserbase()
        ? "Browserbase cloud execution is active for public runs."
        : "Hybrid execution is configured, but Browserbase credentials are incomplete.",
    );
  }

  if (strictVisualMode) {
    warnings.push("Strict visual mode is enabled: click and fill actions will not fall back to DOM locators.");
  } else {
    warnings.push("Hybrid visual mode is enabled: coordinate-first execution can fall back to DOM locators when needed.");
  }

  if (persistenceMode === "unavailable") {
    warnings.push("Supabase persistence is disabled.");
  } else {
    warnings.push(`Supabase persistence is active via ${persistenceMode}.`);
  }

  return warnings;
}

function createPlaceholderReport(
  targetUrl: string,
  goal: string,
  agentCount: number,
  strictVisualMode: boolean,
): ReportDocument {
  const generatedAt = new Date().toISOString();

  return {
    title: `Chaos Swarm report for ${goal}`,
    summary: `Run in progress against ${targetUrl}. Waiting for agent telemetry before rendering the final report.`,
    sections: [
      {
        heading: "Status",
        body: "The swarm is still executing. EFI, failure clusters, and the narrative report will populate as agents finish.",
      },
    ],
    generatedAt,
    efi: {
      score: 0,
      components: [],
    },
    funnel: [],
    failureClusters: [],
    highlightReel: [],
    heatmap: [],
    executionQuality: {
      strictVisualMode,
      totalInteractionActions: 0,
      visualOnlyActions: 0,
      domAssistedActions: 0,
      domOnlyActions: 0,
      visualPurity: 100,
      domAssistRate: 0,
    },
    readable: {
      overview: {
        en: "The run is still executing. Once enough telemetry arrives, the report will explain the result in plain language.",
        zh: "运行仍在进行中。等足够多的遥测数据返回后，报告会用更容易理解的自然语言解释这次结果。",
      },
      metrics: [],
      findings: [],
      agentStories: [],
    },
    metadata: {
      targetUrl,
      goal,
      agentCount,
      strictVisualMode,
      pending: true,
    },
  };
}

function refreshDerivedFields(record: RunRecord, scenario: DemoScenarioDefinition) {
  record.events = toTimeline(record.agentRuns, scenario);
  record.summary = buildSummary(record.agentRuns);
  record.personaSummary = buildPersonaSummary(record.agentRuns);
  record.stageSummary = buildStageSummary(record.agentRuns, scenario);
}

function upsertAgentRun(record: RunRecord, scenario: DemoScenarioDefinition, nextRun: AgentRunResult) {
  const existingIndex = record.agentRuns.findIndex((run) => run.agentId === nextRun.agentId);

  if (existingIndex === -1) {
    record.agentRuns.push(nextRun);
  } else {
    record.agentRuns[existingIndex] = nextRun;
  }

  refreshDerivedFields(record, scenario);
}

async function finalizeRun(record: RunRecord) {
  const reportInput: ReportInput = {
    targetUrl: record.targetUrl,
    goal: record.goal,
    agentRuns: record.agentRuns,
  };

  record.report = buildReport(reportInput);
  record.report = applyReadableReport(record.report, await enhanceReadableReport(record));
  record.completedAt = new Date().toISOString();
}

async function persistBestEffort(record: RunRecord) {
  const persistence = await persistRunRecord(record);

  if (!persistence.ok && !record.warnings.includes(persistence.warning)) {
    record.warnings.push(persistence.warning);
  }
}

async function executeRun(record: RunRecord, scenario: DemoScenarioDefinition, personas: AgentPersona[], maxSteps: number) {
  record.status = "running";
  refreshDerivedFields(record, scenario);
  await persistBestEffort(record);

  try {
    const results = await runLiveSwarm({
      runId: record.id,
      scenario,
      targetUrl: record.targetUrl,
      goal: record.goal,
      maxSteps,
      strictVisualMode: record.strictVisualMode,
      personas,
      onAgentStart(run) {
        upsertAgentRun(record, scenario, run);
      },
      onAgentStep(run) {
        upsertAgentRun(record, scenario, run);
      },
      onAgentComplete(run) {
        upsertAgentRun(record, scenario, run);
      },
    });

    record.agentRuns = results;
    record.status = "completed";
    refreshDerivedFields(record, scenario);
    await finalizeRun(record);
    await persistBestEffort(record);
  } catch (error) {
    record.status = "failed";
    record.completedAt = new Date().toISOString();
    record.warnings.push(error instanceof Error ? error.message : "Unknown run execution failure.");
    await persistBestEffort(record);
  } finally {
    activeJobs.delete(record.id);
  }
}

export function getCreateRunSchema() {
  return createRunSchema;
}

export function getDemoScenarios() {
  return listScenarios();
}

interface CreatedRun {
  record: RunRecord;
  start: () => Promise<void>;
}

export async function createRun(input: unknown) {
  const payload = createRunSchema.parse(input);
  const scenario =
    payload.demoScenario && hasScenario(payload.demoScenario)
      ? getScenario(payload.demoScenario)
      : await compileScenarioProfile({
          targetUrl: payload.targetUrl!,
          goal: payload.goal!,
          inputSeeds: payload.inputSeeds,
        });

  if (!scenario) {
    throw new Error(`Unknown demo scenario "${payload.demoScenario}".`);
  }
  const runId = randomUUID();
  const personas = selectPersonas(payload.agentCount);
  const maxSteps = Math.max(payload.maxSteps, scenario.minimumMaxSteps);
  const now = new Date().toISOString();
  const record: RunRecord = {
    id: runId,
    status: "queued",
    createdAt: now,
    completedAt: null,
    scenarioId: payload.demoScenario && hasScenario(payload.demoScenario) ? payload.demoScenario : scenario.id,
    scenarioName: scenario.name,
    scenarioProfile: scenario,
    targetUrl: payload.targetUrl ?? scenario.targetUrl,
    goal: payload.goal ?? scenario.goal,
    agentCount: payload.agentCount,
    strictVisualMode: payload.strictVisualMode,
    storageMode: env.storageMode,
    executionMode: env.executionMode,
    summary: {
      completed: 0,
      failed: 0,
      averageSteps: 0,
      peakFrustration: 0,
    },
    personaSummary: [],
    stageSummary: scenario.frames.map((frame) => ({ label: frame.label, reached: 0, stuck: 0 })),
    agentRuns: [],
    events: [],
    report: createPlaceholderReport(
      payload.targetUrl ?? scenario.targetUrl,
      payload.goal ?? scenario.goal,
      payload.agentCount,
      payload.strictVisualMode,
    ),
    warnings: buildWarnings(payload.strictVisualMode),
  };

  if (maxSteps !== payload.maxSteps) {
    record.warnings.push(
      `Step budget raised from ${payload.maxSteps} to ${maxSteps} to satisfy the ${scenario.siteLabel} scenario floor.`,
    );
  }

  if (!payload.demoScenario || !hasScenario(payload.demoScenario)) {
    record.warnings.push("This run is using an AI-compiled scenario profile generated from the supplied URL and goal.");
  }

  upsertRunInStore(record);
  await persistBestEffort(record);

  return {
    record,
    start: async () => {
      const existingJob = activeJobs.get(record.id);

      if (existingJob) {
        await existingJob;
        return;
      }

      const job = executeRun(record, scenario, personas, maxSteps);
      activeJobs.set(record.id, job);
      await job;
    },
  } satisfies CreatedRun;
}

export async function getRunRecord(id: string) {
  return loadRunRecord(id);
}
