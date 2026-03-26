import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

if (typeof process.loadEnvFile === "function") {
  process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  process.loadEnvFile(path.resolve(process.cwd(), "apps", "web", ".env.local"));
}

const connectionString = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("SUPABASE_DB_URL or DATABASE_URL is required.");
  process.exit(1);
}

const schemaPath = path.resolve(process.cwd(), "infra", "supabase", "schema.sql");
const sql = await readFile(schemaPath, "utf8");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log(`Applied schema from ${schemaPath}`);
} finally {
  await client.end().catch(() => undefined);
}
