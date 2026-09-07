// @ts-check

/**
 * Canonical UUID string. Never a display name, employee number, or email.
 * @typedef {string} Uuid
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * First scalar string from a query/body value (arrays, numbers, null).
 * @param {unknown} value
 * @returns {string}
 */
export function firstQueryString(value) {
  if (Array.isArray(value)) return firstQueryString(value[0]);
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

/**
 * Parse a UUID. Returns null for display labels such as "Name (EMP-002)".
 * @param {unknown} value
 * @returns {Uuid | null}
 */
export function parseUuid(value) {
  const t = firstQueryString(value);
  if (!t || !UUID_RE.test(t)) return null;
  return t;
}

/** @param {unknown} value */
export function isUuid(value) {
  return parseUuid(value) != null;
}

/**
 * True when a value looks like an employee UI label or employee number, not a PK.
 * @param {unknown} value
 */
export function looksLikeEmployeeDisplayLabel(value) {
  const t = firstQueryString(value);
  if (!t || parseUuid(t)) return false;
  return /\(\s*EMP-\d+\s*\)/i.test(t) || /^EMP-\d+$/i.test(t);
}

/**
 * @param {unknown} value
 * @param {string} [fieldName]
 * @returns {Uuid}
 */
export function requireUuid(value, fieldName = "id") {
  const id = parseUuid(value);
  if (id) return id;
  /** @type {Error & { status?: number }} */
  const err = new Error(
    looksLikeEmployeeDisplayLabel(value)
      ? `${fieldName} must be the employee record UUID, not the display name or employee number.`
      : `Invalid ${fieldName}.`
  );
  err.status = 400;
  throw err;
}
