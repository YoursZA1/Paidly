import { create } from "zustand";

/** Wall-clock gap since last visible heartbeat or tab hidden duration that triggers full wake recovery. */
export const WAKE_RECOVERY_THRESHOLD_MS = Number(
  import.meta.env.VITE_WAKE_RECOVERY_THRESHOLD_MS || 90_000
);

/**
 * Wake-from-sleep coordination: heartbeat timestamp + mutation barrier during recovery.
 * @typedef {'idle' | 'auth' | 'realtime'} AppRecoveryLockPhase
 */
export const useWakeRecoveryStore = create((set) => ({
  /** Last time the tab completed a healthy auth heartbeat while visible (unix ms). */
  lastHeartbeatAt: null,
  /** When true, entity writes should fail fast with a user-visible message. */
  blockMutations: false,
  /** {@link AppRecoveryLock} stage: auth refresh first, then realtime reconnect before unlock. */
  lockPhase: /** @type {AppRecoveryLockPhase} */ ("idle"),
  /** Optional label for telemetry / UI. */
  recoveryPhase: null,
  /** FSM label from {@link runWakeRecoveryPipeline} (debug / overlay). */
  pipelineState: /** @type {string | null} */ (null),

  touchHeartbeat: () => set({ lastHeartbeatAt: Date.now() }),

  /**
   * @param {boolean} block
   * @param {null | string | { reason?: string | null, phase?: AppRecoveryLockPhase }} [options]
   */
  setRecoveryBlocking: (block, options = null) => {
    if (!block) {
      set({
        blockMutations: false,
        lockPhase: "idle",
        recoveryPhase: null,
        pipelineState: null,
      });
      return;
    }
    const opts = typeof options === "string" ? { reason: options, phase: "auth" } : options || {};
    set({
      blockMutations: true,
      lockPhase: opts.phase || "auth",
      recoveryPhase: opts.reason ?? null,
    });
  },

  reset: () =>
    set({
      lastHeartbeatAt: null,
      blockMutations: false,
      lockPhase: "idle",
      recoveryPhase: null,
      pipelineState: null,
    }),
}));
