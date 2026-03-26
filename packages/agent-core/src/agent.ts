import {
  type ActionResult,
  type AgentDependencies,
  type AgentPersona,
  type AgentRunInput,
  type AgentRunResult,
  type AgentRunner,
  type AgentStepContext,
  type AgentStepRecord,
  type Decision,
  type LoadState,
  type PageState,
  type PersonaMixEntry,
  type RunConfig,
} from "./types";

const DEFAULT_PERSONAS: AgentPersona[] = [
  {
    archetype: "Speedrunner",
    skillLevel: 0.92,
    patience: 0.25,
    attentionBias: 0.35,
    readingSpeed: 0.9,
    rageThreshold: 0.68,
  },
  {
    archetype: "Novice",
    skillLevel: 0.28,
    patience: 0.82,
    attentionBias: 0.78,
    readingSpeed: 0.42,
    rageThreshold: 0.84,
  },
  {
    archetype: "ChaosAgent",
    skillLevel: 0.54,
    patience: 0.18,
    attentionBias: 0.22,
    readingSpeed: 0.61,
    rageThreshold: 0.41,
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function makeId(prefix: string, seed: string): string {
  return `${prefix}-${hashString(seed).toString(36)}`;
}

function defaultNow(): Date {
  return new Date();
}

function initialPage(config: RunConfig): PageState {
  return {
    url: config.targetUrl,
    title: undefined,
    screenshot: undefined,
    visibleTargets: [],
    loadState: "loading",
    errorFlags: [],
  };
}

function keywordScore(goal: string, candidate: string): number {
  const goalTokens = goal.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const candidateTokens = candidate.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (goalTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }
  const overlap = candidateTokens.filter((token) => goalTokens.includes(token)).length;
  return overlap / Math.max(goalTokens.length, candidateTokens.length);
}

function targetForGoal(goal: string, targets: string[]): string | undefined {
  let bestTarget: string | undefined;
  let bestScore = 0;
  for (const target of targets) {
    const score = keywordScore(goal, target);
    if (score > bestScore) {
      bestScore = score;
      bestTarget = target;
    }
  }
  return bestTarget ?? targets[0];
}

function summarizePage(page: PageState, step: number, frustration: number, persona: AgentPersona): string {
  const targetSummary = page.visibleTargets.length > 0
    ? page.visibleTargets.slice(0, 4).join(", ")
    : "no obvious targets";
  return [
    `step ${step}`,
    `${page.loadState} page at ${page.url}`,
    `targets: ${targetSummary}`,
    `frustration=${frustration.toFixed(2)}`,
    `persona=${persona.archetype}`,
  ].join(" | ");
}

function evolvePage(page: PageState, decision: Decision, config: RunConfig, persona: AgentPersona, step: number): PageState {
  const nextLoadState: LoadState =
    decision.kind === "wait"
      ? step === 0
        ? "loading"
        : "interactive"
      : decision.kind === "stop"
        ? page.loadState
        : step >= Math.max(2, Math.min(config.maxSteps - 1, 4))
          ? "complete"
          : "interactive";

  const nextTargets =
    nextLoadState === "complete"
      ? []
      : step === 0
        ? [config.goal, "primary action", "search", "cart"]
        : persona.archetype === "Novice"
          ? [config.goal, "help", "learn more", "continue"]
          : [config.goal, "primary action", "checkout", "continue"];

  const nextErrors =
    decision.kind === "retry"
      ? page.errorFlags.filter((flag) => flag !== "temporary timeout")
      : page.errorFlags.length > 0 && step > 1 && persona.archetype === "ChaosAgent"
        ? [...page.errorFlags, "rage click storm"]
        : [];

  return {
    ...page,
    loadState: nextLoadState,
    visibleTargets: nextTargets,
    errorFlags: nextErrors,
    title: page.title ?? config.goal,
  };
}

function buildDecision(context: AgentStepContext): Decision {
  const { page, persona, config, frustration, step } = context;

  if (page.errorFlags.length > 0 && frustration >= persona.rageThreshold) {
    return {
      kind: "escalate",
      rationale: "frustration exceeded tolerance after error signals",
      target: page.errorFlags[0],
    };
  }

  if (page.loadState === "loading") {
    return {
      kind: "wait",
      rationale: "page is still loading and should settle before interaction",
    };
  }

  if (page.loadState === "error") {
    return {
      kind: "retry",
      rationale: "page reported an error and needs recovery",
      target: targetForGoal(config.goal, page.visibleTargets),
    };
  }

  if (page.loadState === "complete") {
    return {
      kind: "stop",
      rationale: "goal appears complete and no additional friction is expected",
    };
  }

  const target = targetForGoal(config.goal, page.visibleTargets);
  if (target && persona.skillLevel >= 0.6) {
    return {
      kind: "click",
      rationale: "high skill persona can act on the most relevant visible target",
      target,
    };
  }

  if (persona.archetype === "Novice" && step < 2) {
    return {
      kind: "scroll",
      rationale: "novice persona is still scanning the page structure",
    };
  }

  if (frustration > persona.rageThreshold - 0.1) {
    return {
      kind: "retry",
      rationale: "frustration is rising and a redundant recovery attempt is warranted",
      target,
    };
  }

  return {
    kind: "type",
    rationale: "default path is to continue making progress with a focused input action",
    target,
    value: config.goal,
  };
}

function buildAction(context: AgentStepContext & { decision: Decision }): ActionResult {
  const { decision, page, persona, step } = context;

  if (decision.kind === "stop") {
    return {
      kind: "stop",
      ok: true,
      details: "agent stopped after reaching a complete state",
      nextPage: page,
    };
  }

  if (decision.kind === "escalate") {
    return {
      kind: "escalate",
      ok: false,
      details: "agent escalated because the page became too brittle for the current persona",
      nextPage: {
        ...page,
        loadState: "error",
        errorFlags: [...page.errorFlags, "escalated"],
      },
    };
  }

  if (decision.kind === "wait") {
    return {
      kind: "wait",
      ok: true,
      details: step === 0 ? "waiting for initial render" : "waiting for the page to stabilize",
      nextPage: {
        ...page,
        loadState: "interactive",
      },
    };
  }

  if (decision.kind === "retry") {
    return {
      kind: "retry",
      ok: true,
      details: "retry path attempted with a softer recovery action",
      nextPage: {
        ...page,
        loadState: "interactive",
        errorFlags: [],
      },
    };
  }

  if (decision.kind === "scroll") {
    return {
      kind: "scroll",
      ok: true,
      details: "scrolling to widen the current visual search window",
      nextPage: {
        ...page,
        loadState: "interactive",
      },
    };
  }

  if (decision.kind === "type") {
    return {
      kind: "type",
      ok: true,
      details: `typed "${decision.value ?? ""}" into the active control`,
      nextPage: {
        ...page,
        loadState: "interactive",
      },
    };
  }

  return {
    kind: "click",
    ok: true,
    details: `clicked ${decision.target ?? "the best visible target"}`,
    nextPage: {
      ...page,
      loadState: step >= 2 ? "complete" : "interactive",
      visibleTargets: step >= 2 ? [] : page.visibleTargets,
    },
  };
}

function updateEmotion(
  current: { frustration: number; confidence: number },
  page: PageState,
  decision: Decision,
  action: ActionResult,
  persona: AgentPersona,
): { frustration: number; confidence: number } {
  let frustration = current.frustration;
  let confidence = current.confidence;

  if (page.loadState === "loading") {
    frustration += 0.08;
    confidence -= 0.03;
  }

  if (page.errorFlags.length > 0) {
    frustration += 0.2;
    confidence -= 0.12;
  }

  if (decision.kind === "wait") {
    frustration += 0.03;
    confidence -= 0.01;
  }

  if (decision.kind === "retry") {
    frustration += 0.07;
    confidence -= 0.04;
  }

  if (action.ok) {
    frustration -= 0.05 * persona.patience;
    confidence += 0.06 * persona.skillLevel;
  } else {
    frustration += 0.12;
    confidence -= 0.12;
  }

  if (decision.kind === "escalate") {
    frustration += 0.15;
    confidence -= 0.15;
  }

  return {
    frustration: clamp(frustration, 0, 1),
    confidence: clamp(confidence, 0, 1),
  };
}

function goalReached(page: PageState, config: RunConfig): boolean {
  if (page.loadState === "complete") {
    return true;
  }

  const goalKeyword = config.goal.toLowerCase();
  return page.visibleTargets.some((target) => target.toLowerCase().includes(goalKeyword));
}

function buildSummary(input: AgentRunInput, steps: AgentStepRecord[], completed: boolean, failed: boolean): string {
  const lastStep = steps.at(-1);
  const mode = completed ? "completed" : failed ? "failed" : "in progress";
  const lastDecision = lastStep?.decision.kind ?? "none";
  return `${input.persona.archetype} agent ${mode} ${steps.length} steps for "${input.config.goal}" with final decision ${lastDecision}`;
}

function defaultObserve(context: AgentStepContext): PageState {
  const { config, step, history } = context;
  if (step === 0) {
    return initialPage(config);
  }

  const previous = history.at(-1)?.action.nextPage ?? initialPage(config);
  if (step === 1) {
    return {
      ...previous,
      loadState: "interactive",
      visibleTargets: [config.goal, "primary action", "search", "cart"],
    };
  }

  if (step >= 2 && context.frustration > context.persona.rageThreshold) {
    return {
      ...previous,
      loadState: "error",
      errorFlags: [...previous.errorFlags, "temporary timeout"],
    };
  }

  return {
    ...previous,
    loadState: goalReached(previous, config) ? "complete" : "interactive",
  };
}

export function buildDefaultPersonaMix(): PersonaMixEntry[] {
  return DEFAULT_PERSONAS.map((persona) => ({
    archetype: persona.archetype,
    weight: 1,
  }));
}

export function defaultPersonaSet(): AgentPersona[] {
  return DEFAULT_PERSONAS.map((persona) => ({ ...persona }));
}

export function createAgent(dependencies: AgentDependencies = {}): AgentRunner {
  return {
    async run(input: AgentRunInput): Promise<AgentRunResult> {
      return runAgent(input, dependencies);
    },
  };
}

export async function runAgent(input: AgentRunInput, dependencies: AgentDependencies = {}): Promise<AgentRunResult> {
  const now = dependencies.now ?? defaultNow;
  const hooks = dependencies.hooks ?? {};
  const logger = dependencies.logger;
  const agentId = input.agentId ?? makeId("agent", `${input.config.seed ?? input.config.targetUrl}:${input.persona.archetype}`);
  const startedAt = now().toISOString();
  const history: AgentStepRecord[] = [];
  let page = initialPage(input.config);
  let frustration = 0.14;
  let confidence = 0.82;

  for (let step = 0; step < input.config.maxSteps; step += 1) {
    const context: AgentStepContext = {
      agentId,
      step,
      config: input.config,
      persona: input.persona,
      page,
      frustration,
      confidence,
      history,
    };

    page = hooks.observe ? await hooks.observe(context) : defaultObserve(context);
    const observation = {
      step,
      summary: summarizePage(page, step, frustration, input.persona),
      page,
    };
    const decision = hooks.decide ? await hooks.decide({ ...context, page }) : buildDecision({ ...context, page });
    const action = hooks.act ? await hooks.act({ ...context, page, decision }) : buildAction({ ...context, page, decision });

    const emotion = updateEmotion({ frustration, confidence }, page, decision, action, input.persona);
    frustration = emotion.frustration;
    confidence = emotion.confidence;

    const record: AgentStepRecord = {
      step,
      observation,
      decision,
      action,
      frustration,
      confidence,
      timestamp: now().toISOString(),
    };
    history.push(record);

    logger?.("agent step executed", {
      agentId,
      step,
      decision: decision.kind,
      action: action.kind,
      frustration,
      confidence,
    });

    if (action.nextPage) {
      page = action.nextPage;
    }

    if (decision.kind === "stop" || decision.kind === "escalate") {
      break;
    }

    if (goalReached(page, input.config)) {
      page = {
        ...page,
        loadState: "complete",
        visibleTargets: [],
      };
      break;
    }
  }

  const finishedAt = now().toISOString();
  const completed = goalReached(page, input.config);
  const failed = !completed && history.length >= input.config.maxSteps;

  return {
    agentId,
    persona: input.persona,
    config: input.config,
    startedAt,
    finishedAt,
    completed,
    failed,
    finalPage: page,
    summary: buildSummary(input, history, completed, failed),
    steps: history,
  };
}
