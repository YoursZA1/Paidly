import { trackSessionTelemetry } from "@/lib/sessionTelemetry";

/**
 * DOM {@link CustomEvent#type} for wake recovery — one authoritative lifecycle vocabulary.
 * Subscribers: telemetry (all), reconnect escalation (FAILED), overlay (ENDED/FAILED). Store resync uses **`paidly:wake-recovery-resync`** after unlock (see AuthProvider `finally`).
 */
export const WakeRecoveryLifecycleEventType = Object.freeze({
  STARTED: "paidly:wake-recovery-started",
  SUCCEEDED: "paidly:wake-recovery-succeeded",
  FAILED: "paidly:wake-recovery-failed",
  ENDED: "paidly:wake-recovery-ended",
});

/** Stable string labels for payloads / analytics (matches product language for lifecycle). */
export const WakeRecoveryLifecyclePhase = Object.freeze({
  WAKE_RECOVERY_STARTED: "WAKE_RECOVERY_STARTED",
  WAKE_RECOVERY_SUCCEEDED: "WAKE_RECOVERY_SUCCEEDED",
  WAKE_RECOVERY_FAILED: "WAKE_RECOVERY_FAILED",
  WAKE_RECOVERY_ENDED: "WAKE_RECOVERY_ENDED",
});

/**
 * @param {string} type — {@link WakeRecoveryLifecycleEventType} value
 * @param {unknown} [detail]
 */
export function dispatchWakeRecoveryLifecycleEvent(type, detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

/**
 * Telemetry for the full wake funnel. Subscribers that need reconnect escalation should listen for
 * {@link WakeRecoveryLifecycleEventType.FAILED} (authority effects stay in {@link runWakeRecoveryPipeline} / AuthProvider).
 *
 * @returns {() => void} unsubscribe
 */
export function installWakeRecoveryLifecycleTelemetry() {
  if (typeof window === "undefined") return () => {};

  /** @param {WakeRecoveryLifecyclePhase[keyof typeof WakeRecoveryLifecyclePhase]} phase */
  const track = (phase, extra = {}) => {
    trackSessionTelemetry("wake_recovery_lifecycle", { lifecycle_phase: phase, ...extra });
  };

  const onStarted = (e) => {
    track(WakeRecoveryLifecyclePhase.WAKE_RECOVERY_STARTED, {
      trigger_reason: e.detail && typeof e.detail === "object" ? e.detail.reason : undefined,
    });
  };

  const onSucceeded = () => {
    track(WakeRecoveryLifecyclePhase.WAKE_RECOVERY_SUCCEEDED);
  };

  const onFailed = (e) => {
    const reason = e.detail;
    track(WakeRecoveryLifecyclePhase.WAKE_RECOVERY_FAILED, {
      failure_reason: reason != null ? String(reason) : undefined,
    });
  };

  const onEnded = (e) => {
    track(WakeRecoveryLifecyclePhase.WAKE_RECOVERY_ENDED, {
      trigger_reason: e.detail && typeof e.detail === "object" ? e.detail.reason : undefined,
    });
  };

  window.addEventListener(WakeRecoveryLifecycleEventType.STARTED, onStarted);
  window.addEventListener(WakeRecoveryLifecycleEventType.SUCCEEDED, onSucceeded);
  window.addEventListener(WakeRecoveryLifecycleEventType.FAILED, onFailed);
  window.addEventListener(WakeRecoveryLifecycleEventType.ENDED, onEnded);

  return () => {
    window.removeEventListener(WakeRecoveryLifecycleEventType.STARTED, onStarted);
    window.removeEventListener(WakeRecoveryLifecycleEventType.SUCCEEDED, onSucceeded);
    window.removeEventListener(WakeRecoveryLifecycleEventType.FAILED, onFailed);
    window.removeEventListener(WakeRecoveryLifecycleEventType.ENDED, onEnded);
  };
}
