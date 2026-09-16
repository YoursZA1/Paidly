// @ts-check

/**
 * POS PIN contract. Distinct from Paidly Auth password.
 * Hashing lives on the server (scrypt); this module is pure validation + lockout math.
 */

export const POS_PIN_MIN_LENGTH = 4;
export const POS_PIN_MAX_LENGTH = 8;
export const POS_PIN_MAX_ATTEMPTS = 5;
export const POS_PIN_LOCKOUT_MS = 15 * 60 * 1000;

/**
 * @param {unknown} raw
 * @returns {{ ok: true, pin: string } | { ok: false, error: string, code: string }}
 */
export function normalizePosPin(raw) {
  const pin = String(raw ?? "").trim();
  if (!/^\d+$/.test(pin)) {
    return { ok: false, error: "POS PIN must be digits only", code: "POS_PIN_FORMAT" };
  }
  if (pin.length < POS_PIN_MIN_LENGTH || pin.length > POS_PIN_MAX_LENGTH) {
    return {
      ok: false,
      error: `POS PIN must be ${POS_PIN_MIN_LENGTH}–${POS_PIN_MAX_LENGTH} digits`,
      code: "POS_PIN_LENGTH",
    };
  }
  return { ok: true, pin };
}

/**
 * @param {{ pos_pin_locked_until?: unknown } | null | undefined} row
 * @param {Date} [now]
 */
export function isPosPinLocked(row, now = new Date()) {
  const until = row?.pos_pin_locked_until ? new Date(row.pos_pin_locked_until).getTime() : NaN;
  return Number.isFinite(until) && until > now.getTime();
}

/**
 * @param {number} failedAttempts
 * @param {Date} [now]
 */
export function nextPosPinLockUntil(failedAttempts, now = new Date()) {
  if (failedAttempts < POS_PIN_MAX_ATTEMPTS) return null;
  return new Date(now.getTime() + POS_PIN_LOCKOUT_MS).toISOString();
}

/**
 * Public POS PIN state for API responses — never includes hash or plaintext.
 * @param {{ pos_pin_hash?: unknown, pos_pin_locked_until?: unknown } | null | undefined} row
 * @param {Date} [now]
 */
export function publicPosPinState(row, now = new Date()) {
  return {
    pos_pin_set: Boolean(row?.pos_pin_hash),
    pos_pin_locked: isPosPinLocked(row, now),
  };
}
