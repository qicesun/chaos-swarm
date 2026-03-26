import type { RunRecord } from "./types";

interface Store {
  runs: Map<string, RunRecord>;
}

declare global {
  var __CHAOS_SWARM_STORE__: Store | undefined;
}

function createStore(): Store {
  return {
    runs: new Map<string, RunRecord>(),
  };
}

export function getStore(): Store {
  if (!globalThis.__CHAOS_SWARM_STORE__) {
    globalThis.__CHAOS_SWARM_STORE__ = createStore();
  }

  return globalThis.__CHAOS_SWARM_STORE__;
}
