import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ReadableReport, ReportDocument } from "@chaos-swarm/reporting";
import { env } from "./env";
import type { RunRecord } from "./types";

const localizedCopySchema = z.object({
  en: z.string().min(1).max(1200),
  zh: z.string().min(1).max(1200),
});

const readableReportSchema = z.object({
  overview: localizedCopySchema,
  metrics: z.array(
    z.object({
      title: localizedCopySchema,
      body: localizedCopySchema,
    }),
  ).max(6),
  findings: z.array(
    z.object({
      title: localizedCopySchema,
      body: localizedCopySchema,
    }),
  ).max(6),
  agentStories: z.array(
    z.object({
      agentId: z.string(),
      persona: z.string(),
      status: z.enum(["completed", "failed"]),
      summary: localizedCopySchema,
    }),
  ).max(6),
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

function buildUserTag(record: RunRecord) {
  return `chaos-swarm-readable:${record.id}`.slice(0, 64);
}

function compactRunContext(record: RunRecord) {
  return {
    scenario: record.scenarioName,
    goal: record.goal,
    targetUrl: record.targetUrl,
    status: record.status,
    agentCount: record.agentCount,
    strictVisualMode: record.strictVisualMode,
    summary: record.summary,
    stageSummary: record.stageSummary,
    personaSummary: record.personaSummary,
    executionQuality: record.report.executionQuality,
    efi: record.report.efi,
    failureClusters: record.report.failureClusters,
    topEvents: record.events.slice(-10).map((event) => ({
      agentId: event.agentId,
      persona: event.persona,
      title: event.title,
      rationale: event.rationale,
      detail: event.detail,
      action: event.actionCode,
      outcome: event.actionOk ? "succeeded" : "failed",
      stage: event.stageLabel,
      frustration: event.frustration,
      confidence: event.confidence,
      execution: event.executionAssistMode,
    })),
  };
}

export async function enhanceReadableReport(
  record: RunRecord,
): Promise<ReadableReport | null> {
  const client = getClient();

  if (!client) {
    return null;
  }

  try {
    const response = await client.responses.parse({
      model: env.agentModel,
      text: {
        format: zodTextFormat(readableReportSchema, "chaos_swarm_readable_report"),
      },
      instructions:
        "You rewrite UX telemetry into plain-language product analysis. Produce concise bilingual English and Simplified Chinese copy. Make the report easy for a non-technical founder to understand. Explain what happened, what matters, and whether the signal came from product friction, execution constraints, or a mixture of both. Do not invent facts outside the provided telemetry. Use direct, concrete wording. Keep titles short. In metric explanations, explicitly explain EFI, visual purity, and DOM assist rate in human terms. In findings, describe where agents got stuck or why they succeeded. In agent stories, summarize the journey of representative agents in one short paragraph each.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(compactRunContext(record), null, 2),
            },
          ],
        },
      ],
      user: buildUserTag(record),
    });

    return response.output_parsed ?? null;
  } catch {
    return null;
  }
}

export function applyReadableReport(
  report: ReportDocument,
  readable: ReadableReport | null,
): ReportDocument {
  if (!readable) {
    return report;
  }

  return {
    ...report,
    readable,
  };
}
