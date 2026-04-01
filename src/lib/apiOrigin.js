/**
 * Resolve API base URL for browser requests in production.
 *
 * When VITE_SERVER_URL is https://www.example.com but the user is on https://example.com,
 * absolute requests hit another origin → CORS failures even though the same Vercel app serves both.
 * Returning "" means same-origin (/api/..., /affiliate/...).
 *
 * When the API is on a different host (e.g. api.example.com), returns the configured base — server must send CORS.
 *
 * @param {string} configuredServerUrl - Normalized VITE_SERVER_URL (no trailing slash), e.g. https://www.paidly.co.za
 * @returns {string} Same-origin "" or full base URL
 */
export function resolveProductionBrowserApiBaseUrl(configuredServerUrl) {
  if (!import.meta.env.PROD) return "";
  const raw = String(import.meta.env.VITE_SERVER_URL ?? "").trim();
  if (!raw) return "";

  const base = String(configuredServerUrl ?? "").replace(/\/$/, "");
  let apiHost;
  try {
    apiHost = new URL(base).hostname;
  } catch {
    return "";
  }

  if (typeof window === "undefined" || !window.location?.hostname) {
    return base;
  }

  const pageHost = window.location.hostname;
  if (apiHost === pageHost) return base;

  const stripWww = (h) => h.replace(/^www\./i, "");
  if (stripWww(apiHost) === stripWww(pageHost)) {
    return "";
  }

  return base;
}
