import { renderJson, renderMarkdown } from "@chaos-swarm/reporting";
import type { RunRecord } from "./types";

export interface PortableRunReport {
  version: string;
  exportedAt: string;
  run: {
    id: string;
    scenarioId: RunRecord["scenarioId"];
    scenarioName: string;
    scenarioProfile?: RunRecord["scenarioProfile"];
    status: RunRecord["status"];
    createdAt: string;
    completedAt: string | null;
    targetUrl: string;
    goal: string;
    agentCount: number;
    strictVisualMode: boolean;
    storageMode: RunRecord["storageMode"];
    executionMode: RunRecord["executionMode"];
    warnings: string[];
    summary: RunRecord["summary"];
    personaSummary: RunRecord["personaSummary"];
    stageSummary: RunRecord["stageSummary"];
  };
  report: RunRecord["report"];
  events: RunRecord["events"];
  agentRuns: RunRecord["agentRuns"];
}

function isoNow() {
  return new Date().toISOString();
}

function formatPercent(value: number) {
  return `${value}%`;
}

function eventLine(event: RunRecord["events"][number]) {
  return [
    `- [${event.timestamp}] ${event.agentId}`,
    `title=${event.title}`,
    `titleZh=${event.titleZh ?? "n/a"}`,
    `detail=${event.detail}`,
    `detailZh=${event.detailZh ?? "n/a"}`,
    `why=${event.rationale}`,
    `whyZh=${event.rationaleZh ?? "n/a"}`,
    `stage=${event.stageLabel ?? "unclassified"}`,
    `frustration=${event.frustration}%`,
    `confidence=${event.confidence}%`,
    `execution=${event.executionAssistMode}`,
    `load=${event.loadState}`,
    `url=${event.url}`,
    `raw=${event.actionCode}`,
  ].join(" | ");
}

function stepLine(step: RunRecord["agentRuns"][number]["steps"][number]) {
  return [
    `- step ${step.step}`,
    `title=${step.readableTitle ?? "n/a"}`,
    `titleZh=${step.readableTitleZh ?? "n/a"}`,
    `detail=${step.readableDetail ?? "n/a"}`,
    `detailZh=${step.readableDetailZh ?? "n/a"}`,
    `why=${step.decision.rationale}`,
    `whyZh=${step.decision.rationaleZh ?? "n/a"}`,
    `decision=${step.decision.kind}`,
    `action=${step.action.kind}`,
    `ok=${step.action.ok}`,
    `frustration=${formatPercent(Math.round(step.frustration * 10000) / 100)}`,
    `confidence=${formatPercent(Math.round(step.confidence * 10000) / 100)}`,
    `stage=${step.stageLabel ?? step.stageId ?? "unclassified"}`,
    `goalStatus=${step.goalStatus ?? "unknown"}`,
    `execution=${step.action.execution?.mode ?? "none"}`,
    `url=${step.observation.page.url}`,
    `summary=${step.observation.summary}`,
  ].join(" | ");
}

export function buildPortableRunReport(record: RunRecord): PortableRunReport {
  return {
    version: "chaos-swarm-report/v1",
    exportedAt: isoNow(),
    run: {
      id: record.id,
      scenarioId: record.scenarioId,
      scenarioName: record.scenarioName,
      scenarioProfile: record.scenarioProfile,
      status: record.status,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      targetUrl: record.targetUrl,
      goal: record.goal,
      agentCount: record.agentCount,
      strictVisualMode: record.strictVisualMode,
      storageMode: record.storageMode,
      executionMode: record.executionMode,
      warnings: record.warnings,
      summary: record.summary,
      personaSummary: record.personaSummary,
      stageSummary: record.stageSummary,
    },
    report: record.report,
    events: record.events,
    agentRuns: record.agentRuns,
  };
}

export function renderPortableRunReportJson(record: RunRecord) {
  return JSON.stringify(buildPortableRunReport(record), null, 2);
}

