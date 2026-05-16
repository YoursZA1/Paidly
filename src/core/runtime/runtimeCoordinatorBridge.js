/**
 * Feeds ConnectionLifecycleManager + auth pipeline signals into RuntimeCoordinator.
 * Feed-only in Wave 2 — SessionOrchestrator remains authority for logout/reauth decisions.
 */
import {
  getRuntimeCoordinatorSnapshot,
  subscribeRuntimeCoordinator,
  useRuntimeCoordinator,
} from "@/core/runtime/RuntimeCoordinator";
import { trackSessionTelemetry } from "@/lib/sessionTelemetry";

let telemetryUnsub = null;

export function initRuntimeCoordinatorTelemetry() {
  if (telemetryUnsub) return;
  telemetryUnsub = subscribeRuntimeCoordinator((phase, prev) => {
    trackSessionTelemetry("runtime_phase", { phase, prev });
    if (import.meta.env?.DEV) {
      console.debug("[RuntimeCoordinator]", prev, "→", phase);
    }
  });
}

/**
 * @param {{ type: string } & Record<string, unknown>} signal
 */
export function notifyRuntimeFromLifecycle(signal) {
  const rc = useRuntimeCoordinator.getState();
  switch (signal.type) {
    case "mark_connected":
      if (rc.phase === "RECONNECTING") {
        rc.completeReconnecting(true);
      } else if (rc.phase === "AUTH_RECOVERING") {
        rc.endAuthRecoverySuccess();
      } else if (rc.phase === "BOOTING" || rc.phase === "OFFLINE") {
        rc.setPhase("SESSION_READY");
      }
      break;
    case "mark_reconnecting":
      rc.scheduleReconnecting();
      break;
    case "report_offline":
    case "network_state":
      if (signal.type === "network_state" && signal.online) {
        rc.setOnline(true);
      } else {
        rc.setOnline(false);
      }
      break;
    case "report_refresh_starting":
      rc.beginAuthRecovery();
      break;
    case "report_refresh_ok":
      if (getRuntimeCoordinatorSnapshot().phase === "AUTH_RECOVERING") {
        rc.endAuthRecoverySuccess();
      }
      break;
    case "mark_manual_logout_reset":
      rc.resetForColdStart();
      break;
    default:
      break;
  }
}

/** Auth shell finished initial getSession + profile attempt. */
export function notifyAuthBootstrapComplete() {
  const rc = useRuntimeCoordinator.getState();
  if (rc.phase === "BOOTING") {
    rc.markBootstrapReady();
  }
}

/** Session refresh executor pipeline failed terminally. */
export function notifyAuthRecoveryFatal(message) {
  useRuntimeCoordinator.getState().endAuthRecoveryFatal(message);
}
