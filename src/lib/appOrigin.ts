/**
 * Canonical app origin for redirects, OAuth, and billing links.
 *
 * Production serves the SPA on https://www.paidly.co.za. Legacy env values may still set
 * VITE_APP_URL to https://app.paidly.co.za (308 → www). Post-login redirects to the legacy
 * host break sign-in (extra hop, wrong OAuth redirect_uri, empty session on wrong origin).
 */

/** Hostnames that Vercel redirects to www.paidly.co.za — never use for post-auth navigation. */
const LEGACY_APP_HOSTS = new Set([
  "app.paidly.co.za",
  "www.app.paidly.co.za",
]);

const CANONICAL_WWW_HOST = "www.paidly.co.za";

function readConfiguredAppUrl(): string {
  return (import.meta.env.VITE_APP_URL || "").toString().trim();
}

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Origin to use for dashboard redirects, OAuth callbacks, and billing portal base.
 * Prefers the current page when configured VITE_APP_URL is a legacy host that 308s to www.
 */
export function resolvePaidlyAppOrigin(): string {
  if (typeof window === "undefined") {
    const configured = readConfiguredAppUrl();
    if (!configured) return "";
    try {
      return new URL(configured).origin;
    } catch {
      return "";
    }
  }

  const current = window.location.origin;
  const configured = readConfiguredAppUrl();
  if (!configured) return current;

  let configuredOrigin: string;
  try {
    configuredOrigin = new URL(configured).origin;
  } catch {
    return current;
  }

  if (configuredOrigin === current) return current;

  const configuredHost = hostnameFromUrl(configured);
  const currentHost = window.location.hostname.toLowerCase();

  if (currentHost === CANONICAL_WWW_HOST && configuredHost && LEGACY_APP_HOSTS.has(configuredHost)) {
    return current;
  }

  if (configuredHost === CANONICAL_WWW_HOST && currentHost === "paidly.co.za") {
    return current;
  }

  return configuredOrigin;
}

/**
 * True only when the user must leave the current origin after sign-in (true split-host deploy).
 */
export function shouldRedirectToAppAfterAuth(): boolean {
  if (typeof window === "undefined") return false;
  const target = resolvePaidlyAppOrigin();
  return Boolean(target && window.location.origin !== target);
}

/** Dashboard URL on the effective app origin (no legacy app.* hop). */
export function getAppDashboardUrl(): string {
  const origin = resolvePaidlyAppOrigin();
  const base = (origin || (typeof window !== "undefined" ? window.location.origin : "")).replace(
    /\/$/,
    ""
  );
  return `${base}/Dashboard`;
}

/** OAuth redirect origin — must match Supabase allowlist and stay on the host the user signed in from. */
export function getOAuthRedirectOrigin(): string {
  if (typeof window === "undefined") return "";
  return resolvePaidlyAppOrigin();
}

/** Billing portal base URL (Stripe external URL still wins via VITE_STRIPE_BILLING_PORTAL). */
export function getBillingPortalUrl(): string {
  const portal = (import.meta.env.VITE_STRIPE_BILLING_PORTAL || "").toString().trim();
  if (portal) return portal;
  if (typeof window !== "undefined" && window.location?.origin) {
    return resolvePaidlyAppOrigin();
  }
  const configured = readConfiguredAppUrl();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // ignore
    }
  }
  return "";
}
