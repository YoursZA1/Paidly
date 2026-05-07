import { CONNECTION_STATUS } from "@/stores/useConnectionStore";
import { trackSessionTelemetry } from "@/lib/sessionTelemetry";

export function createConnectionManager() {
  const RECONNECTING_GRACE_MS = 3000;
  const DISCONNECTED_AFTER_MS = 10000;
  let reconnectTimer = null;
  let disconnectedTimer = null;
  let degradedSince = null;
  let hiddenStartedAt = null;

  function isTransientError(errorMessage) {
    const msg = String(errorMessage || "").toLowerCase();
    return (
      msg.includes("session_reconnecting") ||
      msg.includes("profiles_timeout") ||
      msg.includes("timeout") ||
      msg.includes("aborted") ||
      msg.includes("network")
    );
  }

  function resolveOfflineState(decisionAction) {
    return decisionAction === "reconnecting"
      ? CONNECTION_STATUS.RECONNECTING
      : CONNECTION_STATUS.DISCONNECTED;
  }

  function resolveDegradedState({ decisionAction, degradedForMs, errorMessage, reconnectingGraceMs, disconnectedAfterMs }) {
    const transient = isTransientError(errorMessage);
    if (degradedForMs >= disconnectedAfterMs) {
      return {
        status: transient || decisionAction === "reconnecting"
          ? CONNECTION_STATUS.RECONNECTING
          : CONNECTION_STATUS.DISCONNECTED,
        lastError: transient ? null : errorMessage || "Could not reach Paidly services.",
      };
    }
    if (degradedForMs >= reconnectingGraceMs) {
      return {
        status: decisionAction === "reauth_required"
          ? CONNECTION_STATUS.DISCONNECTED
          : CONNECTION_STATUS.RECONNECTING,
        lastError: null,
      };
    }
    return null;
  }

  function mapSessionHealthToConnection({ sessionStatus, sessionReason }) {
    if (sessionStatus === "connected") {
      return { status: CONNECTION_STATUS.CONNECTED, lastError: null };
    }
    if (sessionStatus === "reconnecting") {
      return { status: CONNECTION_STATUS.RECONNECTING, lastError: null };
    }
    if (sessionStatus === "expired") {
      return {
        status: CONNECTION_STATUS.DISCONNECTED,
        lastError: sessionReason === "inactivity_timeout" ? "Signed out due to inactivity." : "Session expired.",
      };
    }
    return null;
  }

  function clearDegradedTimers() {
    if (typeof window === "undefined") return;
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (disconnectedTimer) {
      window.clearTimeout(disconnectedTimer);
      disconnectedTimer = null;
    }
  }

  function markConnected(setConnectionState) {
    degradedSince = null;
    hiddenStartedAt = null;
    clearDegradedTimers();
    setConnectionState({
      status: CONNECTION_STATUS.CONNECTED,
      lastError: null,
      lastCheckAt: Date.now(),
    });
  }

  function scheduleDegradedTransition({
    errorMessage = null,
    isVisible,
    getDecisionAction,
    setConnectionState,
    reconnectingGraceMs = RECONNECTING_GRACE_MS,
    disconnectedAfterMs = DISCONNECTED_AFTER_MS,
  }) {
    if (!isVisible()) {
      trackSessionTelemetry("connection_degrade_suppressed_hidden", {
        reason: errorMessage || "connection_unstable",
      });
      clearDegradedTimers();
      return;
    }
    if (degradedSince == null) {
      degradedSince = Date.now();
    }
    const degradedForMs = Date.now() - degradedSince;
    const decisionAction = getDecisionAction(errorMessage || "connection_unstable");
    const degradedState = resolveDegradedState({
      decisionAction,
      degradedForMs,
      errorMessage,
      reconnectingGraceMs,
      disconnectedAfterMs,
    });
    if (degradedState) {
      setConnectionState({
        ...degradedState,
        lastCheckAt: Date.now(),
      });
    }
    if (!reconnectTimer && typeof window !== "undefined") {
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (degradedSince == null || !isVisible()) return;
        trackSessionTelemetry("reconnect_timer_fired", {
          reason: errorMessage || "connection_unstable",
        });
        setConnectionState({
          status: CONNECTION_STATUS.RECONNECTING,
          lastError: null,
          lastCheckAt: Date.now(),
        });
      }, reconnectingGraceMs);
    }
    if (!disconnectedTimer && typeof window !== "undefined") {
      disconnectedTimer = window.setTimeout(() => {
        disconnectedTimer = null;
        if (degradedSince == null || !isVisible()) return;
        trackSessionTelemetry("disconnect_timer_fired", {
          reason: errorMessage || "connection_unstable",
        });
        const delayedDecisionAction = getDecisionAction(errorMessage || "connection_unstable");
        const delayedState = resolveDegradedState({
          decisionAction: delayedDecisionAction,
          degradedForMs: disconnectedAfterMs,
          errorMessage,
          reconnectingGraceMs,
          disconnectedAfterMs,
        });
        setConnectionState({
          ...(delayedState || {
            status: CONNECTION_STATUS.DISCONNECTED,
            lastError: errorMessage || "Could not reach Paidly services.",
          }),
          lastCheckAt: Date.now(),
        });
      }, disconnectedAfterMs);
    }
  }

  function setOffline({ decisionAction, setConnectionState }) {
    degradedSince = Date.now();
    clearDegradedTimers();
    setConnectionState({
      status: resolveOfflineState(decisionAction),
      lastError: "You appear to be offline.",
      lastCheckAt: Date.now(),
    });
  }

  function onHidden() {
    hiddenStartedAt = Date.now();
    trackSessionTelemetry("connection_visibility_hidden", {});
    clearDegradedTimers();
  }

  function onVisible() {
    const hiddenDurationMs =
      hiddenStartedAt && hiddenStartedAt > 0 ? Math.max(0, Date.now() - hiddenStartedAt) : 0;
    trackSessionTelemetry("connection_visibility_visible", {
      hidden_duration_ms: hiddenDurationMs,
    });
    if (hiddenStartedAt && degradedSince != null) {
      degradedSince += hiddenDurationMs;
    }
    hiddenStartedAt = null;
  }

  function dispose() {
    clearDegradedTimers();
    degradedSince = null;
    hiddenStartedAt = null;
  }

  return {
    isTransientError,
    resolveOfflineState,
    resolveDegradedState,
    mapSessionHealthToConnection,
    clearDegradedTimers,
    markConnected,
    scheduleDegradedTransition,
    setOffline,
    onHidden,
    onVisible,
    dispose,
  };
}
