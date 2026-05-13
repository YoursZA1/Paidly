/**
 * Structured, grep-friendly logs for Paidly multiplex Realtime.
 * @param {string} event
 * @param {Record<string, unknown>} [fields]
 */
export function paidlyRealtimeLog(event, fields = {}) {
  const payload = { event, ...fields };
  if (import.meta.env?.DEV) {
    console.info("[PaidlyRealtime]", payload);
    return;
  }
  // Production: keep high-signal lifecycle lines without noisy per-row noise.
  const allow = new Set([
    "channel_created",
    "channel_destroyed",
    "auth_rotated",
    "rebuild_success",
    "rebuild_failure",
    "reconnect_suppressed",
    "stale_channel_detected",
    "timed_out",
  ]);
  if (allow.has(event)) {
    console.info("[PaidlyRealtime]", payload);
  }
}
