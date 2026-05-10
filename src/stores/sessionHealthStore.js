import { create } from "zustand";
import { trackSessionTelemetry } from "@/lib/sessionTelemetry";

/**
 * Session health state for UX visibility.
 * @typedef {'connected' | 'unstable' | 'reconnecting' | 'degraded' | 'reauth_required' | 'expired'} SessionHealthStatus
 */
export const SESSION_STATUS = {
  CONNECTED: "connected",
  UNSTABLE: "unstable",
  RECONNECTING: "reconnecting",
  DEGRADED: "degraded",
  REAUTH_REQUIRED: "reauth_required",
  EXPIRED: "expired",
};

/** Non-terminal states where realtime may still need a recovered hint after subscribe. */
export function shouldHintRealtimeRecoveredFromSessionHealth(status) {
  return (
    status === SESSION_STATUS.UNSTABLE ||
    status === SESSION_STATUS.RECONNECTING ||
    status === SESSION_STATUS.DEGRADED
  );
}
const EXPIRED_RECOVERY_REASONS = new Set(["signed_in", "initial_session"]);

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
  status: SESSION_STATUS.CONNECTED,
  reason: null,
  lastTransitionAt: null,
  setStatus: (status, reason = null) =>
    set({
      status,
      reason: reason ? String(reason) : null,
      lastTransitionAt: Date.now(),
    }),
  reset: () => set({ status: SESSION_STATUS.CONNECTED, reason: null, lastTransitionAt: Date.now() }),
}));

/**
 * Applies a session health snapshot (debounced reconnecting, terminal EXPIRED lock, telemetry).
 * Call only from {@link createSessionOrchestrator} via its injected `setSessionHealth` — not from feature code.
 */
export function applySessionHealthFromAuthority(status, reason = null) {
  const previous = useSessionHealthStore.getState().status;
  const normalizedReason = reason ? String(reason) : null;
  // EXPIRED is terminal/authoritative: only explicit re-auth reasons can recover.
  if (
    previous === SESSION_STATUS.EXPIRED &&
    status !== SESSION_STATUS.EXPIRED &&
    !EXPIRED_RECOVERY_REASONS.has(normalizedReason || "")
  ) {
    trackSessionTelemetry("session_health_transition_blocked", {
      from_status: previous,
      to_status: status,
      reason: normalizedReason,
    });
    return;
  }
  if (status !== SESSION_STATUS.RECONNECTING) {
    clearReconnectingTimer();
    reconnectingRequestId += 1;
    useSessionHealthStore.setState({
      status,
      reason: normalizedReason,
      lastTransitionAt: Date.now(),
    });
    trackSessionTelemetry("session_health_transition", {
      from_status: previous,
      to_status: status,
      reason: normalizedReason,
    });
    return;
  }

  // Recovery ladder (unstable → reconnecting → …): apply reconnecting immediately — debounce only from a stable CONNECTED flicker.
  if (previous !== SESSION_STATUS.CONNECTED) {
    clearReconnectingTimer();
    reconnectingRequestId += 1;
    useSessionHealthStore.setState({
      status: SESSION_STATUS.RECONNECTING,
      reason: normalizedReason,
      lastTransitionAt: Date.now(),
    });
    trackSessionTelemetry("session_health_transition", {
      from_status: previous,
      to_status: SESSION_STATUS.RECONNECTING,
      reason: normalizedReason,
    });
    return;
  }

  const requestId = ++reconnectingRequestId;
  clearReconnectingTimer();
  reconnectingTimer = setTimeout(() => {
    if (requestId !== reconnectingRequestId) return;
    const current = useSessionHealthStore.getState();
    // If state already stabilized, suppress delayed reconnect flicker.
    if (current.status === SESSION_STATUS.CONNECTED || current.status === SESSION_STATUS.EXPIRED) return;
    useSessionHealthStore.setState({
      status: SESSION_STATUS.RECONNECTING,
      reason: normalizedReason,
      lastTransitionAt: Date.now(),
    });
    trackSessionTelemetry("session_health_transition", {
      from_status: current.status,
      to_status: SESSION_STATUS.RECONNECTING,
      reason: normalizedReason,
    });
  }, RECONNECTING_DEBOUNCE_MS);

  // Keep default UX stable as connected while debounce window is open.
  useSessionHealthStore.setState({
    status: SESSION_STATUS.CONNECTED,
    reason: null,
    lastTransitionAt: useSessionHealthStore.getState().lastTransitionAt || Date.now(),
  });
}

