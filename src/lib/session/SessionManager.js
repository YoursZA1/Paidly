import { decideSessionAction, SESSION_DECISION } from "@/lib/sessionDecisionEngine";
import { SESSION_STATUS } from "@/stores/sessionHealthStore";
import { trackSessionTelemetry } from "@/lib/sessionTelemetry";
import { createRefreshQueue } from "@/lib/session/RefreshQueue";
import { createConnectionManager } from "@/lib/session/ConnectionManager";
import { createAuthTransitionManager } from "@/lib/session/AuthTransitionManager";

export function createSessionManager(deps) {
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
      source: extra.source || "session_manager",
    });
    return decision;
  };

  const healthMonitor = {
    setConnected(reason = "connected") {
      refreshQueue.resume();
      deps.setSessionHealth(SESSION_STATUS.CONNECTED, reason);
    },
    setReconnecting(reason = "reconnecting") {
      deps.setSessionHealth(SESSION_STATUS.RECONNECTING, reason);
    },
    setExpired(reason = "expired") {
      deps.setSessionHealth(SESSION_STATUS.EXPIRED, reason);
    },
  };

  /** @typedef {"inactivity_timeout"|"fatal_refresh_token"|"refresh_token_invalid"|"session_missing_after_reconnect"|"signed_out"|"signed_out_in_another_tab"|"unauthorized"|"session_revoked"|"auth_expired"|"forced_sign_out"|"reconnect_failed"|"auth_corruption"|"storage_corruption"|"token_desync"|"app_version_mismatch"} SessionExpiredReason */
  async function transitionToExpired(reason = "session_expired", options = {}) {
    return authTransitionManager.transitionToExpired(reason, {
      ...options,
      source: options?.source || "session_manager",
    });
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
      await transitionToExpired(decision.reason || reason, {
        signOutLocal: true,
        clearAuthState: true,
        broadcast: true,
        redirect: true,
        source: "refresh_fatal",
      });
      return false;
    },
    handleMissingSession(reason = "session_missing_after_reconnect") {
      const decision = evaluate(reason);
      if (decision.action === SESSION_DECISION.RECONNECTING || decision.action === SESSION_DECISION.NONE) {
        trackSessionTelemetry("session_missing_recovered_to_reconnecting", {
          reason: decision.reason || reason || null,
        });
        healthMonitor.setReconnecting(decision.reason || reason);
        return false;
      }
      trackSessionTelemetry("session_missing_terminal_escalation", {
        reason: decision.reason || reason || null,
      });
      return true;
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
