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

function pickLocalized(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function describeStepTitle(
  step: AgentRunResult["steps"][number],
  stageLabel: string | null,
  locale: "en" | "zh" = "en",
) {
  if (locale === "zh" && step.readableTitleZh) {
    return step.readableTitleZh;
  }

  if (locale === "en" && step.readableTitle) {
    return step.readableTitle;
  }

  const target = step.decision.target ?? "";

  if (stageLabel && step.action.ok && (step.decision.kind === "wait" || step.decision.kind === "click")) {
    return pickLocalized(locale, `Reached ${stageLabel}`, `已到达 ${stageLabel}`);
  }

  if (step.action.kind === "escalate") {
    return pickLocalized(locale, "Aborted after a runtime problem", "因运行时问题而中止");
  }

  if (step.decision.kind === "wait") {
    return pickLocalized(locale, "Loaded the next screen", "等待页面进入下一状态");
  }

  if (step.decision.kind === "scroll") {
    return pickLocalized(locale, "Scanned the page before acting", "先扫描页面再行动");
  }

  if (step.decision.kind === "type") {
    if (/login form/i.test(target)) {
      return pickLocalized(locale, "Filled the login form", "填写了登录表单");
    }

    if (/registration form/i.test(target)) {
      return pickLocalized(locale, "Filled the registration form", "填写了注册表单");
    }

    if (/validation form/i.test(target)) {
      return pickLocalized(locale, "Filled the validation form", "填写了校验表单");
    }

    if (/search/i.test(target)) {
      return pickLocalized(locale, "Entered a search query", "输入了搜索词");
    }

    return pickLocalized(
      locale,
      `Entered information into ${target || "the form"}`,
      `向${target || "表单"}输入了信息`,
    );
  }

  if (step.decision.kind === "click") {
    if (/login/i.test(target)) {
      return pickLocalized(locale, "Submitted the login action", "提交了登录动作");
    }

    if (/register/i.test(target)) {
      return pickLocalized(locale, "Submitted the registration action", "提交了注册动作");
    }

    if (/add to cart/i.test(target)) {
      return pickLocalized(locale, "Added the item to cart", "把商品加入了购物车");
    }

    if (/view cart|shopping cart|cart review/i.test(target)) {
      return pickLocalized(locale, "Opened the cart view", "打开了购物车页面");
    }

    if (/view product/i.test(target)) {
      return pickLocalized(locale, "Opened the product detail page", "打开了商品详情页");
    }

    if (/form authentication/i.test(target)) {
      return pickLocalized(locale, "Opened the authentication module", "打开了认证模块");
    }

    if (/search submit/i.test(target)) {
      return pickLocalized(locale, "Submitted the search", "提交了搜索");
    }

    return pickLocalized(locale, `Clicked ${target || "the next control"}`, `点击了${target || "下一个控件"}`);
  }

  if (step.decision.kind === "retry") {
    return pickLocalized(locale, `Retried ${target || "the previous action"}`, `重试了${target || "上一步动作"}`);
  }

  return pickLocalized(locale, `${titleCase(step.decision.kind)} action`, `${titleCase(step.decision.kind)} 动作`);
}

function describeStepDetail(step: AgentRunResult["steps"][number], locale: "en" | "zh" = "en") {
  const detail = locale === "zh" ? step.readableDetailZh ?? step.readableDetail : step.readableDetail;
  const reason =
    locale === "zh"
      ? step.action.ok
        ? step.successReasonZh ?? step.successReason
        : step.failureReasonZh ?? step.failureReason
      : step.action.ok
        ? step.successReason
        : step.failureReason;

  if (detail) {
    return reason
      ? pickLocalized(locale, `${detail} Reason: ${reason}`, `${detail} 原因：${reason}`)
      : detail;
  }

  return step.action.details || step.observation.summary;
}

function getStageLabelForStep(step: AgentRunResult["steps"][number], scenario: DemoScenarioDefinition) {
  if (step.stageLabel) {
    return step.stageLabel;
  }

  const matchedStage = scenario.frames.find((stage) => step.stageId === stage.id);

  return matchedStage?.label ?? null;
}

function toTimeline(agentRuns: AgentRunResult[], scenario: DemoScenarioDefinition): TimelineEvent[] {
  return agentRuns
    .flatMap((run) => {
      return run.steps.map((step) => {
        const stageLabel = getStageLabelForStep(step, scenario);
        const title = describeStepTitle(step, stageLabel, "en");
        const titleZh = describeStepTitle(step, stageLabel, "zh");

        return {
          id: `${run.agentId}-${step.step}`,
          agentId: run.agentId,
          persona: run.persona.archetype,
          step: step.step,
          timestamp: step.timestamp,
          stageLabel,
          title,
          detail: describeStepDetail(step, "en"),
          titleZh,
          detailZh: describeStepDetail(step, "zh"),
          rationale: step.decision.rationale,
          rationaleZh: step.decision.rationaleZh,
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

function stageMatched(run: AgentRunResult, _scenario: DemoScenarioDefinition, stage: DemoScenarioDefinition["frames"][number]) {
  return run.steps.some((step) => {
    return step.stageId === stage.id || step.stageLabel === stage.label;
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
  if (!env.openAiApiKey && env.executionMode !== "simulation") {
    throw new Error("OPENAI_API_KEY is required for real AI-agent runs. Configure the key or switch to simulation mode.");
  }

  const payload = createRunSchema.parse(input);
  let scenario = payload.demoScenario && hasScenario(payload.demoScenario) ? getScenario(payload.demoScenario) : null;
  let scenarioCompileSource: "static" | "llm" | "fallback" = "static";
  let scenarioCompileReason: string | undefined;

  if (!scenario) {
    const compiledScenario = await compileScenarioProfile({
      targetUrl: payload.targetUrl!,
      goal: payload.goal!,
      inputSeeds: payload.inputSeeds,
    });
    scenario = compiledScenario.scenario;
    scenarioCompileSource = compiledScenario.source;
    scenarioCompileReason = compiledScenario.reason;
  }

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
    record.warnings.push(
      scenarioCompileSource === "llm"
        ? "This run is using an AI-compiled scenario profile generated from the supplied URL and goal."
        : "This run fell back to the deterministic custom-scenario template because the AI compiler did not return a reliable profile.",
    );
  }

  if (scenarioCompileReason) {
    record.warnings.push(scenarioCompileReason);
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
