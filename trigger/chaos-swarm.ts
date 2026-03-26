import { createAgent, defaultPersonaSet, type AgentRunResult } from "@chaos-swarm/agent-core";
import { buildReport } from "@chaos-swarm/reporting";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { agentQueue, swarmQueue } from "./queues";

const runSchema = z.object({
  runId: z.string(),
  targetUrl: z.string().url(),
  goal: z.string().min(3),
  agentCount: z.number().int().min(1).max(32),
  maxSteps: z.number().int().min(2).max(12).default(5),
});

const agentStepSchema = runSchema.extend({
  agentIndex: z.number().int().min(0),
});

export const runAgentStep = schemaTask({
  id: "chaos-swarm-run-agent-step",
  queue: agentQueue,
  schema: agentStepSchema,
  run: async (payload) => {
    const personas = defaultPersonaSet();
    const persona = personas[payload.agentIndex % personas.length];
    const agent = createAgent();
    const result = await agent.run({
      agentId: `${persona.archetype.toLowerCase()}-${String(payload.agentIndex + 1).padStart(2, "0")}`,
      persona,
      config: {
        targetUrl: payload.targetUrl,
        goal: payload.goal,
        maxSteps: payload.maxSteps,
        seed: `${payload.runId}-${payload.agentIndex}`,
        demoMode: true,
      },
    });

    logger.info("Chaos Swarm agent simulated", {
      runId: payload.runId,
      agentId: result.agentId,
      completed: result.completed,
      failed: result.failed,
    });

    return result;
  },
});

export const finalizeReport = schemaTask({
  id: "chaos-swarm-finalize-report",
  schema: z.object({
    runId: z.string(),
    targetUrl: z.string().url(),
    goal: z.string(),
    agentRuns: z.array(z.any()),
  }),
  run: async (payload) => {
    const report = buildReport({
      targetUrl: payload.targetUrl,
      goal: payload.goal,
      agentRuns: payload.agentRuns as AgentRunResult[],
    });

    logger.info("Chaos Swarm report finalized", {
      runId: payload.runId,
      efi: report.efi.score,
      highlights: report.highlightReel.length,
    });

    return report;
  },
});

export const runSwarm = schemaTask({
  id: "chaos-swarm-run-swarm",
  queue: swarmQueue,
  schema: runSchema,
  run: async (payload) => {
    logger.info("Chaos Swarm run started", payload);

    const agentRuns: AgentRunResult[] = [];

    for (let agentIndex = 0; agentIndex < payload.agentCount; agentIndex += 1) {
      const result = await runAgentStep.triggerAndWait({
        ...payload,
        agentIndex,
      });

      if (result.ok) {
        agentRuns.push(result.output);
      } else {
        throw result.error;
      }
    }

    const reportResult = await finalizeReport.triggerAndWait({
      runId: payload.runId,
      targetUrl: payload.targetUrl,
      goal: payload.goal,
      agentRuns,
    });

    if (!reportResult.ok) {
      throw reportResult.error;
    }

    return {
      runId: payload.runId,
      agentCount: payload.agentCount,
      report: reportResult.output,
    };
  },
});
