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
  browserbaseApiKey: process.env.BROWSERBASE_API_KEY,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  triggerProjectId: process.env.TRIGGER_PROJECT_ID,
};

export function canUseSupabase() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey) && env.storageMode === "supabase";
}
