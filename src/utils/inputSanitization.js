// Allowed Supabase storage buckets. Add new buckets here when provisioned.
export const UPLOAD_BUCKET_ALLOWLIST = new Set([
  "paidly",
  "company-logos",
  "profile-logos",
  "activities",
  "receipts",
  "bank-details",
  "inventory",
  "products-services",
  "invoices",
  "quotes",
  "customers",
  "payroll",
  "private",
]);

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const s = email.trim();
  return s.length > 0 && s.length <= 254 && EMAIL_RE.test(s);
}

export function isValidHttpUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Accepts UUID v4 and URL-path-safe tokens (nanoid, base62, etc.) up to 256 chars.
const TOKEN_RE = /^[a-zA-Z0-9_-]{1,256}$/;

export function isValidShareToken(token) {
  return typeof token === "string" && TOKEN_RE.test(token);
}

export function sanitizeText(str, maxLen) {
  if (str == null) return "";
  const s = String(str).trim();
  return maxLen != null ? s.slice(0, maxLen) : s;
}
