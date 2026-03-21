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
const serverUrl = (import.meta.env.VITE_SERVER_URL || "http://localhost:5179").replace(/\/$/, "");
const baseURL = isDev ? "" : serverUrl;

/** Intentional Supabase-only production (no Node API): suppress missing-URL warning; auth stays direct to Supabase. */
const supabaseOnlyProd = import.meta.env.PROD && viteEnvFlag("VITE_SUPABASE_ONLY");

/** Production bundle still points at localhost — email/password auth uses Supabase directly (see SupabaseAuthService). */
export function isProductionBackendUrlLocalhost() {
  return import.meta.env.PROD && /localhost|127\.0\.0\.1/i.test(serverUrl);
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
