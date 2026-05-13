/**
 * Structured, grep-friendly logs for Paidly multiplex Realtime.
 * @param {string} event
 * @param {Record<string, unknown>} [fields]
 */
const PRODUCTION_REALTIME_EVENTS = new Set([
  "channel_created",
  "channel_destroyed",
  "auth_rotated",
  "rebuild_success",
  "rebuild_failure",
  "reconnect_suppressed",
  "reconnect_started",
  "reconnect_skipped",
  "stale_channel_detected",
  "timed_out",
  "reconnect_hard_suppress_armed",
  "reconnect_hard_suppress_cleared",
  "transport_cooldown_armed",
  "transport_cooldown_cleared",
  "circuit_breaker_opened",
  "circuit_breaker_cleared",
  "websocket_stabilized",
  "reconnect_attempt_failed",
  "reconnect_backoff_scheduled",
  "reconnect_cooldown",
]);

export function paidlyRealtimeLog(event, fields = {}) {
  const payload = { event, ...fields };
  if (import.meta.env?.DEV) {
    console.info("[PaidlyRealtime]", payload);
    return;
  }
  if (PRODUCTION_REALTIME_EVENTS.has(event)) {
    console.info("[PaidlyRealtime]", payload);
  }
}