export function renderPortableRunReportMarkdown(record: RunRecord) {
  const portable = buildPortableRunReport(record);
  const coreMarkdown = renderMarkdown(record.report);
  const readable = record.report.readable;

  const lines = [
    "# Chaos Swarm Full Report",
    "",
    "Use this export for follow-up analysis or internal sharing.",
    "",
    "## Run Metadata",
    `- Run ID: ${portable.run.id}`,
    `- Scenario: ${portable.run.scenarioName} (${portable.run.scenarioId})`,
    `- Status: ${portable.run.status}`,
    `- Created At: ${portable.run.createdAt}`,
    `- Completed At: ${portable.run.completedAt ?? "pending"}`,
    `- Target URL: ${portable.run.targetUrl}`,
    `- Goal: ${portable.run.goal}`,
    `- Agent Count: ${portable.run.agentCount}`,
    `- Strict Visual Mode: ${portable.run.strictVisualMode ? "on" : "off"}`,
    `- Storage Mode: ${portable.run.storageMode}`,
    `- Execution Mode: ${portable.run.executionMode}`,
    "",
    "## Runtime Summary",
    `- Completed Agents: ${portable.run.summary.completed}`,
    `- Failed Agents: ${portable.run.summary.failed}`,
    `- Average Steps: ${portable.run.summary.averageSteps}`,
    `- Peak Frustration: ${portable.run.summary.peakFrustration}%`,
    `- Visual Purity: ${portable.report.executionQuality.visualPurity}%`,
    `- DOM Assist Rate: ${portable.report.executionQuality.domAssistRate}%`,
    "",
    "## Reader Summary",
    "",
    "### Overview",
    `- EN: ${readable.overview.en}`,
    `- ZH: ${readable.overview.zh}`,
    "",
    "### What To Conclude",
    ...(readable.findings[0]
      ? [`- EN: ${readable.findings[0].body.en}`, `- ZH: ${readable.findings[0].body.zh}`]
      : ["- No model-authored conclusion available."]),
    "",
    "### Metric Explanations",
    ...(readable.metrics.length > 0
      ? readable.metrics.flatMap((metric) => [
          `- ${metric.title.en}`,
          `  - EN: ${metric.body.en}`,
          `  - ZH: ${metric.body.zh}`,
        ])
      : ["- No reader metric explanations available."]),
    "",
    "### Key Findings",
    ...(readable.findings.length > 0
      ? readable.findings.flatMap((finding) => [
          `- ${finding.title.en}`,
          `  - EN: ${finding.body.en}`,
          `  - ZH: ${finding.body.zh}`,
        ])
      : ["- No reader findings available."]),
    "",
    "### Representative Agent Stories",
    ...(readable.agentStories.length > 0
      ? readable.agentStories.flatMap((story) => [
          `- ${story.agentId} (${story.persona}, ${story.status})`,
          `  - EN: ${story.summary.en}`,
          `  - ZH: ${story.summary.zh}`,
        ])
      : ["- No agent stories available."]),
    "",
    "## Runtime Warnings",
    ...(portable.run.warnings.length > 0 ? portable.run.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
    "## Persona Summary",
    ...(portable.run.personaSummary.length > 0
      ? portable.run.personaSummary.map(
          (persona) =>
            `- ${persona.archetype}: total=${persona.total}, completed=${persona.completed}, failed=${persona.failed}`,
        )
      : ["- No persona summary available."]),
    "",
    "## Stage Summary",
    ...(portable.run.stageSummary.length > 0
      ? portable.run.stageSummary.map(
          (stage) => `- ${stage.label}: reached=${stage.reached}, stuck=${stage.stuck}`,
        )
      : ["- No stage summary available."]),
    "",
    "## Core Report",
    coreMarkdown,
    "",
    "## Event Timeline",
    ...(portable.events.length > 0 ? portable.events.map(eventLine) : ["- No events recorded."]),
    "",
    "## Agent Appendices",
    ...portable.agentRuns.flatMap((run) => [
      `### ${run.agentId}`,
      `- Persona: ${run.persona.archetype}`,
      `- Started At: ${run.startedAt}`,
      `- Finished At: ${run.finishedAt}`,
      `- Completed: ${run.completed}`,
      `- Failed: ${run.failed}`,
      `- Final URL: ${run.finalPage.url}`,
      `- Final Title: ${run.finalPage.title ?? "n/a"}`,
      `- Final Load State: ${run.finalPage.loadState}`,
      `- Final Errors: ${run.finalPage.errorFlags.length > 0 ? run.finalPage.errorFlags.join("; ") : "None"}`,
      `- Summary: ${run.summary}`,
      "",
      "#### Step Log",
      ...(run.steps.length > 0 ? run.steps.map(stepLine) : ["- No steps recorded."]),
      "",
    ]),
    "## Machine Readable Report JSON",
    "```json",
    renderJson(record.report),
    "```",
  ];

  return lines.join("\n").trim();
}
