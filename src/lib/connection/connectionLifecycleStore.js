import { create } from "zustand";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";

/**
 * Read model for {@link createConnectionLifecycleManager} — observability and UI, not a second authority.
 * All session health mutations still flow through the lifecycle manager → SessionOrchestrator.
 */
const initial = {
  /** @type {{ phase: string, lastReason: string | null }} */
  auth: { phase: "unknown", lastReason: null },
  /** @type {{ phase: string, lastReason: string | null }} */
  refresh: { phase: "idle", lastReason: null },
  /** @type {{ phase: string, lastReason: string | null }} */
  realtime: { phase: "idle", lastReason: null },
  /** @type {'visible'|'hidden'} */
  visibility: "visible",
  /** @type {{ online: boolean, updatedAt: number | null }} */
  network: { online: true, updatedAt: null },
  /** @type {{ phase: string, hiddenAt: number | null }} */
  sleepWake: { phase: "awake", hiddenAt: null },
  /** @type {{ phase: string, blockingMutations: boolean, reason: string | null }} */
  recovery: { phase: "idle", blockingMutations: false, reason: null },
};

export const useConnectionLifecycleStore = create((set) => ({
  ...initial,
  /**
   * @param {Partial<typeof initial>} partial — shallow merge per top-level key
   */
  patch(partial) {
    set((state) => {
      const next = { ...state };
      for (const key of Object.keys(partial)) {
        if (partial[key] != null && typeof partial[key] === "object" && !Array.isArray(partial[key])) {
          next[key] = { ...state[key], ...partial[key] };
        } else if (partial[key] !== undefined) {
          next[key] = partial[key];
        }
      }
      return next;
    });
  },
  reset() {
    set(initial);
  },
}));

/**
 * Single UI guard for "connected" badges/indicators.
 * Connected visuals must not render while auth is terminal or lifecycle auth is not signed-in.
 */
export function selectAuthGatedConnectedSignal(lifecycleState, sessionStatus) {
  const terminal =
    sessionStatus === SESSION_STATUS.REAUTH_REQUIRED || sessionStatus === SESSION_STATUS.EXPIRED;
  if (terminal) return false;
  if (lifecycleState?.network?.online === false) return false;
  const authPhase = String(lifecycleState?.auth?.phase || "unknown");
  if (authPhase !== "signed_in") return false;
  return sessionStatus === SESSION_STATUS.CONNECTED;
}

/** Hook wrapper so connected UI consumers share one canonical guard. */
export function useAuthGatedConnectedSignal() {
  const lifecycle = useConnectionLifecycleStore((s) => s);
  const sessionStatus = useSessionHealthStore((s) => s.status);
  return selectAuthGatedConnectedSignal(lifecycle, sessionStatus);
}

/** @internal */
export function __resetConnectionLifecycleStoreForTests() {
  useConnectionLifecycleStore.getState().reset();
}
