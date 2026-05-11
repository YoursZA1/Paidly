import {
  recordAuthRefreshFailure,
  recordAuthRefreshFatal,
  recordAuthRefreshSuccess,
} from "@/lib/authRefreshTelemetry";
import { refreshSupabaseSessionWithRecovery } from "@/lib/supabaseAuthRefresh";
import { refreshFailed, refreshFatal, refreshSuccess } from "@/lib/session/refreshResult";

/** Work performed inside SessionManager refresh queue for AuthProvider (`source: auth_context_refresh`). */
export async function runAuthRefreshQueueJob(ctx) {
  const {
    believedSignedIn,
    silent,
    connectionLifecycle,
    sessionManager,
    isTerminalRefreshFailure,
    readSessionSafe,
    isSessionValid,
    patchAuthSession,
    touchAuthHeartbeatIfValid,
    cancelReconnectEscalation,
    scheduleReconnectEscalation,
    publishAuthTabSync,
    reconcileRealtimeJwt,
    enableTerminalMutationLock,
  } = ctx;

  if (!silent) {
    connectionLifecycle.reportRefreshStarting({ offline: !navigator.onLine });
  }
  try {
    const refreshed = await refreshSupabaseSessionWithRecovery();
    if (
      refreshed.fatal ||
      (believedSignedIn &&
        (refreshed.reason === "no_refresh_token" || isTerminalRefreshFailure(refreshed.error)))
    ) {
      recordAuthRefreshFatal({ source: "refresh_session", reason: "refresh_token_invalid" });
      cancelReconnectEscalation?.();
      enableTerminalMutationLock?.("refresh_token_invalid");
      await sessionManager.RefreshManager.handleFatal("refresh_token_invalid");
      return refreshFatal("refresh_token_invalid");
    }
    if (refreshed.ok) recordAuthRefreshSuccess({ source: "refresh_session" });
    else if (refreshed.error) {
      recordAuthRefreshFailure({ source: "refresh_session", reason: "refresh_failed" });
    }
    const newSession = await readSessionSafe(true);
    if (newSession?.user && isSessionValid(newSession)) {
      cancelReconnectEscalation();
      patchAuthSession({ session: newSession });
      touchAuthHeartbeatIfValid(newSession);
      reconcileRealtimeJwt(newSession.accessToken, "refresh_session");
      if (!silent) {
        connectionLifecycle.reportRefreshOk("refresh_ok");
      }
      publishAuthTabSync?.("AUTH_SESSION_UPDATED", { reason: "refresh_ok" });
      return refreshSuccess();
    }
    if (!silent) {
      connectionLifecycle.markReconnecting(believedSignedIn ? "session_missing" : "guest");
    }
    if (believedSignedIn) scheduleReconnectEscalation();
    return believedSignedIn ? refreshFailed("session_missing_after_refresh") : refreshSuccess();
  } catch (error) {
    if (believedSignedIn && isTerminalRefreshFailure(error)) {
      recordAuthRefreshFatal({ source: "refresh_session", reason: "refresh_token_invalid" });
      cancelReconnectEscalation?.();
      enableTerminalMutationLock?.("refresh_token_invalid");
      await sessionManager.RefreshManager.handleFatal("refresh_token_invalid");
      return refreshFatal("refresh_token_invalid");
    }
    if (!silent) {
      connectionLifecycle.markReconnecting(navigator.onLine ? "refresh_failed" : "offline");
    }
    return refreshFailed(navigator.onLine ? "refresh_exception" : "offline");
  }
}
