import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSessionInactivitySyncChannel } from "@/lib/sessionInactivitySync";

const DEFAULTS = {
  idleTimeoutMs: 18 * 60 * 1000,      // 18 min idle → warning; +2 min warning = 20 min total
  warningTimeoutMs: 2 * 60 * 1000,
  keepAliveIntervalMs: 4 * 60 * 1000, // keep-alive every 4 min (Supabase JWTs last 1 h)
};

// Throttle interval for high-frequency DOM events (mousemove, scroll, touchstart).
// Immediate events (click, keydown, input) bypass this throttle.
const ACTIVITY_THROTTLE_MS = 800;

/** Phases of the one inactivity timer. Only one is ever current. */
export const INACTIVITY_PHASE = Object.freeze({
  ACTIVE: "active",
  WARNING: "warning",
  REFRESHING: "refreshing",
  ENDED: "ended",
});

export function applyHiddenPause(timestampMs, hiddenDurationMs) {
  const ts = Number(timestampMs || 0);
  const delta = Math.max(0, Number(hiddenDurationMs || 0));
  if (!Number.isFinite(ts) || ts <= 0) return ts;
  return ts + delta;
}

/**
 * Idle-session timeout manager with:
 * - activity listeners (mouse/keyboard/touch/input), throttled
 * - one warning countdown (a new one always clears the previous one)
 * - a session check when the countdown ends, or when the user asks to stay — never a bare logout
 * - keep-alive callback while active
 * - cross-tab timer sync
 *
 * `onWarningElapsed` and `onStayLoggedIn` resolve to "continue" (session is fine: reset the timer)
 * or "ended" (the caller signed the user out). While either runs the phase is REFRESHING: the
 * countdown is stopped, so a timeout can never fire in the middle of a refresh.
 */
