/**
 * Which employee portal (/employee/<slug>) this browser TAB is working in. Per-tab (sessionStorage), so a
 * person can run their own business in one tab and their employer's portal in another.
 *
 * NOT authorization. The slug only tells the server/database which workforce the user is attempting to
 * use; every request is still decided by auth.uid() + an active membership in that org (RLS,
 * resolve_my_workforce_portal, server loadCompanyMembership). A forged value can only narrow the user to a
 * business they belong to, or get them denied — it never falls back to another business.
 *
 * Dependency-free on purpose: imported by low-level HTTP clients and the org resolver.
 */
import { isValidPortalSlug, normalizePortalSlug, PORTAL_SLUG_HEADER } from "@shared/workforce/portalSlug.js";

const STORAGE_KEY = "paidly.workforce_portal.v1";
export const PORTAL_CHANGED_EVENT = "paidly:workforce-portal-changed";

/** @returns {string} active portal slug for this tab, or "" (default business context). */
export function getActivePortalSlug() {
  if (typeof sessionStorage === "undefined") return "";
  try {
    const slug = normalizePortalSlug(sessionStorage.getItem(STORAGE_KEY));
    return isValidPortalSlug(slug) ? slug : "";
  } catch {
    return "";
  }
}

/** @param {string} slug */
export function setActivePortalSlug(slug) {
  const clean = normalizePortalSlug(slug);
  if (!isValidPortalSlug(clean)) throw new Error("Invalid portal address");
  try {
    sessionStorage.setItem(STORAGE_KEY, clean);
  } catch {
    /* private mode: portal context lasts for this page only */
  }
  notify(clean);
}

export function clearActivePortalSlug() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notify("");
}

function notify(slug) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(PORTAL_CHANGED_EVENT, { detail: { slug } }));
  } catch {
    /* ignore */
  }
}

/** Cache key suffix so per-user caches never mix the default business with a portal. */
export function portalContextKey() {
  const slug = getActivePortalSlug();
  return slug ? `portal:${slug}` : "default";
}

/**
 * True for Paidly API URLs only (relative `/api/…`, same origin, or the configured API origin) — the portal
 * header is never sent to third parties.
 * @param {RequestInfo | URL | string} input
 */
export function isPaidlyApiUrl(input) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url || "";
  if (!raw) return false;
  if (raw.startsWith("/")) return raw.startsWith("/api/");
  try {
    const url = new URL(raw);
    if (!url.pathname.startsWith("/api/")) return false;
    const origins = new Set();
    if (typeof window !== "undefined" && window.location?.origin) origins.add(window.location.origin);
    const server = String(import.meta.env?.VITE_SERVER_URL || "").trim();
    if (server) origins.add(new URL(server).origin);
    return origins.has(url.origin);
  } catch {
    return false;
  }
}

/**
 * Adds `X-Paidly-Portal` to a Paidly API request made inside an employee portal.
 * @param {RequestInfo | URL | string} input
 * @param {HeadersInit | undefined} headers
 * @returns {HeadersInit | undefined}
 */
export function withPortalHeader(input, headers) {
  const slug = getActivePortalSlug();
  if (!slug || !isPaidlyApiUrl(input)) return headers;
  const next = new Headers(headers || {});
  next.set(PORTAL_SLUG_HEADER, slug);
  return next;
}
