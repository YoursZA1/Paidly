import { sanitizeEmailHtmlContent } from "./sanitizeHtmlStrings.js";

/**
 * Strict validation / sanitization for HTTP inputs (defense in depth; Supabase uses parameterized queries).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Tracking tokens we generate are UUID-shaped; allow that or a safe opaque slug. */
const TRACKING_TOKEN_RE = /^[a-zA-Z0-9_-]{16,128}$/;

const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidUuid(value) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const t = value.trim().toLowerCase();
  if (t.length < 3 || t.length > EMAIL_MAX) return false;
  if (!EMAIL_RE.test(t)) return false;
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(t)) return false;
  return true;
}

export function isValidTrackingToken(value) {
  if (typeof value !== "string") return false;
  const t = value.trim();
  return UUID_RE.test(t) || TRACKING_TOKEN_RE.test(t);
}

/**
 * @param {string} value
 * @param {number} maxLen
 */
export function sanitizeOneLine(value, maxLen = 500) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .trim()
    .slice(0, maxLen);
}

/**
 * HTML for outbound email (`/api/send-email`, etc.): length cap + `sanitize-html` allowlist (XSS).
 * @param {string} html
 * @param {number} maxLen
 */
export function sanitizeEmailHtmlBody(html, maxLen = 500_000) {
  if (typeof html !== "string") return "";
  const s = html.replace(/\0/g, "").slice(0, maxLen);
  return sanitizeEmailHtmlContent(s);
}

/**
 * @param {string} base64
 * @param {{ maxDecodedBytes?: number }} [opts]
 */
export function validateBase64Pdf(base64, opts = {}) {
  const maxDecodedBytes = opts.maxDecodedBytes ?? 12 * 1024 * 1024;
  if (typeof base64 !== "string") {
    return { ok: false, error: "Invalid document payload" };
  }
  const trimmed = base64.replace(/\s/g, "");
  if (trimmed.length === 0) {
    return { ok: false, error: "Empty document" };
  }
  const approxDecoded = Math.floor((trimmed.length * 3) / 4);
  if (approxDecoded > maxDecodedBytes) {
    return { ok: false, error: "Document too large" };
  }
  let buf;
  try {
    buf = Buffer.from(trimmed, "base64");
  } catch {
    return { ok: false, error: "Invalid document encoding" };
  }
  if (buf.length > maxDecodedBytes) {
    return { ok: false, error: "Document too large" };
  }
  if (buf.length < 5 || buf.slice(0, 5).toString("ascii") !== "%PDF-") {
    return { ok: false, error: "File must be a PDF" };
  }
  return { ok: true };
}

/**
 * @param {unknown} value
 * @param {{ min?: number, max?: number }} [opts]
 */
export function assertFiniteAmount(value, opts = {}) {
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  const min = opts.min ?? 0;
  const max = opts.max ?? 1_000_000_000;
  if (!Number.isFinite(n) || n < min || n > max) {
    return { ok: false, error: "Invalid amount" };
  }
  return { ok: true, value: n };
}

/**
 * @param {unknown} url
 * @param {{ allowHosts?: string[] }} [opts] — if set, hostname must match one (lowercase)
 */