export function useInactivitySessionTimeout({
  enabled,
  onWarningElapsed,
  onStayLoggedIn,
  onRemoteTimeout,
  onKeepAlive,
  idleTimeoutMs = DEFAULTS.idleTimeoutMs,
  warningTimeoutMs = DEFAULTS.warningTimeoutMs,
  keepAliveIntervalMs = DEFAULTS.keepAliveIntervalMs,
}) {
  const [phase, setPhaseState] = useState(INACTIVITY_PHASE.ACTIVE);
  const [countdownSeconds, setCountdownSeconds] = useState(Math.ceil(warningTimeoutMs / 1000));

  const phaseRef = useRef(INACTIVITY_PHASE.ACTIVE);
  const warningDeadlineRef = useRef(0);
  const lastActivityMsRef = useRef(Date.now());
  const warningDelayTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const keepAliveTimerRef = useRef(null);
  const keepAliveInFlightRef = useRef(false);
  const syncChannelRef = useRef(null);
  const hiddenSinceMsRef = useRef(null);
  const criticalOpsCountRef = useRef(0);
  const lastThrottledActivityMs = useRef(0);
  const mountedRef = useRef(true);
  // Latest callbacks without re-registering listeners when the caller re-renders.
  const callbacksRef = useRef({ onWarningElapsed, onStayLoggedIn, onRemoteTimeout });
  callbacksRef.current = { onWarningElapsed, onStayLoggedIn, onRemoteTimeout };

  const setPhase = useCallback((next) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhaseState(next);
  }, []);

  const clearWarningDelayTimer = useCallback(() => {
    if (warningDelayTimerRef.current) {
      clearTimeout(warningDelayTimerRef.current);
      warningDelayTimerRef.current = null;
    }
  }, []);

  const clearCountdownTimer = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const clearKeepAliveTimer = useCallback(() => {
    if (keepAliveTimerRef.current) {
      clearInterval(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    clearWarningDelayTimer();
    clearCountdownTimer();
    clearKeepAliveTimer();
  }, [clearCountdownTimer, clearKeepAliveTimer, clearWarningDelayTimer]);

  /** Back to ACTIVE with no countdown. Safe to call from any phase. */
  const closeWarning = useCallback(() => {
    clearCountdownTimer();
    warningDeadlineRef.current = 0;
    if (mountedRef.current) setCountdownSeconds(Math.ceil(warningTimeoutMs / 1000));
    if (phaseRef.current === INACTIVITY_PHASE.WARNING) setPhase(INACTIVITY_PHASE.ACTIVE);
  }, [clearCountdownTimer, setPhase, warningTimeoutMs]);

  // Forward declaration: scheduleWarning ↔ runSessionCheck reference each other through refs.
  const scheduleWarningRef = useRef(() => {});

  /**
   * Reset to a fresh idle period (the session was confirmed or refreshed).
   * Never called while the timer has ENDED (user signed out).
   */
  const resetToActive = useCallback(
    (source = "activity") => {
      if (phaseRef.current === INACTIVITY_PHASE.ENDED) return;
      lastActivityMsRef.current = Date.now();
      clearCountdownTimer();
      warningDeadlineRef.current = 0;
      if (mountedRef.current) setCountdownSeconds(Math.ceil(warningTimeoutMs / 1000));
      setPhase(INACTIVITY_PHASE.ACTIVE);
      scheduleWarningRef.current();
      syncChannelRef.current?.publish("SESSION_ACTIVITY", { at: lastActivityMsRef.current, source });
    },
    [clearCountdownTimer, setPhase, warningTimeoutMs]
  );

  /**
   * Ask the caller whether the session is still good. While this runs no countdown exists,
   * so a timeout cannot race the refresh. Any error fails open: the user keeps working.
   */
  const runSessionCheck = useCallback(
    async (which) => {
      if (phaseRef.current === INACTIVITY_PHASE.REFRESHING || phaseRef.current === INACTIVITY_PHASE.ENDED) return;
      clearCountdownTimer();
      clearWarningDelayTimer();
      setPhase(INACTIVITY_PHASE.REFRESHING);
      let outcome = "continue";
      try {
        const fn = which === "stay" ? callbacksRef.current.onStayLoggedIn : callbacksRef.current.onWarningElapsed;
        outcome = (await fn?.()) || "continue";
      } catch {
        outcome = "continue";
      }
      if (outcome === "ended") {
        setPhase(INACTIVITY_PHASE.ENDED);
        clearAllTimers();
        // The session is shared by every tab; tell them it is gone.
        syncChannelRef.current?.publish("SESSION_FORCE_LOGOUT", { at: Date.now() });
        return;
      }
      resetToActive(which === "stay" ? "stay_logged_in" : "session_check");
    },
    [clearAllTimers, clearCountdownTimer, clearWarningDelayTimer, resetToActive, setPhase]
  );

  /** The single countdown. Always clears the previous interval first, so it can never be duplicated. */
  const startCountdown = useCallback(() => {
    clearCountdownTimer();
    const tick = () => {
      // A cleared deadline means the warning is gone; a stray tick must never time out.
      if (phaseRef.current !== INACTIVITY_PHASE.WARNING || warningDeadlineRef.current <= 0) {
        clearCountdownTimer();
        return;
      }
      const remainingMs = Math.max(0, warningDeadlineRef.current - Date.now());
      if (mountedRef.current) setCountdownSeconds(Math.ceil(remainingMs / 1000));
      if (remainingMs > 0) return;
      if (criticalOpsCountRef.current > 0) {
        // Never interrupt a critical operation; look again shortly.
        warningDeadlineRef.current = Date.now() + 5_000;
        return;
      }
      void runSessionCheck("elapsed");
    };
    tick();
    if (phaseRef.current === INACTIVITY_PHASE.WARNING && warningDeadlineRef.current > 0) {
      countdownTimerRef.current = setInterval(tick, 1000);
    }
  }, [clearCountdownTimer, runSessionCheck]);

  const startWarning = useCallback(() => {
    if (!enabled || phaseRef.current !== INACTIVITY_PHASE.ACTIVE) return;
    clearWarningDelayTimer();
    warningDeadlineRef.current = lastActivityMsRef.current + idleTimeoutMs + warningTimeoutMs;
    setPhase(INACTIVITY_PHASE.WARNING);
    startCountdown();
  }, [clearWarningDelayTimer, enabled, idleTimeoutMs, setPhase, startCountdown, warningTimeoutMs]);

  const scheduleWarning = useCallback(() => {
    clearWarningDelayTimer();
    if (!enabled || phaseRef.current !== INACTIVITY_PHASE.ACTIVE) return;
    const elapsed = Date.now() - lastActivityMsRef.current;
    if (elapsed >= idleTimeoutMs) {
      startWarning();
      return;
    }
    warningDelayTimerRef.current = setTimeout(startWarning, Math.max(0, idleTimeoutMs - elapsed));
  }, [clearWarningDelayTimer, enabled, idleTimeoutMs, startWarning]);
  scheduleWarningRef.current = scheduleWarning;

  /** Real user activity: back to a fresh idle period. Ignored while a session check is running. */
  const markActive = useCallback(
    (source = "activity") => {
      if (!enabled) return;
      if (phaseRef.current === INACTIVITY_PHASE.REFRESHING || phaseRef.current === INACTIVITY_PHASE.ENDED) {
        lastActivityMsRef.current = Date.now();
        return;
      }
      resetToActive(source);
    },
    [enabled, resetToActive]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      clearAllTimers();
      warningDeadlineRef.current = 0;
      phaseRef.current = INACTIVITY_PHASE.ACTIVE;
      setPhaseState(INACTIVITY_PHASE.ACTIVE);
      return undefined;
    }

    // A fresh authenticated session starts a fresh idle period.
    lastActivityMsRef.current = Date.now();
    phaseRef.current = INACTIVITY_PHASE.ACTIVE;
    setPhaseState(INACTIVITY_PHASE.ACTIVE);

    syncChannelRef.current = createSessionInactivitySyncChannel();
    const unsubscribe = syncChannelRef.current.subscribe((message) => {
      if (message?.type === "SESSION_ACTIVITY") {
        const ts = Number(message?.payload?.at || 0);
        if (!Number.isFinite(ts) || ts <= 0 || ts <= lastActivityMsRef.current) return;
        if (phaseRef.current === INACTIVITY_PHASE.REFRESHING || phaseRef.current === INACTIVITY_PHASE.ENDED) {
          lastActivityMsRef.current = ts;
          return;
        }
        lastActivityMsRef.current = ts;
        closeWarning();
        scheduleWarning();
        return;
      }
      if (message?.type === "SESSION_FORCE_LOGOUT") {
        // Another tab confirmed the session is gone (refresh token rejected). Same session here.
        if (phaseRef.current === INACTIVITY_PHASE.ENDED) return;
        setPhase(INACTIVITY_PHASE.ENDED);
        clearAllTimers();
        warningDeadlineRef.current = 0;
        Promise.resolve(callbacksRef.current.onRemoteTimeout?.()).catch(() => {});
      }
    });

    scheduleWarning();

    const onImmediateActivity = () => markActive("dom_event");
    const onThrottledActivity = () => {
      const now = Date.now();
      if (now - lastThrottledActivityMs.current < ACTIVITY_THROTTLE_MS) return;
      lastThrottledActivityMs.current = now;
      markActive("dom_event");
    };

    const onHidden = () => {
      if (hiddenSinceMsRef.current == null) hiddenSinceMsRef.current = Date.now();
      clearWarningDelayTimer();
      clearCountdownTimer();
    };
    // Returning to the tab (visibilitychange and focus both land here; it is idempotent).
    const onVisible = () => {
      const hiddenSince = hiddenSinceMsRef.current;
      hiddenSinceMsRef.current = null;
      if (hiddenSince) {
        // Time away from the tab does not count as idle time in front of it.
        const hiddenDuration = Math.max(0, Date.now() - hiddenSince);
        lastActivityMsRef.current = applyHiddenPause(lastActivityMsRef.current, hiddenDuration);
        warningDeadlineRef.current = applyHiddenPause(warningDeadlineRef.current, hiddenDuration);
      }
      if (phaseRef.current === INACTIVITY_PHASE.WARNING && warningDeadlineRef.current > 0) {
        startCountdown();
      } else if (phaseRef.current === INACTIVITY_PHASE.ACTIVE) {
        scheduleWarning();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHidden();
      else onVisible();
    };
    const onCriticalStart = () => {
      criticalOpsCountRef.current += 1;
    };
    const onCriticalEnd = () => {
      criticalOpsCountRef.current = Math.max(0, criticalOpsCountRef.current - 1);
    };

    const immediateEvents = ["click", "keydown", "input"];
    const throttledEvents = ["mousemove", "mousedown", "pointerdown", "touchstart", "scroll"];

    immediateEvents.forEach((e) => window.addEventListener(e, onImmediateActivity, { passive: true }));
    throttledEvents.forEach((e) => window.addEventListener(e, onThrottledActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisible);
    window.addEventListener("paidly:critical-op-start", onCriticalStart);
    window.addEventListener("paidly:critical-op-end", onCriticalEnd);

    return () => {
      unsubscribe?.();
      syncChannelRef.current?.close?.();
      syncChannelRef.current = null;
      clearWarningDelayTimer();
      clearCountdownTimer();
      immediateEvents.forEach((e) => window.removeEventListener(e, onImmediateActivity));
      throttledEvents.forEach((e) => window.removeEventListener(e, onThrottledActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("paidly:critical-op-start", onCriticalStart);
      window.removeEventListener("paidly:critical-op-end", onCriticalEnd);
    };
  }, [
    clearAllTimers,
    clearCountdownTimer,
    clearWarningDelayTimer,
    closeWarning,
    enabled,
    markActive,
    scheduleWarning,
    setPhase,
    startCountdown,
  ]);

  useEffect(() => {
    if (!enabled || typeof onKeepAlive !== "function") {
      clearKeepAliveTimer();
      return undefined;
    }
    clearKeepAliveTimer();
    keepAliveTimerRef.current = setInterval(async () => {
      if (keepAliveInFlightRef.current) return;
      if (phaseRef.current !== INACTIVITY_PHASE.ACTIVE) return;
      if (criticalOpsCountRef.current > 0) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const idleForMs = Date.now() - lastActivityMsRef.current;
      if (idleForMs >= idleTimeoutMs) return;
      keepAliveInFlightRef.current = true;
      try {
        await onKeepAlive();
      } catch {
        // Keep-alive is best-effort.
      } finally {
        keepAliveInFlightRef.current = false;
      }
    }, keepAliveIntervalMs);

    return () => clearKeepAliveTimer();
  }, [clearKeepAliveTimer, enabled, idleTimeoutMs, keepAliveIntervalMs, onKeepAlive]);

  /** "Stay Logged In": a real session refresh; repeated clicks join the one already running. */
  const stayLoggedIn = useCallback(() => {
    void runSessionCheck("stay");
  }, [runSessionCheck]);

  return useMemo(
    () => ({
      phase,
      warningOpen: phase === INACTIVITY_PHASE.WARNING || phase === INACTIVITY_PHASE.REFRESHING,
      refreshing: phase === INACTIVITY_PHASE.REFRESHING,
      countdownSeconds,
      stayLoggedIn,
      markActive,
    }),
    [countdownSeconds, markActive, phase, stayLoggedIn]
  );
}
