const storageMode: "memory" | "supabase" =
  process.env.CHAOS_SWARM_STORAGE_MODE === "supabase" ? "supabase" : "memory";
const executionMode: "simulation" | "local" | "hybrid" =
  process.env.CHAOS_SWARM_EXECUTION_MODE === "hybrid"
    ? "hybrid"
    : process.env.CHAOS_SWARM_EXECUTION_MODE === "simulation"
      ? "simulation"
      : "local";

export const env = {
  storageMode,
  executionMode,
  openAiApiKey: process.env.OPENAI_API_KEY,
  agentModel: process.env.CHAOS_SWARM_AGENT_MODEL || "gpt-4o-mini",
  browserbaseApiKey: process.env.BROWSERBASE_API_KEY,
  browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  triggerProjectId: process.env.TRIGGER_PROJECT_ID,
};

export function canUseBrowserbase() {
  return Boolean(env.browserbaseApiKey && env.browserbaseProjectId);
}

export function canUseSupabase() {
  const hasProjectUrl = Boolean(env.supabaseUrl);
  const hasKey = Boolean(env.supabaseServiceRoleKey || env.supabaseAnonKey);
  const hasDatabaseUrl = Boolean(process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL);

  return env.storageMode === "supabase" && ((hasProjectUrl && hasKey) || hasDatabaseUrl);
}
