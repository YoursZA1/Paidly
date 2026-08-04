import { RealtimeManager } from "@/core/realtime/RealtimeManager";

/** Tab-singleton logical subscription registry (wired from paidlyRealtimeManager). */
let shared = null;

export function getSharedRealtimeManager() {
  if (!shared) {
    shared = new RealtimeManager({ maxLogicalSubscriptions: 12 });
  }
  return shared;
}

/** @internal Vitest */
export function __resetSharedRealtimeManagerForTests() {
  if (shared) {
    shared.pauseAll();
    shared.resumeAll();
  }
  shared = null;
}
