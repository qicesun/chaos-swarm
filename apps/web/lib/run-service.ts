import { randomUUID } from "node:crypto";
import {
  createAgent,
  defaultPersonaSet,
  type AgentHooks,
  type AgentPersona,
  type AgentRunInput,
  type AgentRunResult,
} from "@chaos-swarm/agent-core";
import { buildReport, type ReportInput } from "@chaos-swarm/reporting";
import { z } from "zod";
import { env } from "./env";
import { persistRunRecord } from "./persistence";
import { getScenario, listScenarios, type DemoScenarioDefinition } from "./scenarios";
import { getStore } from "./store";
import type { PersonaSnapshot, RunRecord, StageSnapshot, TimelineEvent } from "./types";

const createRunSchema = z.object({
  targetUrl: z.string().url().optional(),
  goal: z.string().min(3).optional(),
  agentCount: z.number().int().min(1).max(32).default(12),
  maxSteps: z.number().int().min(2).max(12).default(5),
  demoScenario: z.enum(["saucedemo", "magento"]).default("saucedemo"),
});

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function selectPersonas(agentCount: number): AgentPersona[] {
  const catalog = defaultPersonaSet();
  return Array.from({ length: agentCount }, (_, index) => catalog[index % catalog.length]);
}

function makeScenarioHooks(scenario: DemoScenarioDefinition): AgentHooks {
  return {
    async observe(context) {
      const frame = scenario.frames[Math.min(context.step, scenario.frames.length - 1)];
      const errorFlags: string[] = [];
      const impatience = 1 - context.persona.patience;
      const noise = frame.errorBias + impatience * 0.2 + context.frustration * 0.3;

      if (noise > 0.44) {
        errorFlags.push("primary CTA feedback is ambiguous");
      }

      if (scenario.id === "magento" && frame.id === "options" && context.persona.archetype !== "Speedrunner") {
        errorFlags.push("option selection is visually dense");
      }

      if (context.persona.archetype === "ChaosAgent" && context.step > 1 && context.frustration > 0.45) {
        errorFlags.push("rage-click storm");
      }

      return {
        url: frame.url,
        title: `${scenario.siteLabel} - ${frame.label}`,
        visibleTargets: frame.targets,
        loadState: context.step === 0 ? "loading" : context.step >= scenario.frames.length ? "complete" : "interactive",
        errorFlags,
      };
    },
  };
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

function buildStageSummary(agentRuns: AgentRunResult[], scenario: DemoScenarioDefinition): StageSnapshot[] {
  return scenario.frames.map((frame, index) => {
    const reached = agentRuns.filter((run) => run.steps.length > index).length;
    const stuck = agentRuns.filter((run) => {
      const step = run.steps[index];
      return step?.observation.page.errorFlags.length;
    }).length;

    return {
      label: frame.label,
      reached,
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
    warnings.push("OPENAI_API_KEY is not wired yet, so run generation is using deterministic simulation hooks.");
  }

  if (env.executionMode !== "hybrid") {
    warnings.push("Browser execution is still in simulation mode; live Browserbase sessions are the next integration step.");
  }

  return warnings;
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
  const agent = createAgent({ hooks: makeScenarioHooks(scenario) });
  const runId = randomUUID();
  const personas = selectPersonas(payload.agentCount);

  const agentRuns = await Promise.all(
    personas.map((persona, index) => {
      const agentInput: AgentRunInput = {
        agentId: `${persona.archetype.toLowerCase()}-${String(index + 1).padStart(2, "0")}`,
        persona,
        config: {
          targetUrl: payload.targetUrl ?? scenario.targetUrl,
          goal: payload.goal ?? scenario.goal,
          maxSteps: payload.maxSteps,
          seed: `${runId}-${index + 1}`,
          demoMode: true,
        },
      };

      return agent.run(agentInput);
    }),
  );

  const reportInput: ReportInput = {
    targetUrl: payload.targetUrl ?? scenario.targetUrl,
    goal: payload.goal ?? scenario.goal,
    agentRuns,
  };
  const report = buildReport(reportInput);
  const record: RunRecord = {
    id: runId,
    status: "completed",
    createdAt: agentRuns[0]?.startedAt ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    scenarioId: payload.demoScenario,
    scenarioName: scenario.name,
    targetUrl: payload.targetUrl ?? scenario.targetUrl,
    goal: payload.goal ?? scenario.goal,
    agentCount: payload.agentCount,
    storageMode: env.storageMode,
    executionMode: env.executionMode,
    summary: buildSummary(agentRuns),
    personaSummary: buildPersonaSummary(agentRuns),
    stageSummary: buildStageSummary(agentRuns, scenario),
    agentRuns,
    events: toTimeline(agentRuns),
    report,
    warnings: buildWarnings(),
  };

  getStore().runs.set(record.id, record);
  const persistence = await persistRunRecord(record);

  if (!persistence.ok && !record.warnings.includes(persistence.warning)) {
    record.warnings.push(persistence.warning);
  }

  return record;
}

export function getRunRecord(id: string) {
  return getStore().runs.get(id) ?? null;
}
