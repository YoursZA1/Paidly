import { createHash, timingSafeEqual } from "node:crypto";

/**
 * PayFast **Custom Integration** checkout signature (not the REST API signature).
 *
 * Official spec: https://developers.payfast.co.za/documentation/
 *
 * 1. Non-blank fields only, in the **attribute-description order** below
 *    (do NOT alphabetically sort — that is the API signature format).
 * 2. PHP `urlencode` of trimmed values (spaces → `+`, percent-hex uppercase).
 * 3. Join with `&`.
 * 4. If passphrase is set: append `&passphrase=` + urlencoded passphrase.
 * 5. MD5 hex (lowercase).
 *
 * Recurring Billing (subscriptions) **requires** a merchant passphrase.
 */

/**
 * Canonical checkout field order from PayFast Custom Integration
 * “attributes description” (merchant → customer → transaction → options →
 * payment method → recurring). Only submitted non-blank fields are signed.
 */
export const PAYFAST_CHECKOUT_FIELD_ORDER = Object.freeze([
  // Merchant details
  "merchant_id",
  "merchant_key",
  "return_url",
  "cancel_url",
  "notify_url",
  "fica_idnumber",
  // Customer details
  "name_first",
  "name_last",
  "email_address",
  "cell_number",
  // Transaction details
  "m_payment_id",
  "amount",
  "item_name",
  "item_description",
  "custom_int1",
  "custom_int2",
  "custom_int3",
  "custom_int4",
  "custom_int5",
  "custom_str1",
  "custom_str2",
  "custom_str3",
  "custom_str4",
  "custom_str5",
  // Transaction options
  "email_confirmation",
  "confirmation_address",
  // Payment methods
  "payment_method",
  // Recurring Billing — subscriptions
  "subscription_type",
  "billing_date",
  "recurring_amount",
  "frequency",
  "cycles",
  "subscription_notify_email",
  "subscription_notify_webhook",
  "subscription_notify_buyer",
]);

/**
 * PHP `urlencode` (RFC 1738): spaces as `+`, remaining percent-encoding uppercase.
 * Do not use raw `encodeURIComponent` (spaces become `%20`; `!'()*` stay unescaped).
 */
export function payfastPhpUrlEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function trimFieldValue(value) {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

function isBlankPayfastValue(value) {
  return trimFieldValue(value) === "";
}

function md5Hex(text) {
  return createHash("md5").update(String(text), "utf8").digest("hex");
}

function timingSafeHexEqual(a, b) {
  const left = String(a || "").trim().toLowerCase();
  const right = String(b || "").trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(left) || !/^[a-f0-9]{32}$/.test(right)) return false;
  try {
    return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Build an insertion-ordered field map in PayFast checkout order.
 * Drops blank/null values and `signature`. Does not mutate `input`.
 *
 * @param {Record<string, unknown>} input
 * @returns {Record<string, string>}
 */
export function orderPayfastCheckoutFields(input) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  /** @type {Record<string, string>} */
  const ordered = {};
  for (const key of PAYFAST_CHECKOUT_FIELD_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    if (key === "signature") continue;
    if (isBlankPayfastValue(src[key])) continue;
    ordered[key] = trimFieldValue(src[key]);
  }
  return ordered;
}

/**
 * Parameter string used for the checkout MD5 (passphrase redacted when `redactPassphrase`).
 *
 * @param {Record<string, string>} orderedFields
 * @param {string} [passphrase]
 * @param {{ redactPassphrase?: boolean }} [opts]
 */
export function buildPayfastCheckoutParamString(orderedFields, passphrase, opts = {}) {
  const parts = [];
  for (const key of PAYFAST_CHECKOUT_FIELD_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(orderedFields, key)) continue;
    parts.push(`${key}=${payfastPhpUrlEncode(orderedFields[key])}`);
  }
  let paramString = parts.join("&");
  const pass = passphrase != null ? String(passphrase).trim() : "";
  if (pass) {
    const encodedPass = opts.redactPassphrase ? "[REDACTED]" : payfastPhpUrlEncode(pass);
    paramString += `&passphrase=${encodedPass}`;
  }
  return paramString;
}

/**
 * Generate a PayFast Custom Integration checkout signature.
 * Ignores `signature` on the input. Blank fields are omitted.
 *
 * @param {Record<string, unknown>} data
 * @param {string} [passphrase]
 * @returns {string} lowercase MD5 hex
 */
export function generatePayFastSignature(data, passphrase) {
  const ordered = orderPayfastCheckoutFields(data);
  const paramString = buildPayfastCheckoutParamString(ordered, passphrase, { redactPassphrase: false });
  return md5Hex(paramString);
}

/**
 * Safe sandbox/dev diagnostic. Never includes the passphrase or merchant_key values.
 *
 * @param {Record<string, unknown>} data
 * @param {string} [passphrase]
 */
export function describePayfastCheckoutSignature(data, passphrase) {
  const ordered = orderPayfastCheckoutFields(data);
  const included = Object.keys(ordered);
  const encodedPairs = included.map((key) => ({
    name: key,
    included: true,
    encoded:
      key === "merchant_key"
        ? "[REDACTED]"
        : payfastPhpUrlEncode(ordered[key]),
  }));
  const passSet = Boolean(passphrase && String(passphrase).trim());
  return {
    includedFields: included,
    encodedPairs,
    passphraseAppended: passSet,
    paramStringRedacted: buildPayfastCheckoutParamString(ordered, passSet ? "x" : "", {
      redactPassphrase: true,
    }),
    signature: generatePayFastSignature(data, passphrase),
  };
}

/**
 * Verify a PayFast ITN signature.
 *
 * ITN is related to checkout signing but is **not** rebuilt in checkout
 * attribute order: PayFast hashes posted fields in **received order**,
 * excluding `signature`, using PHP `urlencode`, then appends passphrase.
 * Empty posted values are included (checkout omits blanks).
 *
 * @param {Record<string, unknown>} payload
 * @param {string} [passphrase]
 * @param {{ fieldOrder?: string[] }} [opts]
 */
export function verifyPayFastITNSignature(payload, passphrase, opts = {}) {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return false;
  const incoming = String(payload.signature || "").trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(incoming)) return false;

  const order =
    Array.isArray(opts.fieldOrder) && opts.fieldOrder.length > 0
      ? opts.fieldOrder
      : Object.keys(payload);

  const parts = [];
  for (const key of order) {
    if (key === "signature") continue;
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    const raw = payload[key];
    if (raw == null) continue;
    parts.push(`${key}=${payfastPhpUrlEncode(String(raw))}`);
  }

  let paramString = parts.join("&");
  const pass = passphrase != null ? String(passphrase).trim() : "";
  if (pass) {
    paramString += `&passphrase=${payfastPhpUrlEncode(pass)}`;
  }

  return timingSafeHexEqual(incoming, md5Hex(paramString));
}

/**
 * Attach `signature` last. Returns a new object; input is not mutated.
 *
 * @param {Record<string, unknown>} data
 * @param {string} [passphrase]
 * @returns {{ fields: Record<string, string>, fieldOrder: string[], signature: string }}
 */
export function signPayfastCheckoutFields(data, passphrase) {
  const ordered = orderPayfastCheckoutFields(data);
  const signature = generatePayFastSignature(ordered, passphrase);
  const fieldOrder = [...Object.keys(ordered), "signature"];
  return {
    fields: { ...ordered, signature },
    fieldOrder,
    signature,
  };
}
