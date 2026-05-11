import { SESSION_STATUS } from "@/stores/sessionHealthStore";

const RECONNECT_ESCALATION_DELAY_MS = 3000;
const MAX_RECONNECT_ESCALATION_ATTEMPTS = 3;

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
  let consecutiveFailures = 0;
  let terminalizing = false;

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

    if (terminalizing) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (
      getSessionHealthStatus() === SESSION_STATUS.EXPIRED ||
      getSessionHealthStatus() === SESSION_STATUS.REAUTH_REQUIRED
    ) {
      terminalizing = true;
      return;
    }
    if (consecutiveFailures >= MAX_RECONNECT_ESCALATION_ATTEMPTS) {
      terminalizing = true;
      void sessionManager.RefreshManager.handleFatal("reconnect_loop_break");
      return;
    }
    if (timer != null) return;

    timer = setTimeout(async () => {
      timer = null;
      if (
        getSessionHealthStatus() === SESSION_STATUS.EXPIRED ||
        getSessionHealthStatus() === SESSION_STATUS.REAUTH_REQUIRED
      ) {
        return;
      }
      connectionLifecycle.reportSessionMissingDuringReconnect();

      try {
        const { data } = await supabaseRefreshSession();
        const refreshedSession = data?.session
          ? normalizeSessionFromClient(data.session)
          : await readSessionSafe(true);

        if (refreshedSession?.user && isSessionValid(refreshedSession)) {
          consecutiveFailures = 0;
          terminalizing = false;
          patchAuthSession({ session: refreshedSession });
          connectionLifecycle.reportRefreshOk("refresh_recovered");
          return;
        }
      } catch (error) {
        if (isTerminalRefreshFailure(error)) {
          terminalizing = true;
          await sessionManager.RefreshManager.handleFatal("refresh_token_invalid");
          return;
        }
      }
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_RECONNECT_ESCALATION_ATTEMPTS) {
        terminalizing = true;
        await sessionManager.RefreshManager.handleFatal("reconnect_loop_break");
        return;
      }

      const shouldEscalateTerminal = sessionManager.RefreshManager.handleMissingSession(
        "session_missing_after_reconnect"
      );
      if (!shouldEscalateTerminal) return;
      terminalizing = true;
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
