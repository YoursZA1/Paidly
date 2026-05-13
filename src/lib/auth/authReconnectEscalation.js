import { SESSION_STATUS } from "@/stores/sessionHealthStore";

/**
 * Exponential back-off delays (ms) indexed by consecutive failure count.
 * Attempt 0 → 1.5 s, 1 → 3 s, 2 → 6 s, 3 → 12 s, 4+ → 24 s.
 */
const BACKOFF_DELAYS_MS = [1_500, 3_000, 6_000, 12_000, 24_000];

/**
 * After this many consecutive failures the circuit opens and we call handleFatal.
 * Chosen to be high enough that transient network blips (phone switching WiFi→LTE) can
 * recover within the full backoff ladder, but low enough to not frustrate genuine re-auth.
 */
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * While the circuit is OPEN (failure recorded, timer pending) we do NOT accept new
 * `schedule()` calls — they are dropped until the pending probe fires.
 */
const CIRCUIT = Object.freeze({ CLOSED: "closed", OPEN: "open", HALF_OPEN: "half_open" });

function getBackoffDelayMs(attemptIndex) {
  const base = BACKOFF_DELAYS_MS[Math.min(attemptIndex, BACKOFF_DELAYS_MS.length - 1)];
  // Up to ±15% jitter to prevent thundering-herd when multiple tabs recover simultaneously.
  const jitter = Math.floor(Math.random() * base * 0.15);
  return base + jitter;
}

function isTerminalStatus(status) {
  return status === SESSION_STATUS.EXPIRED || status === SESSION_STATUS.REAUTH_REQUIRED;
}

/**
 * Deferred reconnect controller with exponential back-off and a circuit breaker.
 *
 * Circuit states:
 *   CLOSED    — accepting new attempts, timer not running
 *   OPEN      — timer in flight; new `schedule()` calls are dropped
 *   HALF_OPEN — probe attempt running (set by the timer callback before the probe)
 *
 * @param {object} args
 * @param {() => object} args.getDeps — latest wiring injected fresh each call
 * @returns {{ schedule: () => void, cancel: () => void }}
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
    // Cancelling resets to CLOSED so a fresh auth event can re-open the loop.
    circuitState = CIRCUIT.CLOSED;
  }

  async function runProbe() {
    timer = null;
    circuitState = CIRCUIT.HALF_OPEN;

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

    const status = getSessionHealthStatus();
    if (isTerminalStatus(status)) {
      terminalizing = true;
      circuitState = CIRCUIT.CLOSED;
      return;
    }

    if (import.meta.env?.DEV) {
      console.info("[SessionManager] reconnect:probe", {
        attempt: consecutiveFailures + 1,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
        circuit: CIRCUIT.HALF_OPEN,
      });
    }

    connectionLifecycle.reportSessionMissingDuringReconnect();

    try {
      const { data } = await supabaseRefreshSession();
      const refreshedSession = data?.session
        ? normalizeSessionFromClient(data.session)
        : await readSessionSafe(true);

      if (refreshedSession?.user && isSessionValid(refreshedSession)) {
        // Success — close the circuit, reset failure counter.
        consecutiveFailures = 0;
        circuitState = CIRCUIT.CLOSED;
        terminalizing = false;
        patchAuthSession({ session: refreshedSession });
        connectionLifecycle.reportRefreshOk("refresh_recovered");
        if (import.meta.env?.DEV) {
          console.info("[SessionManager] reconnect:recovered — circuit closed");
        }
        return;
      }
    } catch (error) {
      if (isTerminalRefreshFailure(error)) {
        terminalizing = true;
        circuitState = CIRCUIT.CLOSED;
        if (import.meta.env?.DEV) {
          console.warn("[SessionManager] reconnect:fatal — terminal refresh error");
        }
        await sessionManager.RefreshManager.handleFatal("refresh_token_invalid");
        return;
      }
    }

    // Probe failed — increment and decide what to do next.
    consecutiveFailures += 1;
    circuitState = CIRCUIT.CLOSED;

    if (consecutiveFailures >= MAX_RECONNECT_ATTEMPTS) {
      terminalizing = true;
      if (import.meta.env?.DEV) {
        console.warn("[SessionManager] reconnect:circuit-open → terminal", {
          consecutiveFailures,
          maxAttempts: MAX_RECONNECT_ATTEMPTS,
        });
      }
      await sessionManager.RefreshManager.handleFatal("reconnect_loop_break");
      return;
    }

    if (import.meta.env?.DEV) {
      console.warn("[SessionManager] reconnect:failure", {
        consecutiveFailures,
        nextBackoffMs: getBackoffDelayMs(consecutiveFailures),
      });
    }

    // Escalate session health ladder before deciding on terminal logout.
    const shouldEscalateTerminal = sessionManager.RefreshManager.handleMissingSession(
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
    }
  }

  function schedule() {
    const { getSessionHealthStatus } = getDeps();

    if (terminalizing) return;

    // Respect tab visibility — don't schedule reconnect probes while hidden.
    if (typeof document !== "undefined" && document.hidden) return;

    const status = getSessionHealthStatus();
    if (isTerminalStatus(status)) {
      terminalizing = true;
      return;
    }

    // Circuit is OPEN (timer already running) — drop the request.
    if (circuitState === CIRCUIT.OPEN || timer != null) return;

    const delay = getBackoffDelayMs(consecutiveFailures);
    circuitState = CIRCUIT.OPEN;
    timer = setTimeout(() => void runProbe(), delay);
  }

  return { schedule, cancel };
}
