import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { AgentPersona } from "@chaos-swarm/agent-core";
import { env } from "./env";
import type { DemoScenarioDefinition } from "./scenarios";

export interface ScenarioPlaybook {
  mission: string;
  allowedValues: Record<string, string>;
  completionHints: string[];
  safetyRules: string[];
}

const playbookSchema = z.object({
  mission: z.string().min(1).max(260),
  completionHints: z.array(z.string().min(1).max(220)).min(2).max(5),
  safetyRules: z.array(z.string().min(1).max(220)).min(3).max(6),
});

let cachedClient: OpenAI | null = null;

function getClient() {
  if (!env.openAiApiKey) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: env.openAiApiKey,
    });
  }

  return cachedClient;
}

function buildSeedSuffix(seed: string) {
  return seed.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase() || "agent001";
}

function buildUserTag(scenario: DemoScenarioDefinition, persona: AgentPersona, seed: string) {
  const compactSeed = seed.replace(/[^a-z0-9]/gi, "").slice(-10).toLowerCase();
  return `playbook:${scenario.id.slice(0, 18)}:${persona.archetype.toLowerCase()}:${compactSeed}`.slice(0, 64);
}

function personaDirective(persona: AgentPersona) {
  if (persona.archetype === "Speedrunner") {
    return "Move directly toward the goal, prefer the shortest visible path, and avoid unnecessary scanning.";
  }

  if (persona.archetype === "Novice") {
    return "Read the page more carefully, tolerate a little ambiguity, and scan before committing.";
  }

  return "You are impatient, react strongly to friction, and prefer forceful progress over careful reading.";
}

function resolveInputSeeds(
  scenario: DemoScenarioDefinition,
  seed: string,
): Record<string, string> {
  const suffix = buildSeedSuffix(seed);
  return Object.fromEntries(
    Object.entries(scenario.inputSeeds).map(([key, value]) => [
      key,
      value.replaceAll("{suffix}", suffix).replaceAll("{suffix8}", suffix.padStart(8, "0").slice(0, 8)),
    ]),
  );
}

function buildFallbackPlaybook(
  scenario: DemoScenarioDefinition,
  persona: AgentPersona,
  allowedValues: Record<string, string>,
): ScenarioPlaybook {
  const finalFrame = scenario.frames.at(-1);
  const preferredStrategies = scenario.aiHints?.preferredStrategies ?? [];
  const completionCues = scenario.aiHints?.completionCues ?? [];
  const decoyCues = scenario.aiHints?.decoyCues ?? [];

  return {
    mission: `${personaDirective(persona)} ${scenario.goal}`,
    allowedValues,
    completionHints: [
      `Treat the task as complete only when the page clearly matches the success surface for "${finalFrame?.label ?? scenario.name}". ${scenario.successDefinition}`,
      `Use the scenario goal and visible targets together; do not stop on a partially completed page.`,
      ...completionCues.slice(0, 2).map((cue) => `Visible completion cue: ${cue}.`),
    ],
    safetyRules: [
      "Only choose actions that can be grounded in the provided candidate list.",
      "Do not invent hidden controls, extra pages, or credentials outside the provided allowed values.",
      "If the goal is already satisfied on the current page, stop instead of exploring unrelated UI.",
      "If the page is clearly blocked or no safe progress is possible, escalate instead of guessing.",
      ...preferredStrategies.slice(0, 2).map((strategy) => `Preferred strategy: ${strategy}.`),
      ...decoyCues.slice(0, 2).map((cue) => `Ignore decoy surface: ${cue}.`),
    ],
  };
}

export async function buildScenarioPlaybook(
  scenario: DemoScenarioDefinition,
  persona: AgentPersona,
  seed: string,
): Promise<ScenarioPlaybook> {
  const allowedValues = resolveInputSeeds(scenario, seed);
  const fallback = buildFallbackPlaybook(scenario, persona, allowedValues);
  const client = getClient();

  if (!client) {
    return fallback;
  }

  try {
    const response = await client.responses.parse({
      model: env.agentModel,
      text: {
        format: zodTextFormat(playbookSchema, "chaos_swarm_playbook"),
      },
      instructions:
        "You compile a concise operating playbook for a visual browser-testing AI agent. Produce a mission, completion hints, and safety rules from the scenario definition. Do not invent credentials, URLs, or hidden steps beyond the supplied scenario. Optimize for a screen-driven agent acting on a real site. Completion hints should describe what visible evidence means the goal is truly done. Safety rules should prevent common navigation mistakes, false positives, and irrelevant UI exploration.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(
                {
                  scenario: {
                    id: scenario.id,
                    name: scenario.name,
                    siteLabel: scenario.siteLabel,
                    targetUrl: scenario.targetUrl,
                    domainAllowlist: scenario.domainAllowlist,
                    goal: scenario.goal,
                    description: scenario.description,
                    successDefinition: scenario.successDefinition,
                    frames: scenario.frames,
                    providedValues: allowedValues,
                    aiHints: scenario.aiHints ?? null,
                  },
                  persona: {
                    archetype: persona.archetype,
                    skillLevel: persona.skillLevel,
                    patience: persona.patience,
                    attentionBias: persona.attentionBias,
                    readingSpeed: persona.readingSpeed,
                    rageThreshold: persona.rageThreshold,
                    directive: personaDirective(persona),
                  },
                },
                null,
                2,
              ),
            },
          ],
        },
      ],
      user: buildUserTag(scenario, persona, seed),
    });

    if (!response.output_parsed) {
      return fallback;
    }

    return {
      mission: response.output_parsed.mission,
      completionHints: response.output_parsed.completionHints,
      safetyRules: response.output_parsed.safetyRules,
      allowedValues,
    };
  } catch {
    return fallback;
  }
}
