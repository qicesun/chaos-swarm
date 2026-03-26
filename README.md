# Chaos Swarm

Chaos Swarm is a cloud-first UX chaos testing demo that releases synthetic user agents against public web funnels and turns their friction into inspectable reports.

## Workspace

- `apps/web`: Next.js control plane
- `packages/agent-core`: agent runtime and personas
- `packages/reporting`: EFI, funnel, clusters, and report rendering
- `infra/supabase/schema.sql`: persistence schema

## Local workflow

1. Import keys from the parent `APIKey.txt` file:

   ```bash
   pnpm keys:import
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Start the web app:

   ```bash
   pnpm dev
   ```

The initial implementation defaults to simulation mode until Trigger.dev auth and live Browserbase execution are wired.
