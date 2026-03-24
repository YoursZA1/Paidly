/**
 * Axios instance for the backend API (admin sync, health, etc.).
 * In dev: use same origin so Vite proxy forwards /api to VITE_SERVER_URL (avoids CORS, connection to one host).
 * In production: use VITE_SERVER_URL so requests go to the backend host.
 */
import axios from "axios";

function viteEnvFlag(name) {
  const v = String(import.meta.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const isDev = import.meta.env.DEV;

/** Intentional Supabase-only production (no Node API): silence the missing-URL console warning. */
const supabaseOnlyProd = import.meta.env.PROD && viteEnvFlag("VITE_SUPABASE_ONLY");

/**
 * Backend base URL for production Axios calls.
 * We do not infer a default API host from the page URL: misconfigured DNS breaks sign-in. Set VITE_SERVER_URL explicitly (e.g. https://paidly.co.za).
 * (browser shows hostname not found / bogus CORS). Set VITE_SERVER_URL explicitly when the Node API is deployed.
 */
const rawServerUrl = String(import.meta.env.VITE_SERVER_URL ?? "").trim();
const serverUrl = (rawServerUrl || "http://localhost:5179").replace(/\/$/, "");
const baseURL = isDev ? "" : serverUrl;

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
  timeout: 15000,
  withCredentials: true,
});

export function getBackendBaseUrl() {
  return serverUrl;
}
