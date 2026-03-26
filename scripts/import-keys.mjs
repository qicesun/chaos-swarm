import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sourcePath = path.resolve(repoRoot, "..", "APIKey.txt");
const rootEnvPath = path.join(repoRoot, ".env.local");
const webEnvPath = path.join(repoRoot, "apps", "web", ".env.local");

if (!fs.existsSync(sourcePath)) {
  console.error(`API key source file not found: ${sourcePath}`);
  process.exit(1);
}

const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
let section = "";
const env = {};
let pendingLabel = "";
const knownSections = new Set(["openai", "browserbase", "supabase", "trigger", "vercel"]);

for (const rawLine of lines) {
  const line = rawLine.trim();

  if (!line) {
    continue;
  }

  const match = line.match(/^([^:]+):\s*(.+)$/);

  if (!match) {
    if (/:$/.test(line)) {
      const candidateSection = line.slice(0, -1).trim().toLowerCase();

      if (knownSections.has(candidateSection)) {
        section = candidateSection;
        pendingLabel = "";
        continue;
      }

      if (pendingLabel) {
        assignValue(section, pendingLabel, line);
        pendingLabel = "";
      } else {
        pendingLabel = candidateSection;
      }
      continue;
    }

    if (pendingLabel) {
      assignValue(section, pendingLabel, line);
      pendingLabel = "";
    }
    continue;
  }

  const label = match[1].trim().toLowerCase();
  const value = match[2].trim();

  if (!value) {
    pendingLabel = label;
    continue;
  }

  assignValue(section, label, value);
}

env.CHAOS_SWARM_STORAGE_MODE ??= env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "memory";
env.CHAOS_SWARM_EXECUTION_MODE ??= "local";
env.TRIGGER_PROJECT_ID ??= "proj_whomfjpayhmhuikhierx";

const body = Object.entries(env)
  .map(([key, value]) => `${key}=${value}`)
  .join("\n")
  .concat("\n");

fs.writeFileSync(rootEnvPath, body, "utf8");
fs.writeFileSync(webEnvPath, body, "utf8");

console.log(`Wrote ${rootEnvPath}`);
console.log(`Wrote ${webEnvPath}`);

function assignValue(sectionName, label, value) {
  if (sectionName === "openai" && label === "api key") {
    env.OPENAI_API_KEY = value;
  }

  if (sectionName === "browserbase" && label === "api key") {
    env.BROWSERBASE_API_KEY = value;
  }

  if (sectionName === "browserbase" && label === "project id") {
    env.BROWSERBASE_PROJECT_ID = value;
  }

  if (sectionName === "supabase" && label === "project url") {
    env.NEXT_PUBLIC_SUPABASE_URL = value;
  }

  if (sectionName === "supabase" && label === "publishable key") {
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = value;
  }

  if (sectionName === "supabase" && label === "api key") {
    env.SUPABASE_SERVICE_ROLE_KEY = value;
  }

  if (sectionName === "supabase" && label === "direct connection string") {
    env.SUPABASE_DB_URL = value;
  }
}
