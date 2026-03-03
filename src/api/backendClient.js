/**
 * Axios instance for the backend API (admin sync, health, etc.).
 * In dev: use same origin so Vite proxy forwards /api to VITE_SERVER_URL (avoids CORS, connection to one host).
 * In production: use VITE_SERVER_URL so requests go to the backend host.
 */
import axios from "axios";

const isDev = import.meta.env.DEV;
const serverUrl = (import.meta.env.VITE_SERVER_URL || "http://localhost:5179").replace(/\/$/, "");
const baseURL = isDev ? "" : serverUrl;

export const backendApi = axios.create({
  baseURL,
  timeout: 15000,
  withCredentials: true,
});

export function getBackendBaseUrl() {
  return serverUrl;
}
