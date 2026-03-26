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

export function upsertRunInStore(record: RunRecord) {
  const store = getStore();
  store.runs.set(record.id, record);
  return record;
}

export function getRunFromStore(id: string) {
  return getStore().runs.get(id) ?? null;
}

export function removeRunFromStore(id: string) {
  getStore().runs.delete(id);
}

export function listRunsFromStore() {
  return Array.from(getStore().runs.values());
}
