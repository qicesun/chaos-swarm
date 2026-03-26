import { randomUUID } from "node:crypto";
import { defaultPersonaSet, type AgentPersona, type AgentRunResult } from "@chaos-swarm/agent-core";
import { buildReport, type ReportDocument, type ReportInput } from "@chaos-swarm/reporting";
import { z } from "zod";
import { env } from "./env";
import { runLiveSwarm } from "./live-runner";
import { persistRunRecord } from "./persistence";
import { getScenario, listScenarios, type DemoScenarioDefinition } from "./scenarios";
import { getStore } from "./store";
import type { PersonaSnapshot, RunRecord, StageSnapshot, TimelineEvent } from "./types";

const createRunSchema = z.object({
  targetUrl: z.string().url().optional(),
  goal: z.string().min(3).optional(),
  agentCount: z.number().int().min(1).max(32).default(12),
  maxSteps: z.number().int().min(2).max(12).default(5),
  demoScenario: z.enum(["saucedemo", "magento", "walmart"]).default("saucedemo"),
});

const activeJobs = new Map<string, Promise<void>>();

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function selectPersonas(agentCount: number): AgentPersona[] {
  const catalog = defaultPersonaSet();
  return Array.from({ length: agentCount }, (_, index) => catalog[index % catalog.length]);
}

function toTimeline(agentRuns: AgentRunResult[]): TimelineEvent[] {
  return agentRuns
    .flatMap((run) =>
      run.steps.map((step) => ({
        id: `${run.agentId}-${step.step}`,
        agentId: run.agentId,
        persona: run.persona.archetype,
        step: step.step,
        timestamp: step.timestamp,
        action: `${step.decision.kind} -> ${step.action.kind}`,
        actionOk: step.action.ok,
        loadState: step.observation.page.loadState,
        url: step.observation.page.url,
        note: step.observation.summary,
        frustration: round(step.frustration * 100),
        confidence: round(step.confidence * 100),
      })),
    )
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

  return run.steps.some((step) => {
    const stepUrl = step.observation.page.url;

    if (scenario.id === "saucedemo") {
      if (stage.id === "login") {
        return /saucedemo\.com\/?$/.test(stepUrl) || /login/i.test(step.observation.summary);
      }

      if (stage.id === "inventory") {
        return /inventory/.test(stepUrl);
      }

      if (stage.id === "cart") {
        return /cart/.test(stepUrl);
      }
    }

    if (scenario.id === "magento") {
      if (stage.id === "search") {
        return step.step === 0 || /softwaretestingboard\.com\/?$/.test(stepUrl);
      }

      if (stage.id === "results") {
        return /catalogsearch\/result/.test(stepUrl);
      }

      if (stage.id === "options") {
        return /radiant-tee/.test(stepUrl);
      }

      if (stage.id === "confirmation") {
        return /checkout\/cart/.test(stepUrl);
      }
    }

    if (scenario.id === "walmart") {
      if (stage.id === "search") {
        return step.step === 0 || /walmart\.com\/?$/.test(stepUrl);
      }

      if (stage.id === "results") {
        return /walmart\.com\/search/.test(stepUrl);
      }

      if (stage.id === "product") {
        return /walmart\.com\/ip\//.test(stepUrl);
      }

      if (stage.id === "cart-intent") {
        return /walmart\.com\/cart/.test(stepUrl) || /check out|cart contains/i.test(step.observation.summary);
      }
    }

    if (stagePath !== "/") {
      return stepUrl.includes(stagePath);
    }

    return false;
  });
}

function buildStageSummary(agentRuns: AgentRunResult[], scenario: DemoScenarioDefinition): StageSnapshot[] {
  return scenario.frames.map((frame) => {
    const reachedRuns = agentRuns.filter((run) => stageMatched(run, scenario, frame));
    const stuck = reachedRuns.filter((run) =>
      run.steps.some(
        (step) => stageMatched({ ...run, steps: [step] }, scenario, frame) && step.observation.page.errorFlags.length > 0,
      ),
    ).length;

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

function buildWarnings() {
  const warnings: string[] = [];

  if (!env.openAiApiKey) {
    warnings.push("OPENAI_API_KEY is not configured yet, so model-assisted page evaluation is disabled.");
  }

  if (env.executionMode === "simulation") {
    warnings.push("Browser execution is still in simulation mode.");
  } else if (env.executionMode === "local") {
    warnings.push("Local Playwright execution is active on this workstation; Browserbase fan-out is not enabled yet.");
  }

  if (!env.supabaseServiceRoleKey || !env.supabaseUrl) {
    warnings.push("Supabase persistence is disabled.");
  }

  return warnings;
}

function createPlaceholderReport(targetUrl: string, goal: string, agentCount: number): ReportDocument {
  return {
    title: `Chaos Swarm report for ${goal}`,
    summary: `Run in progress against ${targetUrl}. Waiting for agent telemetry before rendering the final report.`,
    sections: [
      {
        heading: "Status",
        body: "The swarm is still executing. EFI, failure clusters, and the narrative report will populate as agents finish.",
      },
    ],
    generatedAt: new Date().toISOString(),
    efi: {
      score: 0,
      components: [],
    },
    funnel: [],
    failureClusters: [],
    highlightReel: [],
    heatmap: [],
    metadata: {
      targetUrl,
      goal,
      agentCount,
      pending: true,
    },
  };
}

function refreshDerivedFields(record: RunRecord, scenario: DemoScenarioDefinition) {
  record.events = toTimeline(record.agentRuns);
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

function finalizeRun(record: RunRecord) {
  const reportInput: ReportInput = {
    targetUrl: record.targetUrl,
    goal: record.goal,
    agentRuns: record.agentRuns,
  };

  record.report = buildReport(reportInput);
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
    finalizeRun(record);
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

export async function createRun(input: unknown) {
  const payload = createRunSchema.parse(input);
  const scenario = getScenario(payload.demoScenario);
  const runId = randomUUID();
  const personas = selectPersonas(payload.agentCount);
  const now = new Date().toISOString();
  const record: RunRecord = {
    id: runId,
    status: "queued",
    createdAt: now,
    completedAt: null,
    scenarioId: payload.demoScenario,
    scenarioName: scenario.name,
    targetUrl: payload.targetUrl ?? scenario.targetUrl,
    goal: payload.goal ?? scenario.goal,
    agentCount: payload.agentCount,
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
    report: createPlaceholderReport(payload.targetUrl ?? scenario.targetUrl, payload.goal ?? scenario.goal, payload.agentCount),
    warnings: buildWarnings(),
  };

  getStore().runs.set(record.id, record);
  await persistBestEffort(record);

  const job = executeRun(record, scenario, personas, payload.maxSteps);
  activeJobs.set(record.id, job);
  void job;

  return record;
}

export function getRunRecord(id: string) {
  return getStore().runs.get(id) ?? null;
}
