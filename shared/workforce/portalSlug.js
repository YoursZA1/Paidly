// @ts-check

/**
 * Employee portal URL: /employee/<portal_slug>. Mirrors the SQL rules in
 * supabase/migrations/20260928140000_employee_portal_slug.sql (is_valid_portal_slug / slugify_portal_name).
 *
 * The slug identifies WHICH workforce portal — it is never authentication. Access is decided server-side
 * from the signed-in user's active membership in that org (resolve_my_workforce_portal / X-Paidly-Portal).
 */

export const PORTAL_SLUG_MIN = 3;
export const PORTAL_SLUG_MAX = 48;
export const PORTAL_SLUG_HEADER = "x-paidly-portal";

export const RESERVED_PORTAL_SLUGS = Object.freeze(
  new Set([
    "admin", "administrator", "login", "logout", "signin", "sign-in", "signup", "sign-up", "register",
    "api", "settings", "invite", "invites", "join", "activate", "activation", "verify", "reset",
    "password", "forgot-password", "auth", "oauth", "callback", "account", "accounts", "me", "profile",
    "pos", "till", "dashboard", "app", "portal", "employee", "employees", "staff", "team", "workforce",
    "payroll", "payslip", "payslips", "leave", "billing", "subscription", "support", "help", "paidly",
    "www", "static", "assets", "public", "new", "edit", "delete", "null", "undefined", "root", "system",
    "test", "demo", "status", "security",
  ])
);

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A slug must never look like an internal id. */
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** @param {unknown} raw */
export function normalizePortalSlug(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

/** @param {unknown} raw */
export function isReservedPortalSlug(raw) {
  return RESERVED_PORTAL_SLUGS.has(normalizePortalSlug(raw));
}

/**
 * Valid public portal slug (lowercase, URL-safe, 3–48 chars, single hyphens, not reserved).
 * @param {unknown} raw
 */
export function isValidPortalSlug(raw) {
  if (typeof raw !== "string") return false;
  const slug = raw;
  return (
    slug.length >= PORTAL_SLUG_MIN &&
    slug.length <= PORTAL_SLUG_MAX &&
    SLUG_RE.test(slug) &&
    !UUID_LIKE_RE.test(slug) &&
    !RESERVED_PORTAL_SLUGS.has(slug)
  );
}

/**
 * Base slug from a business name (uniqueness/reserved suffixing happens in the database).
 * "Padosio" → "padosio"; "Café Zoë & Co." → "cafe-zoe-co".
 * @param {unknown} name
 */
export function slugifyPortalName(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/**
 * Public portal URL. Contains only the slug — never ids, tokens or emails.
 * @param {unknown} slug
 * @param {string} [origin]
 */
export function employeePortalPath(slug, origin = "") {
  const clean = normalizePortalSlug(slug);
  if (!isValidPortalSlug(clean)) return "";
  const path = `/employee/${clean}`;
  const base = String(origin || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

/**
 * Portal slug from `/employee/<slug>` (or "" when the path is not a valid portal URL).
 * @param {unknown} pathname
 */
export function portalSlugFromPath(pathname) {
  const m = String(pathname || "").match(/^\/employee\/([^/?#]+)\/?$/i);
  if (!m) return "";
  let seg = "";
  try {
    seg = decodeURIComponent(m[1]);
  } catch {
    return "";
  }
  const slug = normalizePortalSlug(seg);
  return isValidPortalSlug(slug) ? slug : "";
}

/**
 * Portal slug sent by the SPA on API calls made inside an employee portal (header `X-Paidly-Portal`).
 * Header present but empty/invalid → slug "" (the server must then DENY, never fall back to another business).
 * @param {{ headers?: Record<string, unknown> } | null | undefined} req
 * @returns {{ present: boolean, slug: string }}
 */
export function portalSlugFromRequest(req) {
  const headers = req?.headers || {};
  const raw = headers[PORTAL_SLUG_HEADER] ?? headers["X-Paidly-Portal"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null) return { present: false, slug: "" };
  const slug = normalizePortalSlug(value);
  return { present: true, slug: isValidPortalSlug(slug) ? slug : "" };
}
