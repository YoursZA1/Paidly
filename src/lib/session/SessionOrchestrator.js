import { createSessionManager } from "@/lib/session/SessionManager";

/**
 * Central session composition root.
 * Keeps auth, refresh, realtime, retry, connection and visibility recovery under one orchestrator.
 */
export function createSessionOrchestrator(deps) {
  const manager = createSessionManager(deps);
  const visibilityRecoveryManager = {
    onOffline: (reason = "offline") => manager.VisibilityManager.onOffline(reason),
    onReconnectReason: (reason = "background_sync") =>
      manager.BackgroundSyncManager.onReconnectReason(reason),
  };

  // Canonical orchestrator surface
  return {
    AuthStateMachine: manager.AuthManager,
    RefreshManager: manager.RefreshManager,
    RealtimeManager: manager.RealtimeManager,
    RetryController: manager.RefreshQueue,
    ConnectionMonitor: manager.ConnectionManager,
    VisibilityRecoveryManager: visibilityRecoveryManager,
    HealthMonitor: manager.HealthMonitor,
    AuthTransitionManager: manager.AuthTransitionManager,
  };
}

