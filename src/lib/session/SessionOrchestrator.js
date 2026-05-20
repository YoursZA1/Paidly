import { decideSessionAction, SESSION_DECISION } from "@/lib/sessionDecisionEngine";
import { SESSION_STATUS } from "@/stores/sessionHealthStore";
import { bumpSessionRecoveryEscalation, resetSessionRecoveryEscalation } from "@/lib/session/sessionRecoveryEscalation";
import { trackSessionTelemetry } from "@/lib/sessionTelemetry";
import { createRefreshQueue } from "@/lib/session/RefreshQueue";
import { createConnectionManager } from "@/lib/session/ConnectionManager";
import { createAuthTransitionManager } from "@/lib/session/AuthTransitionManager";

/**
 * @typedef {object} SessionAuthority
 * @property {(reason?: string) => void} markConnected
 * @property {(reason?: string) => void} markReconnecting
 * @property {(reason?: string) => void} markExpiredSurface
 * @property {(reason?: string, options?: object) => Promise<boolean>} transitionToExpired
 * @property {(reason?: string, extra?: object) => object} getDecision
 * @property {(reason?: string, extra?: object) => boolean} shouldRequireReauth
 * @property {(reason?: string) => Promise<boolean>} handleRefreshFatal
 * @property {(reason?: string) => boolean} handleMissingSession
 * @property {(reason?: string) => { forceTerminalLogout: boolean }} escalateRecoverableSession
 * @property {(reason?: string) => void} reportRealtimeUnstable
 * @property {(reason?: string) => void} reportRealtimeRecovered
 * @property {(reason?: string) => void} reportVisibilityRecover
 * @property {(reason?: string) => void} reportOffline
 * @property {() => void} reportRefreshRequiredVisible
 * @property {(opts?: { offline?: boolean }) => void} reportRefreshStarting
 * @property {(reason?: string) => void} reportRefreshOk
 * @property {(reason?: string) => void} reportSessionMissingDuringReconnect
 * @property {(reason?: string) => void} markManualLogoutReset
 */

function createSessionLifecycleCore(deps) {
  const refreshQueue = createRefreshQueue({ minGapMs: 3000 });
  const connectionManager = createConnectionManager();
  const authTransitionManager = createAuthTransitionManager({
    getSessionHealthStatus: deps.getSessionHealthStatus,
    setSessionHealth: deps.setSessionHealth,
    patchAuthSession: deps.patchAuthSession,
    publish: deps.publish,
    clearError: deps.clearError,
    clearReconnectLoops: deps.clearReconnectLoops,
    clearVolatileCaches: deps.clearVolatileCaches,
    signOutLocalSafe: deps.signOutLocalSafe,
    refreshQueue,
    connectionManager,
  });

  const evaluate = (reason, extra = {}) => {
    const decision = decideSessionAction({
      reason,
      believedSignedIn: deps.getBelievedSignedIn(),
      online: deps.getOnline(),
      refreshFatal: Boolean(extra.refreshFatal),
    });
    trackSessionTelemetry("session_decision_made", {
      decision_action: decision.action,
      reason: decision.reason || reason || null,
      believed_signed_in: deps.getBelievedSignedIn(),
      online: deps.getOnline(),
      refresh_fatal: Boolean(extra.refreshFatal),
      source: extra.source || "session_orchestrator",
    });
    return decision;
  };

  const healthMonitor = {
    setConnected(reason = "connected") {
      resetSessionRecoveryEscalation();
      refreshQueue.resume();
      deps.setSessionHealth(SESSION_STATUS.CONNECTED, reason);
    },
    setReconnecting(reason = "reconnecting") {
      deps.setSessionHealth(SESSION_STATUS.RECONNECTING, reason);
    },
    setExpired(reason = "expired") {
      resetSessionRecoveryEscalation();
      deps.setSessionHealth(SESSION_STATUS.EXPIRED, reason);
    },
  };

  async function transitionToExpired(reason = "session_expired", options = {}) {
    return authTransitionManager.transitionToExpired(reason, {
      ...options,
      source: options?.source || "session_orchestrator",
    });
  }

  function escalateRecoverableSession(reason = "session_recoverable_failure") {
    const decision = evaluate(reason);
    if (decision.action === SESSION_DECISION.NONE) {
      return { forceTerminalLogout: false };
    }
    const { status, forceTerminalLogout } = bumpSessionRecoveryEscalation();
    if (forceTerminalLogout) {
      trackSessionTelemetry("session_recoverable_escalation_terminal", {
        reason: decision.reason || reason || null,
      });
      return { forceTerminalLogout: true };
    }
    trackSessionTelemetry("session_recoverable_escalation_step", {
      reason: decision.reason || reason || null,
      to_status: status,
    });
    deps.setSessionHealth(status, decision.reason || reason);
    return { forceTerminalLogout: false };
  }

  const authManager = {
    getDecision(reason, extra = {}) {
      return evaluate(reason, extra);
    },
    shouldRequireReauth(reason, extra = {}) {
      return evaluate(reason, extra).action === SESSION_DECISION.REAUTH_REQUIRED;
    },
    transitionToExpired,
  };

  const refreshManager = {
    async handleFatal(reason = "fatal_refresh_token") {
      const decision = evaluate(reason, { refreshFatal: true });
      trackSessionTelemetry("session_refresh_fatal", { reason: decision.reason || reason || null });
      await authTransitionManager.clearSession({
        signOutLocal: true,
        clearAuthState: true,
        broadcast: true,
        reason: decision.reason || reason,
      });
      deps.setSessionHealth(SESSION_STATUS.REAUTH_REQUIRED, decision.reason || reason);
      resetSessionRecoveryEscalation();
      deps.clearError?.();
      trackSessionTelemetry("session_transition_reauth_required", {
        reason: decision.reason || reason || null,
        source: "refresh_fatal",
      });
      return false;
    },
    escalateRecoverableSession,
    handleMissingSession(reason = "session_missing_after_reconnect") {
      return escalateRecoverableSession(reason).forceTerminalLogout;
    },
  };

  const realtimeManager = {
    onUnstable(reason = "realtime_unstable") {
      const decision = evaluate(reason);
      if (decision.action === SESSION_DECISION.RECONNECTING) {
        healthMonitor.setReconnecting(decision.reason || reason);
      }
    },
  };

  const visibilityManager = {
    onOffline(reason = "offline") {
      const decision = evaluate(reason);
      if (decision.action === SESSION_DECISION.RECONNECTING) {
        healthMonitor.setReconnecting(decision.reason || reason);
      }
    },
  };

  const backgroundSyncManager = {
    onReconnectReason(reason = "background_sync") {
      const decision = evaluate(reason);
      if (decision.action === SESSION_DECISION.RECONNECTING) {
        healthMonitor.setReconnecting(decision.reason || reason);
      }
    },
  };

  return {
    AuthManager: authManager,
    AuthTransitionManager: authTransitionManager,
    RefreshManager: refreshManager,
    RefreshQueue: refreshQueue,
    ConnectionManager: connectionManager,
    RealtimeManager: realtimeManager,
    VisibilityManager: visibilityManager,
    BackgroundSyncManager: backgroundSyncManager,
    HealthMonitor: healthMonitor,
  };
}

