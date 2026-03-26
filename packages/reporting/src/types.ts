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
  };
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
