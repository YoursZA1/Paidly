import { create } from "zustand";

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

/** @internal */
export function __resetConnectionLifecycleStoreForTests() {
  useConnectionLifecycleStore.getState().reset();
}
