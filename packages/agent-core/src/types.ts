export type PersonaArchetype = "Speedrunner" | "Novice" | "ChaosAgent";

export interface AgentPersona {
  archetype: PersonaArchetype;
  skillLevel: number;
  patience: number;
  attentionBias: number;
  readingSpeed: number;
  rageThreshold: number;
}

export interface RunConfig {
  targetUrl: string;
  goal: string;
  maxSteps: number;
  seed?: string;
  demoMode?: boolean;
  strictVisualMode?: boolean;
}

export type LoadState = "idle" | "loading" | "interactive" | "complete" | "error";

export interface PageState {
  url: string;
  title?: string;
  screenshot?: string;
  visibleTargets: string[];
  loadState: LoadState;
  errorFlags: string[];
}

export interface Observation {
  step: number;
  summary: string;
  page: PageState;
}

export type DecisionKind = "click" | "type" | "scroll" | "wait" | "retry" | "escalate" | "stop";

export interface Decision {
  kind: DecisionKind;
  rationale: string;
  target?: string;
  value?: string;
}

export type ExecutionAssistMode = "visual_only" | "visual_with_dom_assist" | "dom_only" | "none";

export interface ActionExecutionAssist {
  strictVisualMode: boolean;
  mode: ExecutionAssistMode;
  domAssisted: boolean;
  visualAttempted: boolean;
  reason?: string;
}

export interface ActionResult {
  kind: DecisionKind;
  ok: boolean;
  details: string;
  nextPage?: PageState;
  execution?: ActionExecutionAssist;
}

export interface AgentStepRecord {
  step: number;
  observation: Observation;
  decision: Decision;
  action: ActionResult;
  stageId?: string | null;
  stageLabel?: string | null;
  goalStatus?: "not_started" | "in_progress" | "blocked" | "complete";
  readableTitle?: string | null;
  readableDetail?: string | null;
  readableTitleZh?: string | null;
  readableDetailZh?: string | null;
  successReason?: string | null;
  failureReason?: string | null;
  successReasonZh?: string | null;
  failureReasonZh?: string | null;
  visibleBlockers?: string[];
  visibleBlockersZh?: string[];
  frustration: number;
  confidence: number;
  timestamp: string;
}

export interface AgentRunResult {
  agentId: string;
  persona: AgentPersona;
  config: RunConfig;
  startedAt: string;
  finishedAt: string;
  completed: boolean;
  failed: boolean;
  finalPage: PageState;
  summary: string;
  steps: AgentStepRecord[];
}

export interface AgentStepContext {
  agentId: string;
  step: number;
  config: RunConfig;
  persona: AgentPersona;
  page: PageState;
  frustration: number;
  confidence: number;
  history: AgentStepRecord[];
}

export interface AgentHooks {
  observe?: (context: AgentStepContext) => Promise<PageState>;
  decide?: (context: AgentStepContext) => Promise<Decision>;
  act?: (context: AgentStepContext & { decision: Decision }) => Promise<ActionResult>;
}

export interface AgentDependencies {
  now?: () => Date;
  hooks?: AgentHooks;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

export interface AgentRunInput {
  agentId?: string;
  persona: AgentPersona;
  config: RunConfig;
}

export interface AgentRunner {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

export interface PersonaMixEntry {
  archetype: PersonaArchetype;
  weight: number;
}
