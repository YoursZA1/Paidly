/**
 * Axios instance for the backend API (admin sync, health, etc.).
 * In dev: use same origin so Vite proxy forwards /api to VITE_SERVER_URL (avoids CORS, connection to one host).
 * In production: VITE_SERVER_URL, but same-origin when apex vs www would otherwise break CORS (see apiOrigin.js).
 */
import axios from "axios";
import { resolveProductionBrowserApiBaseUrl } from "@/lib/apiOrigin";
import { installBackendApiResilience } from "@/api/installBackendApiResilience";
import { triggerUnauthorizedSession } from "@/lib/unauthorizedSessionHandler";
import { refreshSupabaseSessionWithRecovery } from "@/lib/supabaseAuthRefresh";
import { queuePendingAction } from "@/lib/pendingActionQueue";

function viteEnvFlag(name) {
  const v = String(import.meta.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isReplaySafeAxiosMethod(method) {
  const m = String(method || "get").toLowerCase();
  return m === "get" || m === "head" || m === "options";
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
 *
 * **Case A — API on the same host as the app (e.g. Vercel serverless `/api/*`):** leave `VITE_SERVER_URL`
 * unset. The client uses same-origin `/api/...` (see {@link resolveProductionBrowserApiBaseUrl}).
 *
 * **Case B — API on another host:** set `VITE_SERVER_URL` to that origin (no trailing slash), e.g.
 * `https://api.paidly.co.za`.
 */
const rawServerUrl = String(import.meta.env.VITE_SERVER_URL ?? "").trim();
const serverUrl = (rawServerUrl || "http://localhost:5179").replace(/\/$/, "");
const baseURL = isDev ? "" : resolveProductionBrowserApiBaseUrl(serverUrl);

/** True when production explicitly sets VITE_SERVER_URL to localhost (usually wrong). Unset = same-origin, not this. */
export function isProductionBackendUrlLocalhost() {
  if (!import.meta.env.PROD) return false;
  const raw = String(import.meta.env.VITE_SERVER_URL ?? "").trim();
  if (!raw) return false;
  return /localhost|127\.0\.0\.1/i.test(raw);
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
    "[Paidly] VITE_SERVER_URL points at localhost in production. Remove it for same-host /api (Vercel serverless), set it to your real API origin, or set VITE_SUPABASE_ONLY=1."
  );
}

export const backendApi = axios.create({
  baseURL,
  /** Cold serverless / slow mobile networks: 30s avoids spurious timeouts on auth/me and list proxies */
  timeout: 30000,
  withCredentials: true,
});

/**
 * Transient retries + Sonner toast on final failure. Per-request: `{ __paidlySilent: true }` skips toast;
 * `__paidlySilent404` skips toast for 404. Prefer silent when the caller already surfaces the error
 * (e.g. team invite, account delete, Node auth sign-in/sign-up/forgot-password, optional currency API).
 */
installBackendApiResilience(backendApi);

backendApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const cfg = error.config;
    if (status === 401 && cfg && !cfg.__paidlySkipAuthRedirect) {
      if (!cfg.__paidlyAuthRetriedOnce) {
        cfg.__paidlyAuthRetriedOnce = true;
        try {
          const refreshed = await refreshSupabaseSessionWithRecovery();
          if (refreshed?.ok) {
            return backendApi(cfg);
          }
        } catch {
          // fall through to session handler
        }
      }
      if (isReplaySafeAxiosMethod(cfg.method)) {
        const replayCfg = {
          ...cfg,
          headers: { ...(cfg.headers || {}), "x-paidly-auth-replay": "1" },
          __paidlyAuthRetriedOnce: true,
        };
        queuePendingAction(async () => backendApi(replayCfg));
      }
      await triggerUnauthorizedSession("axios-401");
    }
    return Promise.reject(error);
  }
);

export function getBackendBaseUrl() {
  if (rawServerUrl) return serverUrl;
  if (import.meta.env.PROD && typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
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
 * Base URL for Node admin routes (e.g. GET /api/admin/platform-users).
 * Must match {@link getPublicApiBase} for apex vs www: if env is `https://www…` but the user is on
 * `https://paidly.co.za`, forcing the raw env URL causes cross-origin requests and CORS preflight
 * failures. When `VITE_SERVER_URL` is a different host (e.g. `https://api.…`), `getPublicApiBase`
 * already resolves to that host.
 */
export function getAdminDataApiBase() {
  if (isDev) return "";
  return String(getPublicApiBase()).replace(/\/$/, "");
}
