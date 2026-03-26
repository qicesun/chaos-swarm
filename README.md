# Chaos Swarm

Chaos Swarm is a cloud-first UX chaos testing demo that releases synthetic user agents against public web funnels and turns their friction into inspectable reports.

## Workspace

- `apps/web`: Next.js control plane
- `packages/agent-core`: agent runtime and personas
- `packages/reporting`: EFI, funnel, clusters, and report rendering
- `infra/supabase/schema.sql`: persistence schema

## Local workflow

1. Create a local env file from `.env.example`:

   ```bash
   copy .env.example .env.local
   ```

2. Populate `.env.local` with your real provider keys.

   Preferred runtime source:
   - `OPENAI_API_KEY`
   - `BROWSERBASE_API_KEY`
   - `BROWSERBASE_PROJECT_ID`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

   Optional one-time bootstrap from a parent `APIKey.txt` file:

   ```bash
   pnpm keys:import
   ```

3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Install the local Chromium binary for Playwright:

   ```bash
   pnpm --filter @chaos-swarm/web exec playwright install chromium
   ```

5. Start the web app:

   ```bash
   pnpm dev
   ```

The current implementation uses live local Playwright execution with in-memory progress streaming. Browserbase, Trigger.dev, and Supabase remain the next cloud/runtime upgrades.
