import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { env } from "./env";
import type { DemoScenarioDefinition } from "./scenarios";

const scenarioCompileSchema = z.object({
  name: z.string().min(1).max(120),
  siteLabel: z.string().min(1).max(80),
  description: z.string().min(1).max(220),
  successDefinition: z.string().min(1).max(220),
  recommendedMaxSteps: z.number().int().min(3).max(10),
  minimumMaxSteps: z.number().int().min(2).max(8),
  frames: z
    .array(
      z.object({
        id: z.string().min(1).max(32),
        label: z.string().min(1).max(80),
        url: z.string().min(1).max(220),
        targets: z.array(z.string().min(1).max(80)).min(2).max(6),
        errorBias: z.number().min(0.02).max(0.4),
        description: z.string().min(1).max(180),
      }),
    )
    .min(2)
    .max(5),
  aiHints: z.object({
    completionCues: z.array(z.string().min(1).max(120)).max(5).default([]),
    decoyCues: z.array(z.string().min(1).max(120)).max(5).default([]),
    preferredStrategies: z.array(z.string().min(1).max(120)).max(5).default([]),
  }),
});

type ParsedScenarioProfile = z.infer<typeof scenarioCompileSchema>;

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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function hostFromUrl(targetUrl: string) {
  return new URL(targetUrl).hostname;
}

function deriveSiteLabel(host: string) {
  return host
    .replace(/^www\./, "")
    .split(".")
    .slice(0, 2)
    .join(" ")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function fetchPageHints(targetUrl: string) {
  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "Chaos Swarm scenario compiler",
      },
      cache: "no-store",
    });

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim();
    return {
      title: title || null,
      finalUrl: response.url || targetUrl,
    };
  } catch {
    return {
      title: null,
      finalUrl: targetUrl,
    };
  }
}

function buildFallbackScenario(
  targetUrl: string,
  goal: string,
  inputSeeds: Record<string, string>,
  pageHints: Awaited<ReturnType<typeof fetchPageHints>>,
): DemoScenarioDefinition {
  const host = hostFromUrl(targetUrl);
  const siteLabel = deriveSiteLabel(host);
  const hostnamePath = new URL(pageHints.finalUrl).pathname;

  return {
    id: `custom-${slugify(`${host}-${goal}`)}`,
    name: `${siteLabel} goal probe`,
    siteLabel,
    targetUrl,
    domainAllowlist: [host],
    goal,
    description: `AI-compiled scenario for ${goal}`,
    successDefinition: `Treat the goal as complete only when the current page visibly proves that "${goal}" has been achieved.`,
    recommendedMaxSteps: 6,
    minimumMaxSteps: 4,
    inputSeeds,
    frames: [
      {
        id: "entry",
        label: "Entry surface",
        url: pageHints.finalUrl,
        targets: [pageHints.title || siteLabel, "navigation", "primary CTA"],
        errorBias: 0.08,
        description: "The first visible landing surface where the agent orients itself.",
      },
      {
        id: "goal-path",
        label: "Goal path",
        url: `${new URL(pageHints.finalUrl).origin}${hostnamePath}`,
        targets: ["primary action", "form", "search", "continue"],
        errorBias: 0.18,
        description: "The intermediate surface where the agent should make progress toward the stated goal.",
      },
      {
        id: "success-surface",
        label: "Success surface",
        url: pageHints.finalUrl,
        targets: ["confirmation", "result", "success state"],
        errorBias: 0.08,
        description: "The page state that would visibly confirm the goal.",
      },
    ],
    aiHints: {
      completionCues: [goal, "success message", "confirmation state"],
      decoyCues: ["footer links", "marketing surfaces", "secondary navigation"],
      preferredStrategies: ["follow the most direct visible path to the goal", "stop only when the page visibly confirms success"],
    },
  };
}

export async function compileScenarioProfile(input: {
  targetUrl: string;
  goal: string;
  inputSeeds?: Record<string, string>;
}) {
  const pageHints = await fetchPageHints(input.targetUrl);
  const fallback = buildFallbackScenario(input.targetUrl, input.goal, input.inputSeeds ?? {}, pageHints);
  const client = getClient();

  if (!client) {
    return fallback;
  }

  try {
    const host = hostFromUrl(input.targetUrl);
    const response = await client.responses.parse({
      model: env.agentModel,
      text: {
        format: zodTextFormat(scenarioCompileSchema, "chaos_swarm_scenario_profile"),
      },
      instructions:
        "You compile a reusable browser-testing scenario profile for a visual AI swarm. Given a starting URL, a goal, and light page hints, produce a compact scenario definition that will help autonomous agents navigate a real website. The stages should represent visible funnel states, not internal DOM states. The final stage must describe the success surface that visibly proves the goal is complete. Use the supplied URL domain only; do not invent external sites. Keep the output practical and concise.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(
                {
                  targetUrl: input.targetUrl,
                  goal: input.goal,
                  inputSeeds: input.inputSeeds ?? {},
                  pageHints,
                  derivedSiteLabel: deriveSiteLabel(host),
                },
                null,
                2,
              ),
            },
          ],
        },
      ],
      user: `chaos-swarm-scenario:${host}:${slugify(input.goal)}`,
    });

    const parsed = response.output_parsed as ParsedScenarioProfile | null;

    if (!parsed) {
      return fallback;
    }

    return {
      id: `custom-${slugify(`${host}-${input.goal}`)}`,
      name: parsed.name,
      siteLabel: parsed.siteLabel,
      targetUrl: input.targetUrl,
      domainAllowlist: [host],
      goal: input.goal,
      description: parsed.description,
      successDefinition: parsed.successDefinition,
      recommendedMaxSteps: parsed.recommendedMaxSteps,
      minimumMaxSteps: Math.min(parsed.minimumMaxSteps, parsed.recommendedMaxSteps),
      inputSeeds: input.inputSeeds ?? {},
      frames: parsed.frames,
      aiHints: parsed.aiHints,
    } satisfies DemoScenarioDefinition;
  } catch {
    return fallback;
  }
}
