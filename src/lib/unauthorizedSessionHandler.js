import { supabase } from "@/lib/supabaseClient";
import { redirectToLoginIfProtectedPath } from "@/utils/sessionGuard";
import { SESSION_STATUS, setSessionHealthStatus } from "@/stores/sessionHealthStore";
import { decideSessionAction, SESSION_DECISION } from "@/lib/sessionDecisionEngine";

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
export async function triggerUnauthorizedSession(_reason, context = {}) {
  if (typeof window === "undefined") return;
  if (inFlight) return;
  inFlight = true;
  try {
    const decision = decideSessionAction({
      reason: _reason,
      believedSignedIn: context?.believedSignedIn ?? true,
      online: context?.online ?? (typeof navigator !== "undefined" ? navigator.onLine !== false : true),
      refreshFatal: Boolean(context?.refreshFatal),
    });

    if (decision.action === SESSION_DECISION.RECONNECTING) {
      setSessionHealthStatus(SESSION_STATUS.RECONNECTING, decision.reason || _reason || "session_reconnecting");
      return;
    }
    if (decision.action === SESSION_DECISION.NONE) {
      return;
    }

    if (typeof handler === "function") {
      await handler(decision.reason || _reason);
    } else {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        /* ignore */
      }
      setSessionHealthStatus(SESSION_STATUS.EXPIRED, decision.reason || _reason || "unauthorized");
      redirectToLoginIfProtectedPath();
    }
  } finally {
    window.setTimeout(() => {
      inFlight = false;
    }, 1500);
  }
}

/**
 * Terminal-only helper. Intentionally requires explicit opt-in so callers do not
 * accidentally bypass SessionDecisionEngine for transient failures.
 */
export async function hardSignOutUnauthorizedSession(reason = "unauthorized", options = {}) {
  if (options?.terminal !== true) {
    if (import.meta.env?.DEV) {
      console.warn(
        "[Auth] hardSignOutUnauthorizedSession ignored without { terminal: true } to avoid bypassing recovery policy."
      );
    }
    return false;
  }
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* ignore */
  }
  setSessionHealthStatus(SESSION_STATUS.EXPIRED, reason);
  redirectToLoginIfProtectedPath();
  return true;
}
