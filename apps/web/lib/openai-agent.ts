import type { AgentPersona } from "@chaos-swarm/agent-core";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { env } from "./env";

export interface ObservedCandidate {
  id: string;
  text: string;
  tagName: string;
  inputType?: string;
  role?: string;
  placeholder?: string;
  ariaLabel?: string;
  href?: string;
  surfaceLabel?: string;
  viewportState?: "visible" | "below_fold" | "above_fold";
  disabled: boolean;
  selectOptions: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AiObservationInput {
  screenshotDataUrl: string;
  url: string;
  title?: string;
  loadState: string;
  visibleTargets: string[];
  errorFlags: string[];
  candidates: ObservedCandidate[];
}

export interface ScenarioDecisionContext {
  scenarioName: string;
  goal: string;
  persona: AgentPersona;
  playbook: {
    mission: string;
    allowedValues: Record<string, string>;
    completionHints: string[];
    safetyRules: string[];
  };
  step: number;
  maxSteps: number;
  recentHistory: Array<{
    action: string;
    detail: string;
    frustration: number;
    confidence: number;
  }>;
  validatorNotes?: string[];
  observation: AiObservationInput;
}

const decisionSchema = z.object({
  pageAssessment: z.string().min(1).max(280),
  goalStatus: z.enum(["not_started", "in_progress", "blocked", "complete"]),
  nextAction: z.object({
    kind: z.enum(["click", "fill_form", "scroll", "wait", "retry", "stop", "escalate"]),
    targetId: z.string().nullable(),
    targetText: z.string().nullable(),
    rationale: z.string().min(1).max(320),
    confidence: z.number().min(0).max(1),
    inputText: z.string().nullable(),
    scrollDirection: z.enum(["up", "down"]).nullable(),
    fields: z
      .array(
        z.object({
          targetId: z.string(),
          value: z.string().max(200),
        }),
      )
      .max(16)
      .nullable(),
  }),
});

export type ParsedAgentDecision = z.infer<typeof decisionSchema>;

let cachedClient: OpenAI | null = null;

function getClient() {
  if (!env.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required for the autonomous AI agent runtime.");
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: env.openAiApiKey,
    });
  }

  return cachedClient;
}

function summarizePersona(persona: AgentPersona) {
  return {
    archetype: persona.archetype,
    skillLevel: persona.skillLevel,
    patience: persona.patience,
    attentionBias: persona.attentionBias,
    readingSpeed: persona.readingSpeed,
    rageThreshold: persona.rageThreshold,
  };
}

export async function decideNextAction(context: ScenarioDecisionContext) {
  const client = getClient();
  const response = await client.responses.parse({
    model: env.agentModel,
    text: {
      format: zodTextFormat(decisionSchema, "chaos_swarm_next_action"),
    },
    instructions:
      "You are the decision engine for a browser-testing AI agent. Operate like a careful human looking at the screenshot, not like a DOM scraper. The candidate list is a screen-space overlay of nearby controls: each candidate has a stable id, label, role, screen box, and a viewportState that tells you whether it is visible now, above the fold, or below the fold. Choose the single safest next action to advance the goal. Ground every action in the provided candidate list, and use exact candidate ids like c1, c2, c3 in targetId/fields whenever possible. Use fill_form when multiple visible fields on the same surface should be completed together, especially on dense registration or validation forms. Never invent controls, credentials, or pages outside the playbook. If multiple forms or panels are visible, use the screenshot plus candidate surface labels and positions to choose the surface that matches the mission; ignore unrelated sidebars, login widgets, or auxiliary forms. If validator notes are present, treat them as hard constraints on your next move. If the exact control named in the goal is not visible yet but appears below_fold or above_fold in the candidate list, prefer scrolling toward it instead of clicking a merely similar control. If recent history shows that the same click was attempted on the same page and the page did not materially change, do not repeat the same click again; choose a different safe action such as scroll, wait, or a more specific navigation control. If recent history shows that a field was already filled and the page has not changed, do not fill it again; prefer the next visible submit, search, continue, register, login, or navigation control. If recent history shows a successful add-to-cart or the page now shows Remove, Shopping Cart, View Cart, Cart, or similar in-cart state, do not click another add-to-cart button; move toward the cart or checkout boundary instead. A filled but unsubmitted form is not a completed task. Only choose stop when the current page itself satisfies the completion hints right now. Prefer progress, but escalate if the page is blocked, broken, or no safe move exists. Return null for any targetId, targetText, inputText, scrollDirection, or fields entry that does not apply; do not omit keys.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(
              {
                scenario: context.scenarioName,
                goal: context.goal,
                persona: summarizePersona(context.persona),
                mission: context.playbook.mission,
                allowedValues: context.playbook.allowedValues,
                completionHints: context.playbook.completionHints,
                safetyRules: context.playbook.safetyRules,
                validatorNotes: context.validatorNotes ?? [],
                step: context.step,
                maxSteps: context.maxSteps,
                page: {
                  url: context.observation.url,
                  title: context.observation.title,
                  loadState: context.observation.loadState,
                  visibleTargets: context.observation.visibleTargets,
                  errorFlags: context.observation.errorFlags,
                },
                candidates: context.observation.candidates,
                recentHistory: context.recentHistory,
              },
              null,
              2,
            ),
          },
          {
            type: "input_image",
            image_url: context.observation.screenshotDataUrl,
            detail: "low",
          },
        ],
      },
    ],
    user: `chaos-swarm:${context.scenarioName}:${context.step}`,
  });

  if (!response.output_parsed) {
    throw new Error("Model decision parsing failed: no structured action was returned.");
  }

  return {
    decision: response.output_parsed,
    usage: response.usage,
    responseId: response.id,
  };
}
