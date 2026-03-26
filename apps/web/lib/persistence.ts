import { createClient } from "@supabase/supabase-js";
import type { RunRecord } from "./types";
import { canUseSupabase, env } from "./env";

function getAdminClient() {
  if (!canUseSupabase() || !env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return null;
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function persistRunRecord(record: RunRecord) {
  const client = getAdminClient();

  if (!client) {
    return { ok: false as const, warning: "Supabase persistence is disabled." };
  }

  try {
    await client.from("runs").upsert({
      run_id: record.id,
      scenario_id: record.scenarioId,
      target_url: record.targetUrl,
      goal: record.goal,
      status: record.status,
      agent_count: record.agentCount,
      storage_mode: record.storageMode,
      execution_mode: record.executionMode,
      summary: record.summary,
      created_at: record.createdAt,
      completed_at: record.completedAt,
    });

    await client.from("agents").delete().eq("run_id", record.id);
    await client.from("events").delete().eq("run_id", record.id);

    await client.from("agents").insert(
      record.agentRuns.map((run) => ({
        run_id: record.id,
        agent_id: run.agentId,
        archetype: run.persona.archetype,
        status: run.completed ? "completed" : run.failed ? "failed" : "running",
        seed: run.config.seed ?? null,
        frustration_score: run.steps.at(-1)?.frustration ?? 0,
        confidence_score: run.steps.at(-1)?.confidence ?? 0,
        exit_reason: run.summary,
        steps_completed: run.steps.length,
        summary: run.summary,
      })),
    );

    await client.from("events").insert(
      record.events.map((event) => ({
        run_id: record.id,
        agent_id: event.agentId,
        step_index: event.step,
        action_kind: event.actionCode,
        action_ok: event.actionOk,
        decision_kind: event.decisionKind,
        load_state: event.loadState,
        page_url: event.url,
        note: `${event.title} | ${event.detail}`,
        frustration: event.frustration,
        confidence: event.confidence,
        occurred_at: event.timestamp,
      })),
    );

    await client.from("reports").upsert({
      run_id: record.id,
      title: record.report.title,
      summary: record.report.summary,
      report_json: record.report,
      generated_at: record.report.generatedAt,
    });

    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      warning: error instanceof Error ? error.message : "Unknown Supabase persistence failure.",
    };
  }
}
