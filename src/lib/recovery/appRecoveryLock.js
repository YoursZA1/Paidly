import { useWakeRecoveryStore } from "@/stores/wakeRecoveryStore";

/** @typedef {'idle' | 'auth' | 'realtime'} AppRecoveryLockPhase */

export const AppRecoveryPhase = /** @type {const} */ ({
  IDLE: "idle",
  AUTH: "auth",
  REALTIME: "realtime",
});

/**
 * Single app-wide recovery lock for sleep/wake and similar full-stack restore paths.
 * While active: block entity mutations, drop realtime postgres fan-out, pause sync-queue draining.
 * Order: {@link AppRecoveryPhase.AUTH} (JWT/session) → {@link AppRecoveryPhase.REALTIME} (socket) → release.
 */
export const AppRecoveryLock = {
  /** @param {string} [reason] */
  begin(reason = "wake") {
    useWakeRecoveryStore.getState().setRecoveryBlocking(true, { reason, phase: AppRecoveryPhase.AUTH });
  },

  /** @param {AppRecoveryLockPhase} phase */
  setPhase(phase) {
    const s = useWakeRecoveryStore.getState();
    if (!s.blockMutations) return;
    useWakeRecoveryStore.setState({ lockPhase: phase });
  },

  end() {
    useWakeRecoveryStore.getState().setRecoveryBlocking(false);
  },

  isActive() {
    return useWakeRecoveryStore.getState().blockMutations;
  },

  /** @returns {AppRecoveryLockPhase} */
  getPhase() {
    return useWakeRecoveryStore.getState().lockPhase;
  },
};
