import type { AgentRunResult, PersonaArchetype } from "@chaos-swarm/agent-core";
import type { ReportDocument } from "@chaos-swarm/reporting";
import type { DemoScenarioId } from "./scenarios";

export interface TimelineEvent {
  id: string;
  agentId: string;
  persona: PersonaArchetype;
  step: number;
  timestamp: string;
  stageLabel: string | null;
  title: string;
  detail: string;
  rationale: string;
  action: string;
  actionCode: string;
  decisionKind: string;
  actionOk: boolean;
  loadState: string;
  url: string;
  note: string;
  frustration: number;
  confidence: number;
}

export interface StageSnapshot {
  label: string;
  reached: number;
  stuck: number;
}

export interface PersonaSnapshot {
  archetype: PersonaArchetype;
  total: number;
  completed: number;
  failed: number;
}

export interface RunRecord {
  id: string;
  status: "completed" | "queued" | "running" | "failed";
  createdAt: string;
  completedAt: string | null;
  scenarioId: DemoScenarioId;
  scenarioName: string;
  targetUrl: string;
  goal: string;
  agentCount: number;
  storageMode: "memory" | "supabase";
  executionMode: "simulation" | "local" | "hybrid";
  summary: {
    completed: number;
    failed: number;
    averageSteps: number;
    peakFrustration: number;
  };
  personaSummary: PersonaSnapshot[];
  stageSummary: StageSnapshot[];
  agentRuns: AgentRunResult[];
  events: TimelineEvent[];
  report: ReportDocument;
  warnings: string[];
}
