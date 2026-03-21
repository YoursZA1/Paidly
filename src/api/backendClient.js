/**
 * Axios instance for the backend API (admin sync, health, etc.).
 * In dev: use same origin so Vite proxy forwards /api to VITE_SERVER_URL (avoids CORS, connection to one host).
 * In production: use VITE_SERVER_URL so requests go to the backend host.
 */
import axios from "axios";

const isDev = import.meta.env.DEV;
const serverUrl = (import.meta.env.VITE_SERVER_URL || "http://localhost:5179").replace(/\/$/, "");
const baseURL = isDev ? "" : serverUrl;

/** Production bundle still points at localhost — email/password auth uses Supabase directly (see SupabaseAuthService). */
export function isProductionBackendUrlLocalhost() {
  return import.meta.env.PROD && /localhost|127\.0\.0\.1/i.test(serverUrl);
}

if (isProductionBackendUrlLocalhost()) {
  console.warn(
    "[Paidly] VITE_SERVER_URL is missing or points to localhost in production. Email/password sign-in uses Supabase directly. Set VITE_SERVER_URL to your API for server rate limits, waitlist, and currency features."
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
