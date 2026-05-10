import { createSessionManager } from "@/lib/session/SessionManager";

/**
 * @typedef {object} SessionAuthority
 * @property {(reason?: string) => void} markConnected
 * @property {(reason?: string) => void} markReconnecting
 * @property {(reason?: string) => void} markExpiredSurface — UX/store only; prefer transitionToExpired for full logout.
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
 * @property {() => void} reportRefreshRequiredVisible — maps to reconnecting while a refresh cycle is active (tab visible path).
 * @property {(opts?: { offline?: boolean }) => void} reportRefreshStarting
 * @property {(reason?: string) => void} reportRefreshOk
 * @property {(reason?: string) => void} reportSessionMissingDuringReconnect
 * @property {(reason?: string) => void} markManualLogoutReset — resets health after intentional sign-out (clears reconnect flicker).
 */

/**
 * Single composition root for session lifecycle. {@link SessionAuthority} is the only layer that
 * should apply session health transitions, realtime recovery signals, refresh escalation, or terminal logout.
 *
 * @param {Parameters<typeof createSessionManager>[0]} deps
 */
export function createSessionOrchestrator(deps) {
  const manager = createSessionManager(deps);

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
    /** Single entry point for session health, refresh, realtime signals, and terminal logout. */
    Authority,
    RefreshManager: manager.RefreshManager,
    RetryController: manager.RefreshQueue,
    ConnectionMonitor: manager.ConnectionManager,
    AuthTransitionManager: manager.AuthTransitionManager,
  };
}
