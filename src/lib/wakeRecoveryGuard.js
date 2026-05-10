import { useWakeRecoveryStore } from "@/stores/wakeRecoveryStore";

export class WakeRecoveryInProgressError extends Error {
  constructor(message = "Reconnecting after your device woke from sleep. Please wait a moment.") {
    super(message);
    this.name = "WakeRecoveryInProgressError";
  }
}

/** Block Supabase entity writes while wake recovery is running. */
export function assertWakeRecoveryAllowsMutations() {
  if (useWakeRecoveryStore.getState().blockMutations) {
    throw new WakeRecoveryInProgressError();
  }
}
