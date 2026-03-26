import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AgentRunResult, LoadState, PersonaArchetype } from "@chaos-swarm/agent-core";
import { buildReport, type ReportDocument } from "@chaos-swarm/reporting";
import { env } from "./env";
import { scenarioCatalog, type DemoScenarioId } from "./scenarios";
import { getRunFromStore, upsertRunInStore } from "./store";
import type { PersonaSnapshot, RunRecord, StageSnapshot, TimelineEvent } from "./types";

export type PersistenceMode = "service-role" | "anon" | "direct-db-url";
export type PersistenceStatus = PersistenceMode | "unavailable";

interface PersistenceClient {
  client: SupabaseClient;
  mode: PersistenceMode;
}

interface RunRow {
  run_id: string;
  scenario_id: string;
  target_url: string;
  goal: string;
  status: RunRecord["status"];
  agent_count: number;
  storage_mode: RunRecord["storageMode"];
  execution_mode: RunRecord["executionMode"];
  summary: RunRecord["summary"];
  record_json: RunRecord | Record<string, never>;
  created_at: string;
  completed_at: string | null;
}

interface AgentRow {
  run_id: string;
  agent_id: string;
  archetype: string;
  status: "completed" | "failed" | "running";
  seed: string | null;
  frustration_score: number;
  confidence_score: number;
  exit_reason: string | null;
  steps_completed: number;
  summary: string;
}

interface EventRow {
  run_id: string;
  agent_id: string;
  step_index: number;
  action_kind: string;
  action_ok: boolean;
  decision_kind: string;
  load_state: string;
  page_url: string;
  note: string;
  frustration: number;
  confidence: number;
  occurred_at: string;
}

interface ReportRow {
  run_id: string;
  title: string;
  summary: string;
  report_json: ReportDocument;
  generated_at: string;
}