/**
 * Single composition root for session lifecycle health, connection UX, and terminal logout.
 * Supabase GoTrue owns JWT refresh; this layer only mirrors session state and coordinates UX.
 */
export function createSessionOrchestrator(deps) {
  const manager = createSessionLifecycleCore(deps);

  const visibilityRecoveryManager = {
    onOffline: (reason = "offline") => manager.VisibilityManager.onOffline(reason),
    onReconnectReason: (reason = "background_sync") =>
      manager.BackgroundSyncManager.onReconnectReason(reason),
  };

  /** @type {SessionAuthority} */
  const Authority = {
    markConnected(reason = "connected") {
      manager.HealthMonitor.setConnected(reason);
    },
    markReconnecting(reason = "reconnecting") {
      manager.HealthMonitor.setReconnecting(reason);
    },
    markExpiredSurface(reason = "expired") {
      manager.HealthMonitor.setExpired(reason);
    },
    transitionToExpired(reason, options) {
      return manager.AuthManager.transitionToExpired(reason, options);
    },
    getDecision(reason, extra) {
      return manager.AuthManager.getDecision(reason, extra);
    },
    shouldRequireReauth(reason, extra) {
      return manager.AuthManager.shouldRequireReauth(reason, extra);
    },
    handleRefreshFatal(reason) {
      return manager.RefreshManager.handleFatal(reason);
    },
    handleMissingSession(reason) {
      return manager.RefreshManager.handleMissingSession(reason);
    },
    escalateRecoverableSession(reason) {
      return manager.RefreshManager.escalateRecoverableSession(reason);
    },
    reportRealtimeUnstable(reason = "realtime_unstable") {
      manager.RealtimeManager.onUnstable(reason);
    },
    reportRealtimeRecovered(reason = "realtime_recovered") {
      manager.HealthMonitor.setConnected(reason);
    },
    reportVisibilityRecover(reason = "background_sync") {
      visibilityRecoveryManager.onReconnectReason(reason);
    },
    reportOffline(reason = "offline") {
      visibilityRecoveryManager.onOffline(reason);
    },
    reportRefreshRequiredVisible() {
      manager.HealthMonitor.setReconnecting("refreshing");
    },
    reportRefreshStarting(opts = {}) {
      manager.HealthMonitor.setReconnecting(opts.offline ? "offline" : "refreshing");
    },
    reportRefreshOk(reason = "refresh_ok") {
      manager.HealthMonitor.setConnected(reason);
    },
    reportSessionMissingDuringReconnect() {
      manager.HealthMonitor.setReconnecting("session_missing");
    },
    markManualLogoutReset() {
      manager.HealthMonitor.setConnected("manual_logout");
    },
  };

  return {
    Authority,
    RefreshManager: manager.RefreshManager,
    RetryController: manager.RefreshQueue,
    ConnectionMonitor: manager.ConnectionManager,
    AuthTransitionManager: manager.AuthTransitionManager,
    /** @internal tests */
    AuthManager: manager.AuthManager,
  };
}

/** @deprecated Use {@link createSessionOrchestrator}. */
export const createSessionManager = createSessionLifecycleCore;
