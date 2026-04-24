import { create } from "zustand";

/**
 * Session health state for UX visibility.
 * @typedef {'connected' | 'reconnecting' | 'expired'} SessionHealthStatus
 */
const RECONNECTING_DEBOUNCE_MS = 2000;
let reconnectingTimer = null;
let reconnectingRequestId = 0;

function clearReconnectingTimer() {
  if (reconnectingTimer) {
    clearTimeout(reconnectingTimer);
    reconnectingTimer = null;
  }
}

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
  if (status !== "reconnecting") {
    clearReconnectingTimer();
    reconnectingRequestId += 1;
    useSessionHealthStore.setState({
      status,
      reason: reason ? String(reason) : null,
      lastTransitionAt: Date.now(),
    });
    return;
  }

  const requestId = ++reconnectingRequestId;
  clearReconnectingTimer();
  reconnectingTimer = setTimeout(() => {
    if (requestId !== reconnectingRequestId) return;
    const current = useSessionHealthStore.getState();
    // If state already stabilized, suppress delayed reconnect flicker.
    if (current.status === "connected" || current.status === "expired") return;
    useSessionHealthStore.setState({
      status: "reconnecting",
      reason: reason ? String(reason) : null,
      lastTransitionAt: Date.now(),
    });
  }, RECONNECTING_DEBOUNCE_MS);

  // Keep default UX stable as connected while debounce window is open.
  useSessionHealthStore.setState({
    status: "connected",
    reason: null,
    lastTransitionAt: useSessionHealthStore.getState().lastTransitionAt || Date.now(),
  });
}