export function isSafeHttpUrl(url, opts = {}) {
  if (typeof url !== "string") return false;
  const t = url.trim();
  if (t.length === 0 || t.length > 2048) return false;
  let u;
  try {
    u = new URL(t);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (opts.allowHosts?.length) {
    const host = u.hostname.toLowerCase();
    return opts.allowHosts.some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`));
  }
  return true;
}

export const PASSWORD_MAX_BYTES = 1024;

export function isReasonablePasswordLength(password) {
  if (typeof password !== "string") return false;
  return password.length > 0 && password.length <= PASSWORD_MAX_BYTES;
}

/**
 * Minimum baseline password strength for account creation.
 * Sign-in keeps compatibility with existing accounts; sign-up and password updates should use this.
 */
export function isStrongPassword(password) {
  if (typeof password !== "string") return false;
  if (password.length < 12 || password.length > 256) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  return hasUpper && hasLower && hasDigit && hasSymbol;
}

/**
 * @param {string} [invitedByUserId] — auth user id of the teammate who sent the invite (stored in invitee user_metadata).
 */
export function sanitizeInviteMetadata(fullName, role, plan, invitedByUserId) {
  const out = {
    full_name: sanitizeOneLine(typeof fullName === "string" ? fullName : "", 200),
    role: sanitizeOneLine(typeof role === "string" ? role : "user", 32),
    plan: sanitizeOneLine(typeof plan === "string" ? plan : "free", 64),
  };
  if (typeof invitedByUserId === "string") {
    const id = invitedByUserId.trim().toLowerCase();
    if (isValidUuid(id)) {
      out.invited_by = id;
    }
  }
  return out;
}

/** PayFast custom fields: printable ASCII, bounded length (avoid log/DB injection noise). */
export function sanitizePayfastCustomField(value, maxLen = 255) {
  if (value === undefined || value === null) return "";
  const s = String(value).replace(/\0/g, "");
  return s.replace(/[^\x20-\x7e]/g, "").slice(0, maxLen);
}

/** Supabase sign-up user_metadata: string-safe shallow object, bounded size. */
export function sanitizeSignUpUserMetadata(raw) {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  let budget = 16384;
  const keys = Object.keys(raw);
  for (let i = 0; i < keys.length && i < 48; i += 1) {
    const k0 = keys[i];
    const key = String(k0).replace(/[^\w.-]/g, "").slice(0, 64);
    if (!key) continue;
    const v = raw[k0];
    let sv;
    if (typeof v === "string") {
      sv = sanitizeOneLine(v, 2000);
    } else if (typeof v === "number" && Number.isFinite(v)) {
      sv = String(v).slice(0, 64);
    } else if (typeof v === "boolean") {
      sv = v ? "true" : "false";
    } else {
      continue;
    }
    out[key] = sv;
    budget -= key.length + sv.length;
    if (budget <= 0) break;
  }
  return out;
}

const SUBSCRIPTION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidSubscriptionId(value) {
  return typeof value === "string" && SUBSCRIPTION_ID_RE.test(value.trim());
}

/** Max size for HTML/CSS sent to Anvil (HTML → PDF). */
const HTML_PDF_HTML_MAX = 10 * 1024 * 1024;
const HTML_PDF_CSS_MAX = 6 * 1024 * 1024;

/** e.g. 60px, 12mm, or plain number */
const HTML_PDF_MARGIN_RE = /^(?:[\d.]+(?:px|mm|cm|in|%)|[\d.]+)$/i;

/**
 * Strip scripts/event handlers; cap length (Anvil payload).
 * @param {unknown} html
 * @param {number} [maxLen]
 */
export function sanitizeHtmlForPdf(html, maxLen = HTML_PDF_HTML_MAX) {
  if (typeof html !== "string") return "";
  let s = html.replace(/\0/g, "").slice(0, maxLen);
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/javascript:/gi, "blocked:");
  return s;
}

/**
 * @param {unknown} css
 * @param {number} [maxLen]
 */
export function sanitizeCssForPdf(css, maxLen = HTML_PDF_CSS_MAX) {
  if (typeof css !== "string") return "";
  return css.replace(/\0/g, "").slice(0, maxLen);
}

/**
 * @param {unknown} title
 */
export function sanitizeHtmlPdfTitle(title) {
  return sanitizeOneLine(typeof title === "string" ? title : "", 200) || "Document";
}

/**
 * Anvil `page` margins (string + unit only).
 * @param {unknown} page
 */
export function normalizeHtmlPdfPageMargins(page) {
  const defaults = { marginLeft: "60px", marginRight: "60px" };
  if (!page || typeof page !== "object" || Array.isArray(page)) {
    return defaults;
  }
  const out = { ...defaults };
  for (const key of ["marginLeft", "marginRight", "marginTop", "marginBottom"]) {
    const v = page[key];
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t.length <= 32 && HTML_PDF_MARGIN_RE.test(t)) {
      out[key] = t;
    }
  }
  return out;
}
