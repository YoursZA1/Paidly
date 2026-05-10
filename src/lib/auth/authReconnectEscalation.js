import { SESSION_STATUS } from "@/stores/sessionHealthStore";

const RECONNECT_ESCALATION_DELAY_MS = 3000;

/**
 * Deferred reconnect: narrow `supabase.auth.refreshSession` + missing-session escalation.
 * Intentionally **not** routed through {@link enqueue} / full `refreshSession` to avoid circular scheduling.
 *
 * @param {object} args
 * @param {() => object} args.getDeps — latest wiring (connection lifecycle, session manager, session helpers).
 * @returns {{ schedule: () => void, cancel: () => void }}
 */
export function createReconnectEscalationController({ getDeps }) {
  let timer = null;

  function cancel() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule() {
    const {
      connectionLifecycle,
      sessionManager,
      isTerminalRefreshFailure,
      readSessionSafe,
      normalizeSessionFromClient,
      isSessionValid,
      patchAuthSession,
      supabaseRefreshSession,
      getSessionHealthStatus,
    } = getDeps();

    if (typeof document !== "undefined" && document.hidden) return;
    if (getSessionHealthStatus() === SESSION_STATUS.EXPIRED) return;
    if (timer != null) return;

    timer = setTimeout(async () => {
      timer = null;
      connectionLifecycle.reportSessionMissingDuringReconnect();

      try {
        const { data } = await supabaseRefreshSession();
        const refreshedSession = data?.session
          ? normalizeSessionFromClient(data.session)
          : await readSessionSafe(true);

        if (refreshedSession?.user && isSessionValid(refreshedSession)) {
          patchAuthSession({ session: refreshedSession });
          connectionLifecycle.reportRefreshOk("refresh_recovered");
          return;
        }
      } catch (error) {
        if (isTerminalRefreshFailure(error)) {
          await sessionManager.RefreshManager.handleFatal("refresh_token_invalid");
          return;
        }
      }

      const shouldEscalateTerminal = sessionManager.RefreshManager.handleMissingSession(
        "session_missing_after_reconnect"
      );
      if (!shouldEscalateTerminal) return;
      await connectionLifecycle.transitionToExpired("session_missing_after_reconnect", {
        signOutLocal: true,
        clearAuthState: true,
        broadcast: true,
        redirect: true,
        source: "reconnect_escalation",
      });
    }, RECONNECT_ESCALATION_DELAY_MS);
  }

  return { schedule, cancel };
}
