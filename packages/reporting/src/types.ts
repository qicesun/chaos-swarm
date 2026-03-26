export interface EfiComponent {
  name: string;
  weight: number;
  score: number;
  contribution: number;
}

export interface EfiBreakdown {
  score: number;
  components: EfiComponent[];
}

export interface FunnelStage {
  name: string;
  total: number;
  completed: number;
  dropped: number;
}

export interface FailureCluster {
  signature: string;
  label: string;
  count: number;
  personas: string[];
  reasons: string[];
}

export interface HeatmapPoint {
  step: number;
  frustration: number;
  confidence: number;
  note: string;
}

export interface ReportSection {
  heading: string;
  body: string;
}

export interface LocalizedReportCopy {
  en: string;
  zh: string;
}

export interface ReadableInsight {
  title: LocalizedReportCopy;
  body: LocalizedReportCopy;
}

export interface AgentStory {
  agentId: string;
  persona: string;
  status: "completed" | "failed";
  summary: LocalizedReportCopy;
}

export interface ReadableReport {
  overview: LocalizedReportCopy;
  metrics: ReadableInsight[];
  findings: ReadableInsight[];
  agentStories: AgentStory[];
}

export interface ExecutionQuality {
  strictVisualMode: boolean;
  totalInteractionActions: number;
  visualOnlyActions: number;
  domAssistedActions: number;
  domOnlyActions: number;
  visualPurity: number;
  domAssistRate: number;
}

export interface ReportDocument {
  title: string;
  summary: string;
  sections: ReportSection[];
  generatedAt: string;
  efi: EfiBreakdown;
  funnel: FunnelStage[];
  failureClusters: FailureCluster[];
  highlightReel: string[];
  heatmap: HeatmapPoint[];
  executionQuality: ExecutionQuality;
  readable: ReadableReport;
  metadata: Record<string, unknown>;
}

export interface AgentPersonaLike {
  archetype: string;
  skillLevel: number;
  patience: number;
  attentionBias: number;
  readingSpeed: number;
  rageThreshold: number;
}

export interface PageStateLike {
  url: string;
  title?: string;
  visibleTargets: string[];
  loadState: string;
  errorFlags: string[];
}

export interface AgentStepRecordLike {
  step: number;
  observation: {
    summary: string;
    page: PageStateLike;
  };
  decision: {
    kind: string;
    rationale: string;
    target?: string;
    value?: string;
  };
  action: {
    kind: string;
    ok: boolean;
    details: string;
    nextPage?: PageStateLike;
    execution?: {
      strictVisualMode: boolean;
      mode: "visual_only" | "visual_with_dom_assist" | "dom_only" | "none";
      domAssisted: boolean;
      visualAttempted: boolean;
      reason?: string;
    };
  };
  stageId?: string | null;
  stageLabel?: string | null;
  goalStatus?: "not_started" | "in_progress" | "blocked" | "complete";
  readableTitle?: string | null;
  readableDetail?: string | null;
  successReason?: string | null;
  failureReason?: string | null;
  visibleBlockers?: string[];
  frustration: number;
  confidence: number;
  timestamp: string;
}

export interface AgentRunResultLike {
  agentId: string;
  persona: AgentPersonaLike;
  config: {
    targetUrl: string;
    goal: string;
    maxSteps: number;
    strictVisualMode?: boolean;
  };
  startedAt: string;
  finishedAt: string;
  completed: boolean;
  failed: boolean;
  finalPage: PageStateLike;
  summary: string;
  steps: AgentStepRecordLike[];
}

export interface ReportInput {
  targetUrl: string;
  goal: string;
  agentRuns: AgentRunResultLike[];
  generatedAt?: string;
}
