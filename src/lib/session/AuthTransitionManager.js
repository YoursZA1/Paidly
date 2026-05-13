import { SESSION_STATUS } from "@/stores/sessionHealthStore";
import { resetSessionRecoveryEscalation } from "@/lib/session/sessionRecoveryEscalation";
import { trackSessionTelemetry } from "@/lib/sessionTelemetry";
import { navigateTo } from "@/lib/navigationService";

const HARD_EXPIRY_REASONS = new Set([
  "auth_corruption",
  "storage_corruption",
  "token_desync",
  "app_version_mismatch",
]);

const RETURN_PATH_KEY = "paidly_auth_return_path_v1";

export function createAuthTransitionManager(deps) {
  function preserveReturnPath(reason = "session_expired") {
    if (typeof window === "undefined") return;
    try {
      const path = `${window.location.pathname}${window.location.search}${window.location.hash || ""}`;
      window.sessionStorage.setItem(
        RETURN_PATH_KEY,
        JSON.stringify({
          path,
          reason: String(reason || "session_expired"),
          at: Date.now(),
        })
      );
    } catch {
      // ignore storage failures
    }
  }

  function softRedirect(url = "/login", { replace = true } = {}) {
    navigateTo(url, { replace, hardReload: false });
  }

  function hardRedirect(url = "/login", { replace = true } = {}) {
    navigateTo(url, { replace, hardReload: true });
  }

  async function clearSession({
    signOutLocal = false,
    clearAuthState = true,
    broadcast = true,
    reason = "session_expired",
  } = {}) {
    deps.connectionManager?.dispose?.();
    deps.refreshQueue?.halt?.();
    deps.clearReconnectLoops?.();
    deps.clearVolatileCaches?.();
    if (signOutLocal) {
      await deps.signOutLocalSafe?.();
    }
    if (clearAuthState) {
      deps.patchAuthSession?.({ session: null, user: null, authLoadingTimedOut: false });
    }
    if (broadcast) {
      deps.publish?.("AUTH_REAUTH_REQUIRED", { reason });
    }
  }

  async function transitionToExpired(
    reason = "session_expired",
    {
      signOutLocal = false,
      clearAuthState = true,
      broadcast = true,
      redirect = true,
      hardReload = false,
      preservePath = true,
      source = "auth_transition_manager",
      redirectUrl = "/login",
    } = {}
  ) {
    if (deps.getSessionHealthStatus?.() === SESSION_STATUS.EXPIRED) return false;

    if (import.meta.env?.DEV) console.info("[SessionManager] Transition → EXPIRED", `reason=${reason}`);
    trackSessionTelemetry("session_transition_expired", {
      reason: reason || null,
      source,
      hard_reload: Boolean(hardReload || HARD_EXPIRY_REASONS.has(String(reason || ""))),
    });

    if (preservePath) {
      preserveReturnPath(reason);
    }

    await clearSession({
      signOutLocal,
      clearAuthState,
      broadcast,
      reason,
    });

    deps.setSessionHealth?.(SESSION_STATUS.EXPIRED, reason);
    resetSessionRecoveryEscalation();
    deps.clearError?.();

    if (redirect) {
      const forceHardReload = hardReload || HARD_EXPIRY_REASONS.has(String(reason || ""));
      if (forceHardReload) hardRedirect(redirectUrl);
      else softRedirect(redirectUrl);
    }
    return true;
  }

  return {
    softRedirect,
    hardRedirect,
    preserveReturnPath,
    clearSession,
    transitionToExpired,
  };
}
