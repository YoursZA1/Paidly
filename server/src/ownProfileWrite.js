/**
 * Fields a signed-in user may save on their own profiles row.
 * Plan, role, trial, and subscription columns stay server-managed.
 */
export const OWN_PROFILE_COLUMNS = [
  "full_name",
  "email",
  "avatar_url",
  "logo_url",
  "company_name",
  "company_address",
  "phone",
  "company_website",
  "currency",
  "timezone",
  "invoice_template",
  "invoice_header",
  "business",
  "document_brand_primary",
  "document_brand_secondary",
  "reminder_settings",
  "quote_reminder_settings",
];

const JSON_COLUMNS = new Set(["business", "reminder_settings", "quote_reminder_settings"]);

const LONG_TEXT = new Set(["company_address", "invoice_header", "logo_url", "avatar_url"]);

/**
 * @param {unknown} input
 * @returns {Record<string, unknown>}
 */
export function pickOwnProfilePatch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = /** @type {Record<string, unknown>} */ (input);
  const out = {};
  for (const key of OWN_PROFILE_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    if (JSON_COLUMNS.has(key)) {
      if (value === null) {
        out[key] = null;
        continue;
      }
      if (value && typeof value === "object" && !Array.isArray(value)) out[key] = value;
      continue;
    }
    if (value === null) {
      out[key] = null;
      continue;
    }
    if (typeof value !== "string" && typeof value !== "number") continue;
    const max = LONG_TEXT.has(key) ? 2000 : 500;
    let text = String(value).trim().slice(0, max);
    if (key === "email") text = text.toLowerCase();
    out[key] = text;
  }
  return out;
}

/**
 * When PostgREST says a column is missing, return that column if it is in the patch.
 * @param {string} message
 * @param {Record<string, unknown>} patch
 * @returns {string | null}
 */
export function columnMissingFromWriteError(message, patch) {
  const msg = String(message || "");
  if (!/column|schema cache|does not exist/i.test(msg)) return null;
  const keys = Object.keys(patch || {});
  for (const key of keys) {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${esc}\\b`, "i").test(msg)) return key;
  }
  return null;
}
