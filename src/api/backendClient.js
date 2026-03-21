/**
 * Axios instance for the backend API (admin sync, health, etc.).
 * In dev: use same origin so Vite proxy forwards /api to VITE_SERVER_URL (avoids CORS, connection to one host).
 * In production: use VITE_SERVER_URL so requests go to the backend host.
 */
import axios from "axios";

const isDev = import.meta.env.DEV;
const serverUrl = (import.meta.env.VITE_SERVER_URL || "http://localhost:5179").replace(/\/$/, "");
const baseURL = isDev ? "" : serverUrl;

if (import.meta.env.PROD && /localhost|127\.0\.0\.1/i.test(serverUrl)) {
  console.error(
    "[Paidly] API base URL is localhost in production. Set VITE_SERVER_URL in Vercel (or your host) to your live backend URL and redeploy, or login/waitlist/currency calls will show Network Error."
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
