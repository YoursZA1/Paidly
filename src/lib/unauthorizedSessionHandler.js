import { supabase } from "@/lib/supabaseClient";
import { redirectToLoginIfProtectedPath } from "@/utils/sessionGuard";
import { SESSION_STATUS, setSessionHealthStatus } from "@/stores/sessionHealthStore";

let handler = null;
let inFlight = false;

/**
 * Register the app logout handler (from AuthProvider). Cleared on unmount.
 * @param {((reason?: string) => void | Promise<void>) | null} fn
 */
export function setUnauthorizedSessionHandler(fn) {
  handler = fn;
}

/**
 * 401 / invalid session from API layer: sign out and leave protected routes.
 * Debounced so parallel 401s do not stack sign-out work.
 * @param {string} [_reason]
 */
export async function triggerUnauthorizedSession(_reason) {
  if (typeof window === "undefined") return;
  if (inFlight) return;
  inFlight = true;
  try {
    if (typeof handler === "function") {
      await handler(_reason);
    } else {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        /* ignore */
      }
      setSessionHealthStatus(SESSION_STATUS.EXPIRED, _reason || "unauthorized");
    }
  } finally {
    window.setTimeout(() => {
      inFlight = false;
    }, 1500);
  }
}

export async function hardSignOutUnauthorizedSession(reason = "unauthorized") {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* ignore */
  }
  setSessionHealthStatus(SESSION_STATUS.EXPIRED, reason);
  redirectToLoginIfProtectedPath();
}
