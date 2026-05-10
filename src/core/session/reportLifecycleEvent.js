import { getConnectionLifecycleManager } from "@/lib/connection/connectionLifecycleRegistry";
import { LifecycleSignalType } from "@/lib/connection/lifecycleSignalTypes";
import { trackSessionTelemetry } from "@/lib/sessionTelemetry";
import { LifecycleEventType } from "@/core/session/lifecycleTypes";

/**
 * Single **semantic** ingress for subsystem authors: report facts; {@link createConnectionLifecycleManager}
 * + Session Authority decide effects (reconnect vs terminal auth).
 *
 * Prefer this over ad-hoc `transitionToExpired` / `markReconnecting` scattered in feature code when adding new call sites.
 * Existing code may still use `connectionLifecycle.report({ type: ... })` — both paths should converge here over time.
 *
 * @param {import('@/core/session/lifecycleTypes').LifecycleEvent} event
 * @returns {void}
 */
export function reportLifecycleEvent(event) {
  const type = event?.type;
  if (!type) return;

  trackSessionTelemetry("lifecycle_event", {
    lifecycle_event_type: type,
    ...(event.payload && typeof event.payload === "object" ? event.payload : {}),
  });

  const clm = getConnectionLifecycleManager();
  if (!clm) {
    if (import.meta.env?.DEV) {
      console.warn("[reportLifecycleEvent] no ConnectionLifecycleManager registered", type);
    }
    return;
  }

  const p = event.payload && typeof event.payload === "object" ? event.payload : {};

  switch (type) {
    case LifecycleEventType.NETWORK_OFFLINE:
      clm.reportNetworkState(false, /** @type {string} */ (p.reason) || "offline");
      break;
    case LifecycleEventType.NETWORK_ONLINE:
      clm.reportNetworkState(true, /** @type {string} */ (p.reason) || undefined);
      break;

    case LifecycleEventType.VISIBILITY_HIDDEN:
      clm.reportVisibilityState("hidden", typeof p.hiddenAt === "number" ? p.hiddenAt : Date.now());
      break;
    case LifecycleEventType.VISIBILITY_VISIBLE:
      clm.reportVisibilityState("visible");
      break;

    case LifecycleEventType.TOKEN_REFRESH_SUCCESS:
      clm.reportRefreshOk(/** @type {string} */ (p.reason) || "refresh_ok");
      break;
    case LifecycleEventType.TOKEN_REFRESH_FAILED:
      clm.markReconnecting(/** @type {string} */ (p.reason) || "refresh_failed");
      break;
    case LifecycleEventType.TOKEN_REFRESH_SKIPPED:
      clm.report({
        type: LifecycleSignalType.REFRESH_SKIPPED,
        reason: p.reason != null ? String(p.reason) : undefined,
      });
      break;
    case LifecycleEventType.TOKEN_REFRESH_RETRYING:
      clm.report({
        type: LifecycleSignalType.REFRESH_RETRYING,
        reason: p.reason != null ? String(p.reason) : undefined,
      });
      break;
    case LifecycleEventType.TOKEN_REFRESH_FATAL:
      void clm.handleRefreshFatal(/** @type {string} */ (p.reason) || "refresh_token_invalid");
      break;

    case LifecycleEventType.REALTIME_CONNECTED:
      clm.report({ type: LifecycleSignalType.REALTIME_SUBSCRIBED });
      break;
    case LifecycleEventType.REALTIME_DISCONNECTED:
      clm.report({
        type: LifecycleSignalType.REALTIME_DISCONNECTED,
        status: p.status != null ? String(p.status) : "CLOSED",
        believedSignedIn: Boolean(p.believedSignedIn),
      });
      break;
    case LifecycleEventType.REALTIME_STALE:
      clm.reportRealtimeUnstable(/** @type {string} */ (p.reason) || "realtime_stale");
      break;

    case LifecycleEventType.SESSION_MISSING:
      clm.reportSessionMissingDuringReconnect();
      break;
    case LifecycleEventType.SESSION_RECOVERED:
      clm.markConnected(/** @type {string} */ (p.reason) || "session_recovered");
      break;

    case LifecycleEventType.WAKE_DETECTED:
      clm.reportRecoveryWake("wake_recovery", {
        blockingMutations: p.blockingMutations !== false,
        reason: p.reason != null ? String(p.reason) : "wake",
      });
      break;

    case LifecycleEventType.USER_ACTIVITY:
    case LifecycleEventType.USER_IDLE:
      break;

    case LifecycleEventType.RECOVERY_STARTED:
      clm.reportRecoveryWake(p.phase != null ? String(p.phase) : "recovering", {
        blockingMutations: Boolean(p.blockingMutations),
        reason: p.reason != null ? String(p.reason) : null,
      });
      break;
    case LifecycleEventType.RECOVERY_COMPLETED:
      clm.reportRecoveryWake("idle", { blockingMutations: false, reason: null });
      break;
    case LifecycleEventType.RECOVERY_FAILED:
      clm.markReconnecting(/** @type {string} */ (p.reason) || "recovery_failed");
      break;

    default:
      if (import.meta.env?.DEV) {
        console.warn("[reportLifecycleEvent] unmapped event type", type);
      }
  }
}
