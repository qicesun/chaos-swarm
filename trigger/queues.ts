import { queue } from "@trigger.dev/sdk";

export const swarmQueue = queue({
  name: "chaos-swarm-runs",
  concurrencyLimit: 2,
});

export const agentQueue = queue({
  name: "chaos-swarm-agents",
  concurrencyLimit: 8,
});