function getDatabaseUrl() {
  return process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? null;
}

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function deriveSupabaseProjectUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    const host = url.hostname;

    if (host.endsWith(".supabase.co")) {
      const hostParts = host.split(".");

      if ((hostParts[0] === "db" || hostParts[0] === "postgres") && hostParts.length >= 4) {
        return `https://${hostParts.slice(1).join(".")}`;
      }

      return `https://${host}`;
    }

    if (host.endsWith("pooler.supabase.com")) {
      const username = decodeURIComponent(url.username);
      const projectRef = username.includes(".") ? username.split(".").slice(1).join(".") : "";

      if (projectRef) {
        return `https://${projectRef}.supabase.co`;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function resolveSupabaseProjectUrl() {
  const databaseUrl = getDatabaseUrl();

  if (!env.supabaseServiceRoleKey && databaseUrl) {
    const derived = deriveSupabaseProjectUrl(databaseUrl);

    if (derived) {
      return derived;
    }
  }

  if (env.supabaseUrl) {
    return env.supabaseUrl;
  }

  if (databaseUrl) {
    return deriveSupabaseProjectUrl(databaseUrl);
  }

  return null;
}

function createPersistenceClient(): PersistenceClient | null {
  const projectUrl = resolveSupabaseProjectUrl();
  const key = env.supabaseServiceRoleKey ?? env.supabaseAnonKey ?? null;

  if (!projectUrl || !key) {
    return null;
  }

  const mode: PersistenceMode = env.supabaseServiceRoleKey
    ? "service-role"
    : getDatabaseUrl()
      ? "direct-db-url"
      : "anon";

  return {
    client: createClient(projectUrl, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    mode,
  };
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toRecordSummary(summary: unknown, agents: AgentRow[]) {
  const fallback = {
    completed: agents.filter((agent) => agent.status === "completed").length,
    failed: agents.filter((agent) => agent.status === "failed").length,
    averageSteps: 0,
    peakFrustration: agents.reduce((max, agent) => Math.max(max, toNumber(agent.frustration_score)), 0),
  };

  if (!summary || typeof summary !== "object") {
    return fallback;
  }

  const candidate = summary as Partial<RunRecord["summary"]>;

  return {
    completed: typeof candidate.completed === "number" ? candidate.completed : fallback.completed,
    failed: typeof candidate.failed === "number" ? candidate.failed : fallback.failed,
    averageSteps: typeof candidate.averageSteps === "number" ? candidate.averageSteps : fallback.averageSteps,
    peakFrustration:
      typeof candidate.peakFrustration === "number" ? candidate.peakFrustration : fallback.peakFrustration,
  };
}

function buildPersonaSummary(agents: AgentRow[]): PersonaSnapshot[] {
  const summary = new Map<string, PersonaSnapshot>();

  for (const agent of agents) {
    const archetype = agent.archetype;
    const current = summary.get(archetype) ?? {
      archetype: archetype as PersonaArchetype,
      total: 0,
      completed: 0,
      failed: 0,
    };

    current.total += 1;

    if (agent.status === "completed") {
      current.completed += 1;
    }

    if (agent.status === "failed") {
      current.failed += 1;
    }

    summary.set(archetype, current);
  }

  return Array.from(summary.values());
}

function buildStageSummary(scenarioId: string): StageSnapshot[] {
  const scenario = scenarioCatalog[scenarioId as DemoScenarioId];

  if (!scenario) {
    return [];
  }

  return scenario.frames.map((frame) => ({
    label: frame.label,
    reached: 0,
    stuck: 0,
  }));
}

function buildLatestEventByAgent(events: EventRow[]) {
  const latestByAgent = new Map<string, EventRow>();

  for (const event of events) {
    const current = latestByAgent.get(event.agent_id);

    if (!current) {
      latestByAgent.set(event.agent_id, event);
      continue;
    }

    if (event.step_index > current.step_index) {
      latestByAgent.set(event.agent_id, event);
      continue;
    }

    if (event.step_index === current.step_index && event.occurred_at > current.occurred_at) {
      latestByAgent.set(event.agent_id, event);
    }
  }

  return latestByAgent;
}

function recoverTimelineEvents(events: EventRow[], agents: AgentRow[]): TimelineEvent[] {
  const agentById = new Map(agents.map((agent) => [agent.agent_id, agent] as const));

  return events.map((event, index) => {
    const agent = agentById.get(event.agent_id);

    return {
      id: `${event.run_id}:${event.agent_id}:${event.step_index}:${index}`,
      agentId: event.agent_id,
      persona: (agent?.archetype as PersonaArchetype) ?? "Novice",
      step: event.step_index,
      timestamp: event.occurred_at,
      stageLabel: null,
      title: event.action_ok ? "Recovered action" : "Recovered failed action",
      detail: event.note,
      rationale: event.note,
      action: event.action_kind,
      actionCode: event.action_kind,
      decisionKind: event.decision_kind,
      actionOk: event.action_ok,
      loadState: event.load_state,
      url: event.page_url,
      note: event.note,
      frustration: toNumber(event.frustration),
      confidence: toNumber(event.confidence),
      executionAssistMode: "none",
      domAssisted: false,
    };
  });
}

function recoverAgentRuns(
  run: RunRow,
  agents: AgentRow[],
  events: EventRow[],
  strictVisualMode: boolean,
): AgentRunResult[] {
  const latestEventByAgent = buildLatestEventByAgent(events);
  const eventsByAgent = new Map<string, EventRow[]>();

  for (const event of events) {
    const list = eventsByAgent.get(event.agent_id) ?? [];
    list.push(event);
    eventsByAgent.set(event.agent_id, list);
  }

  return agents.map((agent) => {
    const agentEvents = eventsByAgent.get(agent.agent_id) ?? [];
    const latestEvent = latestEventByAgent.get(agent.agent_id);

    return {
      agentId: agent.agent_id,
      persona: {
        archetype: agent.archetype as PersonaArchetype,
        skillLevel: 0,
        patience: 0,
        attentionBias: 0,
        readingSpeed: 0,
        rageThreshold: 0,
      },
      config: {
        targetUrl: run.target_url,
        goal: run.goal,
        maxSteps: Math.max(agent.steps_completed, agentEvents.length),
        strictVisualMode,
      },
      startedAt: run.created_at,
      finishedAt: run.completed_at ?? latestEvent?.occurred_at ?? run.created_at,
      completed: agent.status === "completed",
      failed: agent.status === "failed",
      finalPage: {
        url: latestEvent?.page_url ?? run.target_url,
        title: undefined,
        visibleTargets: [],
        loadState: (latestEvent?.load_state ?? "interactive") as LoadState,
        errorFlags: [],
      },
      summary: agent.summary,
      steps: [],
    };
  });
}

function buildRecoveredReport(run: RunRow, agentRuns: AgentRunResult[], strictVisualMode: boolean) {
  try {
    return buildReport({
      targetUrl: run.target_url,
      goal: run.goal,
      agentRuns,
    });
  } catch {
    return {
      title: `Chaos Swarm report for ${run.goal}`,
      summary: `Recovered run ${run.run_id} from persistence.`,
      sections: [
        {
          heading: "Recovered",
          body: "The persisted report payload was unavailable, so this record was rebuilt from the stored run metadata.",
        },
      ],
      generatedAt: run.created_at,
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
        visualPurity: 0,
        domAssistRate: 0,
      },
      readable: {
        overview: {
          en: "This record was recovered from persistence before the full report payload was available.",
          zh: "This record was recovered from persistence before the full report payload was available.",
        },
        metrics: [],
        findings: [],
        agentStories: [],
      },
      metadata: {
        targetUrl: run.target_url,
        goal: run.goal,
        agentCount: run.agent_count,
        strictVisualMode,
        recoveredFromPersistence: true,
      },
    } as ReportDocument;
  }
}

function recoverStrictVisualMode(reportJson: ReportDocument | null | undefined) {
  return Boolean((reportJson as { metadata?: { strictVisualMode?: unknown } } | null | undefined)?.metadata?.strictVisualMode);
}

function buildRecoveredRunRecord(run: RunRow, agents: AgentRow[], events: EventRow[], reportRow: ReportRow | null): RunRecord {
  if (run.record_json && typeof run.record_json === "object" && "id" in run.record_json) {
    return run.record_json as RunRecord;
  }

  const strictVisualMode = recoverStrictVisualMode(reportRow?.report_json);
  const agentRuns = recoverAgentRuns(run, agents, events, strictVisualMode);
  const report = reportRow?.report_json ?? buildRecoveredReport(run, agentRuns, strictVisualMode);
  const summary = toRecordSummary(run.summary, agents);
  const scenario = scenarioCatalog[run.scenario_id as DemoScenarioId];

  return {
    id: run.run_id,
    status: run.status,
    createdAt: run.created_at,
    completedAt: run.completed_at,
    scenarioId: run.scenario_id as DemoScenarioId,
    scenarioName: scenario?.name ?? titleCase(run.scenario_id),
    targetUrl: run.target_url,
    goal: run.goal,
    agentCount: run.agent_count,
    strictVisualMode,
    storageMode: run.storage_mode,
    executionMode: run.execution_mode,
    summary,
    personaSummary: buildPersonaSummary(agents),
    stageSummary: buildStageSummary(run.scenario_id),
    agentRuns,
    events: recoverTimelineEvents(events, agents),
    report,
    warnings: [],
  };
}

function toRunRow(record: RunRecord): RunRow {
  const recordJson = JSON.parse(JSON.stringify(record)) as RunRecord;

  return {
    run_id: record.id,
    scenario_id: record.scenarioId,
    target_url: record.targetUrl,
    goal: record.goal,
    status: record.status,
    agent_count: record.agentCount,
    storage_mode: record.storageMode,
    execution_mode: record.executionMode,
    summary: record.summary,
    record_json: recordJson,
    created_at: record.createdAt,
    completed_at: record.completedAt,
  };
}

function toAgentRows(record: RunRecord): AgentRow[] {
  return record.agentRuns.map((run) => ({
    run_id: record.id,
    agent_id: run.agentId,
    archetype: run.persona.archetype,
    status: run.completed ? "completed" : run.failed ? "failed" : "running",
    seed: run.config.seed ?? null,
    frustration_score: run.steps.at(-1)?.frustration ?? 0,
    confidence_score: run.steps.at(-1)?.confidence ?? 0,
    exit_reason: run.summary,
    steps_completed: run.steps.length,
    summary: run.summary,
  }));
}

function toEventRows(record: RunRecord): EventRow[] {
  return record.events.map((event) => ({
    run_id: record.id,
    agent_id: event.agentId,
    step_index: event.step,
    action_kind: event.actionCode,
    action_ok: event.actionOk,
    decision_kind: event.decisionKind,
    load_state: event.loadState,
    page_url: event.url,
    note: `${event.title} | ${event.detail}`,
    frustration: event.frustration,
    confidence: event.confidence,
    occurred_at: event.timestamp,
  }));
}

function toReportRow(record: RunRecord): ReportRow {
  return {
    run_id: record.id,
    title: record.report.title,
    summary: record.report.summary,
    report_json: record.report,
    generated_at: record.report.generatedAt,
  };
}

function throwIfError(error: { message: string } | null | undefined) {
  if (error) {
    throw new Error(error.message);
  }
}

function isPersistenceNotReadyError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    /could not find the table/i.test(error.message) ||
    /schema cache/i.test(error.message) ||
    /relation .* does not exist/i.test(error.message)
  );
}

export function getPersistenceMode(): PersistenceStatus {
  const client = createPersistenceClient();
  return client?.mode ?? "unavailable";
}

export async function persistRunRecord(record: RunRecord) {
  upsertRunInStore(record);

  const persistence = createPersistenceClient();

  if (!persistence) {
    return { ok: false as const, warning: "Supabase persistence is unavailable; kept the run in memory." };
  }

  const { client, mode } = persistence;

  try {
    const runRow = toRunRow(record);
    const agentRows = toAgentRows(record);
    const eventRows = toEventRows(record);
    const reportRow = toReportRow(record);

    const runWrite = await client.from("runs").upsert(runRow, {
      onConflict: "run_id",
    });
    throwIfError(runWrite.error);

    const deleteAgents = await client.from("agents").delete().eq("run_id", record.id);
    throwIfError(deleteAgents.error);

    const deleteEvents = await client.from("events").delete().eq("run_id", record.id);
    throwIfError(deleteEvents.error);

    if (agentRows.length > 0) {
      const agentWrite = await client.from("agents").insert(agentRows);
      throwIfError(agentWrite.error);
    }

    if (eventRows.length > 0) {
      const eventWrite = await client.from("events").insert(eventRows);
      throwIfError(eventWrite.error);
    }

    const reportWrite = await client.from("reports").upsert(reportRow, {
      onConflict: "run_id",
    });
    throwIfError(reportWrite.error);

    return {
      ok: true as const,
      mode,
    };
  } catch (error) {
    return {
      ok: false as const,
      warning: error instanceof Error ? error.message : "Unknown Supabase persistence failure.",
    };
  }
}

export async function loadRunRecord(id: string): Promise<RunRecord | null> {
  const cached = getRunFromStore(id);

  if (cached) {
    return cached;
  }

  const persistence = createPersistenceClient();

  if (!persistence) {
    return null;
  }

  const { client } = persistence;

  try {
    const [runResult, agentResult, eventResult, reportResult] = await Promise.all([
      client.from("runs").select("*").eq("run_id", id).maybeSingle(),
      client.from("agents").select("*").eq("run_id", id).order("agent_id", { ascending: true }),
      client.from("events").select("*").eq("run_id", id).order("step_index", { ascending: true }),
      client.from("reports").select("*").eq("run_id", id).maybeSingle(),
    ]);

    throwIfError(runResult.error);
    throwIfError(agentResult.error);
    throwIfError(eventResult.error);
    throwIfError(reportResult.error);

    if (!runResult.data) {
      return null;
    }

    const agents = (agentResult.data ?? []) as AgentRow[];
    const events = (eventResult.data ?? []) as EventRow[];
    const reportRow = reportResult.data ? (reportResult.data as ReportRow) : null;
    const record = buildRecoveredRunRecord(runResult.data as RunRow, agents, events, reportRow);

    upsertRunInStore(record);

    return record;
  } catch (error) {
    if (isPersistenceNotReadyError(error)) {
      return null;
    }

    throw error;
  }
}
