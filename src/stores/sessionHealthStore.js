import { create } from "zustand";

/**
 * Session health state for UX visibility.
 * @typedef {'connected' | 'reconnecting' | 'expired'} SessionHealthStatus
 */
export const useSessionHealthStore = create((set) => ({
  status: "connected",
  reason: null,
  lastTransitionAt: null,
  setStatus: (status, reason = null) =>
    set({
      status,
      reason: reason ? String(reason) : null,
      lastTransitionAt: Date.now(),
    }),
  reset: () => set({ status: "connected", reason: null, lastTransitionAt: Date.now() }),
}));

export function setSessionHealthStatus(status, reason = null) {
  useSessionHealthStore.setState({
    status,
    reason: reason ? String(reason) : null,
    lastTransitionAt: Date.now(),
  });
}

