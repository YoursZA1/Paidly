/**
 * Axios instance for the backend API (admin sync, health, etc.).
 * In dev: use same origin so Vite proxy forwards /api to VITE_SERVER_URL (avoids CORS, connection to one host).
 * In production: VITE_SERVER_URL, but same-origin when apex vs www would otherwise break CORS (see apiOrigin.js).
 */
import axios from "axios";
import { resolveProductionBrowserApiBaseUrl } from "@/lib/apiOrigin";

function viteEnvFlag(name) {
  const v = String(import.meta.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const isDev = import.meta.env.DEV;

const SKIP_NODE_AUTH_KEY = "paidly_skip_node_auth";

/** After 405/404/501 or transport failure, skip further /api/auth/* attempts until logout. Persist in localStorage so new tabs/sessions do not hit a broken route every time. */
export function rememberNodeAuthUnreachable() {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(SKIP_NODE_AUTH_KEY, "1");
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SKIP_NODE_AUTH_KEY, "1");
    }
  } catch {
    /* ignore */
  }
}

export function clearNodeAuthUnreachable() {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(SKIP_NODE_AUTH_KEY);
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(SKIP_NODE_AUTH_KEY);
    }
  } catch {
    /* ignore */
  }
}

function isNodeAuthRememberedUnreachable() {
  try {
    return (
      (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SKIP_NODE_AUTH_KEY) === "1") ||
      (typeof localStorage !== "undefined" && localStorage.getItem(SKIP_NODE_AUTH_KEY) === "1")
    );
  } catch {
    return false;
  }
}

/** Intentional Supabase-only production (no Node API): silence the missing-URL console warning. */
const supabaseOnlyProd = import.meta.env.PROD && viteEnvFlag("VITE_SUPABASE_ONLY");

/**
 * Backend base URL for production Axios calls.
 * We do not infer a default API host from the page URL: misconfigured DNS breaks sign-in. Set VITE_SERVER_URL explicitly (e.g. https://paidly.co.za).
 * (browser shows hostname not found / bogus CORS). Set VITE_SERVER_URL explicitly when the Node API is deployed.
 */
const rawServerUrl = String(import.meta.env.VITE_SERVER_URL ?? "").trim();
const serverUrl = (rawServerUrl || "http://localhost:5179").replace(/\/$/, "");
const baseURL = isDev ? "" : resolveProductionBrowserApiBaseUrl(serverUrl);

/** Production bundle still points at localhost — email/password auth uses Supabase directly (see SupabaseAuthService). */
export function isProductionBackendUrlLocalhost() {
  return import.meta.env.PROD && /localhost|127\.0\.0\.1/i.test(serverUrl);
}

/**
 * When false, email/password sign-in and sign-up use Supabase only (no POST /api/auth/*).
 * - Production + localhost API URL → false.
 * - VITE_SUPABASE_ONLY=1 → false (production or dev).
 * - Development (Vite): false by default so /api/auth is not hit when `npm run server` is off (no 503 in console).
 *   Set VITE_NODE_AUTH_API=1 when testing the Node auth routes locally with the server running.
 */
export function shouldUseNodeAuthApi() {
  if (isProductionBackendUrlLocalhost()) return false;
  if (viteEnvFlag("VITE_SUPABASE_ONLY")) return false;
  if (isNodeAuthRememberedUnreachable()) return false;
  // In production, prefer direct Supabase auth unless explicitly enabled.
  if (import.meta.env.PROD && !viteEnvFlag("VITE_NODE_AUTH_API")) return false;
  if (isDev && !viteEnvFlag("VITE_NODE_AUTH_API")) return false;
  return true;
}

if (isProductionBackendUrlLocalhost() && !supabaseOnlyProd) {
  console.warn(
    "[Paidly] VITE_SERVER_URL is missing or points to localhost in production. Email/password sign-in uses Supabase directly. Set VITE_SERVER_URL to your API (no trailing slash) for server rate limits, waitlist, and currency — or set VITE_SUPABASE_ONLY=1 if you intentionally omit the Node API."
  );
}

export const backendApi = axios.create({
  baseURL,
  /** Cold serverless / slow mobile networks: 30s avoids spurious timeouts on auth/me and list proxies */
  timeout: 30000,
  withCredentials: true,
});

export function getBackendBaseUrl() {
  return serverUrl;
}

/**
 * Base URL for absolute links to `/api/*` when needed. Prefer same-origin when apex/www matches apiOrigin rules.
 */
export function getPublicApiBase() {
  if (isDev) return "";
  const resolved = resolveProductionBrowserApiBaseUrl(serverUrl);
  if (resolved === "") {
    if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
    return serverUrl;
  }
  if (resolved && !/localhost|127\.0\.0\.1/i.test(resolved)) return resolved;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return serverUrl || "";
}

/**
 * Base URL for Node-only admin routes (e.g. GET /api/admin/platform-users).
 * In production, prefer `VITE_SERVER_URL` when it is a non-localhost URL so requests do not hit the
 * static SPA host (same tab origin) and receive `index.html` instead of JSON.
 */
export function getAdminDataApiBase() {
  if (isDev) return "";
  const raw = String(import.meta.env.VITE_SERVER_URL ?? "").trim().replace(/\/$/, "");
  if (raw && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(raw)) {
    return raw;
  }
  return String(getPublicApiBase()).replace(/\/$/, "");
}
