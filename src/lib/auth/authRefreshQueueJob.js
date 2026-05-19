import {
  recordAuthRefreshFailure,
  recordAuthRefreshFatal,
  recordAuthRefreshSuccess,
} from "@/lib/authRefreshTelemetry";
import { refreshSupabaseSessionWithRecovery } from "@/lib/supabaseAuthRefresh";
import { refreshFailed, refreshFatal, refreshSuccess } from "@/lib/session/refreshResult";

/**
 * Structured session lifecycle logger.
 * Always emits warnings; info is gated on DEV so production bundles stay quiet.
 */
const sessionLog = {
  info: (event, data) => {
    if (import.meta.env?.DEV) console.info(`[SessionManager] ${event}`, data ?? "");
  },
  warn: (event, data) => {
    console.warn(`[SessionManager] ${event}`, data ?? "");
  },
};

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

  const source = ctx.source || "unknown";

  sessionLog.info("refresh:start", { source, silent, believedSignedIn });

  if (!silent) {
    connectionLifecycle.reportRefreshStarting({ offline: !navigator.onLine });
  }
  try {
    const refreshed = await refreshSupabaseSessionWithRecovery();

    if (refreshed.reason === "refresh_timeout") {
      if (believedSignedIn) {
        sessionLog.warn("refresh:failure", { source, reason: "refresh_timeout" });
        recordAuthRefreshFailure({ source, reason: "refresh_timeout" });
        if (!silent) {
          connectionLifecycle.markReconnecting(navigator.onLine ? "refresh_timeout" : "offline");
        }
        scheduleReconnectEscalation();
        return refreshFailed("refresh_timeout");
      }
      // Guest-state init: no session to recover, timeout is expected noise.
      sessionLog.info("refresh:skipped", { source, reason: "refresh_timeout_unauthenticated" });
      return refreshSuccess();
    }

    if (
      refreshed.fatal ||
      (believedSignedIn &&
        (refreshed.reason === "no_refresh_token" || isTerminalRefreshFailure(refreshed.error)))
    ) {
      sessionLog.warn("session:expired", { source, reason: "refresh_token_invalid" });
      recordAuthRefreshFatal({ source, reason: "refresh_token_invalid" });
      cancelReconnectEscalation?.();
      enableTerminalMutationLock?.("refresh_token_invalid");
      await sessionManager.RefreshManager.handleFatal("refresh_token_invalid");
      return refreshFatal("refresh_token_invalid");
    }

    if (refreshed.ok) {
      recordAuthRefreshSuccess({ source });
    } else if (refreshed.error) {
      sessionLog.info("refresh:failure", { source, reason: "refresh_failed" });
      recordAuthRefreshFailure({ source, reason: "refresh_failed" });
    }

    const newSession = await readSessionSafe(true);
    if (newSession?.user && isSessionValid(newSession)) {
      sessionLog.info("refresh:success", { source, userId: newSession.user?.id });
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

    sessionLog.info("refresh:skipped", { source, reason: "session_missing_after_refresh", believedSignedIn });
    if (!silent) {
      connectionLifecycle.markReconnecting(believedSignedIn ? "session_missing" : "guest");
    }
    if (believedSignedIn) scheduleReconnectEscalation();
    return believedSignedIn ? refreshFailed("session_missing_after_refresh") : refreshSuccess();

  } catch (error) {
    if (believedSignedIn && isTerminalRefreshFailure(error)) {
      sessionLog.warn("session:expired", { source, reason: "refresh_token_invalid", error: error?.message });
      recordAuthRefreshFatal({ source, reason: "refresh_token_invalid" });
      cancelReconnectEscalation?.();
      enableTerminalMutationLock?.("refresh_token_invalid");
      await sessionManager.RefreshManager.handleFatal("refresh_token_invalid");
      return refreshFatal("refresh_token_invalid");
    }
    const failReason = navigator.onLine ? "refresh_exception" : "offline";
    sessionLog.warn("refresh:failure", { source, reason: failReason, error: error?.message });
    recordAuthRefreshFailure({ source, reason: failReason });
    if (!silent) {
      connectionLifecycle.markReconnecting(navigator.onLine ? "refresh_failed" : "offline");
    }
    return refreshFailed(failReason);
  }
}
