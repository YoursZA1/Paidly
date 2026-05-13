/**
 * Paidly multiplex Realtime WebSocket lifecycle — explicit phases for observability and guards.
 * When {@link hasPaidlyRealtimeWork} is false, phase is {@link RealtimeConnectionPhase.IDLE}.
 */

/** @typedef {'IDLE'|'CONNECTING'|'CONNECTED'|'STALE'|'REBUILDING'|'FAILED'} RealtimeConnectionPhaseValue */

export const RealtimeConnectionPhase = Object.freeze({
  IDLE: "IDLE",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  STALE: "STALE",
  REBUILDING: "REBUILDING",
  FAILED: "FAILED",
});

/** @type {RealtimeConnectionPhaseValue} */
let phase = RealtimeConnectionPhase.IDLE;
/** @type {string|null} */
let phaseReason = null;
let phaseSinceMs = 0;

function stamp(reason) {
  phaseReason = reason != null ? String(reason) : null;
  phaseSinceMs = Date.now();
}

/**
 * @param {RealtimeConnectionPhaseValue} next
 * @param {string} [reason]
 */
export function setPaidlyRealtimeConnectionPhase(next, reason) {
  phase = next;
  stamp(reason);
}

/** @returns {RealtimeConnectionPhaseValue} */
export function getPaidlyRealtimeConnectionPhase() {
  return phase;
}

/**
 * @returns {{ phase: RealtimeConnectionPhaseValue, reason: string|null, sinceMs: number }}
 */
export function getPaidlyRealtimeConnectionSnapshot() {
  return { phase, reason: phaseReason, sinceMs: phaseSinceMs };
}

/** @internal Vitest */
export function __resetPaidlyRealtimeConnectionMachineForTests() {
  phase = RealtimeConnectionPhase.IDLE;
  phaseReason = null;
  phaseSinceMs = 0;
}
