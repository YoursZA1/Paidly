/**
 * Read Supabase session from storage (GoTrue auto-refresh) and mirror into app state.
 * Does NOT call refreshSession() — Supabase owns token rotation.
 */
import { reconcileRealtimeJwt } from "@/lib/realtime/authRealtimeCoordinator";
import {
  refreshFailed,
  refreshFatal,
  refreshSkipped,
  refreshSuccess,
} from "@/lib/session/refreshResult";
import { isRefreshTokenFatalError } from "@/lib/supabaseAuthRefresh";

function isPublicAuthShellPath(pathname) {
  const path = pathname || "";
  return (
    /^\/(login|signup|forgotpassword|resetpassword|auth)(\/|$)/i.test(path) ||
    path === "/" ||
    /^\/home$/i.test(path)
  );
}

/**
 * @param {object} ctx
 * @param {boolean} ctx.believedSignedIn
 * @param {boolean} [ctx.silent]
 * @param {string} [ctx.source]
 * @param {object} ctx.connectionLifecycle
 * @param {(e: unknown) => boolean} ctx.isTerminalRefreshFailure
 * @param {() => Promise<object|null>} ctx.readSessionSafe
 * @param {(s: object|null) => boolean} ctx.isSessionValid
 * @param {(p: object) => void} ctx.patchAuthSession
 * @param {(s: object) => void} ctx.touchAuthHeartbeatIfValid
 * @param {() => void} [ctx.cancelReconnectEscalation]
 * @param {() => void} [ctx.scheduleReconnectEscalation]
 * @param {(reason: string) => Promise<boolean>} ctx.handleRefreshFatal
 * @param {() => void} [ctx.enableTerminalMutationLock]
 */
export async function syncSessionFromSupabase(ctx) {
  const {
    believedSignedIn,
    silent,
    source = "session_sync",
    connectionLifecycle,
    isTerminalRefreshFailure,
    readSessionSafe,
    isSessionValid,
    patchAuthSession,
    touchAuthHeartbeatIfValid,
    cancelReconnectEscalation,
    scheduleReconnectEscalation,
    handleRefreshFatal,
    enableTerminalMutationLock,
  } = ctx;

  if (!silent) {
    connectionLifecycle.reportRefreshStarting({ offline: typeof navigator !== "undefined" && !navigator.onLine });
  }

  try {
    const newSession = await readSessionSafe(true);

    if (newSession?.user && isSessionValid(newSession)) {
      cancelReconnectEscalation?.();
      patchAuthSession({ session: newSession });
      touchAuthHeartbeatIfValid(newSession);

      const path = typeof window !== "undefined" ? window.location.pathname || "" : "";
      if (!isPublicAuthShellPath(path)) {
        reconcileRealtimeJwt(newSession.accessToken, source);
      }

      if (!silent) {
        connectionLifecycle.reportRefreshOk("session_sync_ok");
      }
      return refreshSuccess();
    }

    if (!believedSignedIn) {
      return refreshSuccess();
    }

    if (!silent) {
      connectionLifecycle.markReconnecting("session_missing");
    }
    scheduleReconnectEscalation?.();
    return refreshFailed("session_missing_after_sync");
  } catch (error) {
    if (believedSignedIn && (isRefreshTokenFatalError(error) || isTerminalRefreshFailure(error))) {
      cancelReconnectEscalation?.();
      enableTerminalMutationLock?.("refresh_token_invalid");
      await handleRefreshFatal("refresh_token_invalid");
      return refreshFatal("refresh_token_invalid");
    }

    if (!believedSignedIn) {
      return refreshSkipped("session_sync_guest");
    }

    if (!silent) {
      connectionLifecycle.markReconnecting(
        typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "session_sync_failed"
      );
    }
    scheduleReconnectEscalation?.();
    return refreshFailed("session_sync_exception");
  }
}
