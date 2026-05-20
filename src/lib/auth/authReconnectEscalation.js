import { SESSION_STATUS } from "@/stores/sessionHealthStore";

const BACKOFF_DELAYS_MS = [1_500, 3_000, 6_000, 12_000, 24_000];
const MAX_RECONNECT_ATTEMPTS = 5;
const CIRCUIT = Object.freeze({ CLOSED: "closed", OPEN: "open", HALF_OPEN: "half_open" });

function getBackoffDelayMs(attemptIndex) {
  const base = BACKOFF_DELAYS_MS[Math.min(attemptIndex, BACKOFF_DELAYS_MS.length - 1)];
  const jitter = Math.floor(Math.random() * base * 0.15);
  return base + jitter;
}

function isTerminalStatus(status) {
  return status === SESSION_STATUS.EXPIRED || status === SESSION_STATUS.REAUTH_REQUIRED;
}

/**
 * Deferred reconnect: re-read session from Supabase (GoTrue may have refreshed while tab was hidden).
 * Does not call refreshSession().
 */
export function createReconnectEscalationController({ getDeps }) {
  let timer = null;
  let circuitState = CIRCUIT.CLOSED;
  let consecutiveFailures = 0;
  let terminalizing = false;

  function cancel() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    circuitState = CIRCUIT.CLOSED;
  }

  async function runProbe() {
    timer = null;
    circuitState = CIRCUIT.HALF_OPEN;

    const {
      connectionLifecycle,
      isTerminalRefreshFailure,
      readSessionSafe,
      isSessionValid,
      patchAuthSession,
      getSessionHealthStatus,
      handleRefreshFatal,
    } = getDeps();

    if (terminalizing) return;

    const status = getSessionHealthStatus();
    if (isTerminalStatus(status)) {
      terminalizing = true;
      circuitState = CIRCUIT.CLOSED;
      return;
    }

    connectionLifecycle.reportSessionMissingDuringReconnect();

    try {
      const refreshedSession = await readSessionSafe(true);

      if (refreshedSession?.user && isSessionValid(refreshedSession)) {
        consecutiveFailures = 0;
        circuitState = CIRCUIT.CLOSED;
        terminalizing = false;
        patchAuthSession({ session: refreshedSession });
        connectionLifecycle.reportRefreshOk("session_recovered");
        return;
      }
    } catch (error) {
      if (isTerminalRefreshFailure(error)) {
        terminalizing = true;
        circuitState = CIRCUIT.CLOSED;
        await handleRefreshFatal("refresh_token_invalid");
        return;
      }
    }

    consecutiveFailures += 1;
    circuitState = CIRCUIT.CLOSED;

    if (consecutiveFailures >= MAX_RECONNECT_ATTEMPTS) {
      terminalizing = true;
      await handleRefreshFatal("reconnect_loop_break");
      return;
    }

    const shouldEscalateTerminal = connectionLifecycle.handleMissingSession(
      "session_missing_after_reconnect"
    );
    if (shouldEscalateTerminal) {
      terminalizing = true;
      await connectionLifecycle.transitionToExpired("session_missing_after_reconnect", {
        signOutLocal: true,
        clearAuthState: true,
        broadcast: true,
        redirect: true,
        source: "reconnect_escalation",
      });
      return;
    }

    circuitState = CIRCUIT.OPEN;
    const delayMs = getBackoffDelayMs(consecutiveFailures);
    timer = setTimeout(() => {
      runProbe();
    }, delayMs);
  }

  function schedule() {
    if (terminalizing) return;
    if (circuitState === CIRCUIT.OPEN) return;
    if (timer != null) return;

    const status = getDeps().getSessionHealthStatus();
    if (isTerminalStatus(status)) return;

    circuitState = CIRCUIT.OPEN;
    const delayMs = getBackoffDelayMs(consecutiveFailures);
    timer = setTimeout(() => {
      runProbe();
    }, delayMs);
  }

  return { schedule, cancel };
}
