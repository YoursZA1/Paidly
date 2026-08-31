/**
 * Structured, grep-friendly logs for Paidly multiplex Realtime.
 * Development only — production must not spam `[PaidlyRealtime]` on reconnects.
 * @param {string} event
 * @param {Record<string, unknown>} [fields]
 */
export function paidlyRealtimeLog(event, fields = {}) {
  if (import.meta.env?.VITEST) return;
  if (!import.meta.env?.DEV) return;
  console.info("[PaidlyRealtime]", { event, ...fields });
}
