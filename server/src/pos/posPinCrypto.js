import crypto from "node:crypto";
import { promisify } from "node:util";
import {
  isPosPinLocked,
  nextPosPinLockUntil,
  normalizePosPin,
  POS_PIN_MAX_ATTEMPTS,
  publicPosPinState,
} from "../../../shared/pos/posPin.js";

const scryptAsync = promisify(crypto.scrypt);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const HASH_PREFIX = "scrypt";

/**
 * @param {string} pin
 * @returns {Promise<string>}
 */
export async function hashPosPin(pin) {
  const normalized = normalizePosPin(pin);
  if (!normalized.ok) {
    const err = new Error(normalized.error);
    err.status = 422;
    err.code = normalized.code;
    throw err;
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(normalized.pin, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `${HASH_PREFIX}$${salt}$${Buffer.from(derived).toString("hex")}`;
}

/**
 * @param {string} pin
 * @param {string | null | undefined} storedHash
 */
export async function verifyPosPinHash(pin, storedHash) {
  const hash = String(storedHash || "");
  const parts = hash.split("$");
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const normalized = normalizePosPin(pin);
  if (!normalized.ok) return false;
  let derived;
  try {
    derived = await scryptAsync(normalized.pin, salt, KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });
  } catch {
    return false;
  }
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(derived);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Apply a failed attempt. Returns patch fields for memberships update.
 * @param {{ pos_pin_failed_attempts?: number } | null | undefined} row
 * @param {Date} [now]
 */
export function failedPosPinAttemptPatch(row, now = new Date()) {
  const attempts = Math.max(0, Number(row?.pos_pin_failed_attempts) || 0) + 1;
  const lockedUntil = nextPosPinLockUntil(attempts, now);
  return {
    pos_pin_failed_attempts: attempts,
    pos_pin_locked_until: lockedUntil,
    locked: Boolean(lockedUntil),
    attempts,
    maxAttempts: POS_PIN_MAX_ATTEMPTS,
  };
}

export function successPosPinAttemptPatch() {
  return {
    pos_pin_failed_attempts: 0,
    pos_pin_locked_until: null,
  };
}

export function clearPosPinPatch() {
  return {
    pos_pin_hash: null,
    pos_pin_updated_at: null,
    pos_pin_failed_attempts: 0,
    pos_pin_locked_until: null,
  };
}

export { isPosPinLocked, normalizePosPin, publicPosPinState };
