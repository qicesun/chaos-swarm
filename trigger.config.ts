import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? "proj_whomfjpayhmhuikhierx",
  dirs: ["./trigger"],
  maxDuration: 300,
});
