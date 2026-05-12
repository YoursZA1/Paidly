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

export function applyHiddenPause(timestampMs, hiddenDurationMs) {
  const ts = Number(timestampMs || 0);
  const delta = Math.max(0, Number(hiddenDurationMs || 0));
  if (!Number.isFinite(ts) || ts <= 0) return ts;
  return ts + delta;
}

/**
 * Idle-session timeout manager with:
 * - activity listeners (mouse/keyboard/touch/input)
 * - warning countdown
 * - auto logout callback
 * - keep-alive callback while active
 * - cross-tab timer sync
 */
export function useInactivitySessionTimeout({
  enabled,
  onTimeout,
  onRemoteTimeout,
  onKeepAlive,
  idleTimeoutMs = DEFAULTS.idleTimeoutMs,
  warningTimeoutMs = DEFAULTS.warningTimeoutMs,
  keepAliveIntervalMs = DEFAULTS.keepAliveIntervalMs,
}) {
  const [warningOpen, setWarningOpen] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(Math.ceil(warningTimeoutMs / 1000));

  const warningDeadlineRef = useRef(0);
  const lastActivityMsRef = useRef(Date.now());
  const timeoutTriggeredRef = useRef(false);
  const warningDelayTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const keepAliveTimerRef = useRef(null);
  const keepAliveInFlightRef = useRef(false);
  const syncChannelRef = useRef(null);
  const hiddenSinceMsRef = useRef(null);
  const criticalOpsCountRef = useRef(0);
  // Ref mirror of warningOpen so the visibility handler always reads the current value
  // without needing to be re-registered every time the state changes.
  const warningOpenRef = useRef(false);
  // Throttle ref: prevents high-frequency events (mousemove/scroll) from hammering timers.
  const lastThrottledActivityMs = useRef(0);

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

  // Keep the ref in sync so the visibility handler never reads stale state.
  useEffect(() => { warningOpenRef.current = warningOpen; }, [warningOpen]);

  const closeWarning = useCallback(() => {
    setWarningOpen(false);
    warningOpenRef.current = false;
    setCountdownSeconds(Math.ceil(warningTimeoutMs / 1000));
    warningDeadlineRef.current = 0;
    clearCountdownTimer();
  }, [clearCountdownTimer, warningTimeoutMs]);

  const triggerTimeout = useCallback(async () => {
    if (timeoutTriggeredRef.current) return;
    if (criticalOpsCountRef.current > 0) {
      // Safeguard: never timeout while critical operations are in flight.
      warningDeadlineRef.current = Date.now() + 5_000;
      setCountdownSeconds(5);
      return;
    }
    timeoutTriggeredRef.current = true;
    syncChannelRef.current?.publish("SESSION_FORCE_LOGOUT", { at: Date.now() });
    closeWarning();
    clearWarningDelayTimer();
    clearKeepAliveTimer();
    await onTimeout?.();
  }, [clearKeepAliveTimer, clearWarningDelayTimer, closeWarning, onTimeout]);

  const startWarning = useCallback(() => {
    if (!enabled || timeoutTriggeredRef.current) return;
    clearWarningDelayTimer();

    warningDeadlineRef.current = lastActivityMsRef.current + idleTimeoutMs + warningTimeoutMs;
    setWarningOpen(true);
    clearCountdownTimer();

    const tick = () => {
      const remainingMs = Math.max(0, warningDeadlineRef.current - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      setCountdownSeconds(remainingSeconds);
      if (remainingMs <= 0) {
        void triggerTimeout();
      }
    };
    tick();
    countdownTimerRef.current = setInterval(tick, 1000);
  }, [
    clearCountdownTimer,
    clearWarningDelayTimer,
    enabled,
    idleTimeoutMs,
    triggerTimeout,
    warningTimeoutMs,
  ]);

  const scheduleWarning = useCallback(() => {
    clearWarningDelayTimer();
    if (!enabled || timeoutTriggeredRef.current) return;

    const elapsed = Date.now() - lastActivityMsRef.current;
    if (elapsed >= idleTimeoutMs + warningTimeoutMs) {
      void triggerTimeout();
      return;
    }
    if (elapsed >= idleTimeoutMs) {
      startWarning();
      return;
    }

    warningDelayTimerRef.current = setTimeout(() => {
      startWarning();
    }, Math.max(0, idleTimeoutMs - elapsed));
  }, [clearWarningDelayTimer, enabled, idleTimeoutMs, startWarning, triggerTimeout, warningTimeoutMs]);

  const markActive = useCallback(
    (source = "activity") => {
      if (!enabled) return;
      timeoutTriggeredRef.current = false;
      lastActivityMsRef.current = Date.now();
      closeWarning();
      scheduleWarning();
      syncChannelRef.current?.publish("SESSION_ACTIVITY", {
        at: lastActivityMsRef.current,
        source,
      });
    },
    [closeWarning, enabled, scheduleWarning]
  );

  useEffect(() => {
    if (!enabled) {
      clearWarningDelayTimer();
      closeWarning();
      clearKeepAliveTimer();
      return undefined;
    }

    syncChannelRef.current = createSessionInactivitySyncChannel();
    const unsubscribe = syncChannelRef.current.subscribe((message) => {
      if (message?.type === "SESSION_ACTIVITY") {
        const ts = Number(message?.payload?.at || 0);
        if (!Number.isFinite(ts) || ts <= 0) return;
        if (ts <= lastActivityMsRef.current) return;
        timeoutTriggeredRef.current = false;
        lastActivityMsRef.current = ts;
        closeWarning();
        scheduleWarning();
        return;
      }
      if (message?.type === "SESSION_FORCE_LOGOUT") {
        if (timeoutTriggeredRef.current) return;
        timeoutTriggeredRef.current = true;
        closeWarning();
        clearWarningDelayTimer();
        clearKeepAliveTimer();
        Promise.resolve(onRemoteTimeout?.()).catch(() => {});
      }
    });

    scheduleWarning();

    // Immediate activity: resets the timer without throttle (fast user response).
    const onImmediateActivity = () => markActive("dom_event");

    // Throttled activity: high-frequency events (mousemove, scroll, touchstart) capped at
    // ACTIVITY_THROTTLE_MS so we don't call clearTimeout/setTimeout 60×/sec during movement.
    const onThrottledActivity = () => {
      const now = Date.now();
      if (now - lastThrottledActivityMs.current < ACTIVITY_THROTTLE_MS) return;
      lastThrottledActivityMs.current = now;
      markActive("dom_event");
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceMsRef.current = Date.now();
        clearWarningDelayTimer();
        clearCountdownTimer();
        return;
      }
      const hiddenSince = hiddenSinceMsRef.current;
      hiddenSinceMsRef.current = null;
      if (hiddenSince) {
        const hiddenDuration = Math.max(0, Date.now() - hiddenSince);
        lastActivityMsRef.current = applyHiddenPause(lastActivityMsRef.current, hiddenDuration);
        warningDeadlineRef.current = applyHiddenPause(warningDeadlineRef.current, hiddenDuration);
      }
      // Use the ref (not the closure-captured state) to avoid stale warningOpen reads.
      if (warningOpenRef.current && warningDeadlineRef.current > 0) {
        const tickMs = Math.max(0, warningDeadlineRef.current - Date.now());
        setCountdownSeconds(Math.ceil(tickMs / 1000));
        countdownTimerRef.current = setInterval(() => {
          const remainingMs = Math.max(0, warningDeadlineRef.current - Date.now());
          const remainingSeconds = Math.ceil(remainingMs / 1000);
          setCountdownSeconds(remainingSeconds);
          if (remainingMs <= 0) {
            void triggerTimeout();
          }
        }, 1000);
      } else {
        scheduleWarning();
      }
    };
    const onCriticalStart = () => {
      criticalOpsCountRef.current += 1;
    };
    const onCriticalEnd = () => {
      criticalOpsCountRef.current = Math.max(0, criticalOpsCountRef.current - 1);
    };

    // Immediate events: user intent is clear; no throttle needed.
    const immediateEvents = ["click", "keydown", "input"];
    // Throttled events: high-frequency or passive signals.
    const throttledEvents = ["mousemove", "mousedown", "pointerdown", "touchstart", "scroll"];

    immediateEvents.forEach((e) => window.addEventListener(e, onImmediateActivity, { passive: true }));
    throttledEvents.forEach((e) => window.addEventListener(e, onThrottledActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("paidly:critical-op-start", onCriticalStart);
    window.addEventListener("paidly:critical-op-end", onCriticalEnd);

    return () => {
      unsubscribe?.();
      syncChannelRef.current?.close?.();
      syncChannelRef.current = null;
      clearWarningDelayTimer();
      clearCountdownTimer();
      clearKeepAliveTimer();
      immediateEvents.forEach((e) => window.removeEventListener(e, onImmediateActivity));
      throttledEvents.forEach((e) => window.removeEventListener(e, onThrottledActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("paidly:critical-op-start", onCriticalStart);
      window.removeEventListener("paidly:critical-op-end", onCriticalEnd);
    };
  }, [
    clearCountdownTimer,
    clearKeepAliveTimer,
    clearWarningDelayTimer,
    closeWarning,
    enabled,
    markActive,
    onRemoteTimeout,
    scheduleWarning,
    triggerTimeout,
  ]);

  useEffect(() => {
    if (!enabled || typeof onKeepAlive !== "function") {
      clearKeepAliveTimer();
      return undefined;
    }
    keepAliveTimerRef.current = setInterval(async () => {
      if (keepAliveInFlightRef.current) return;
      if (warningOpen) return;
      if (criticalOpsCountRef.current > 0) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const idleForMs = Date.now() - lastActivityMsRef.current;
      if (idleForMs >= idleTimeoutMs) return;
      keepAliveInFlightRef.current = true;
      try {
        await onKeepAlive();
      } finally {
        keepAliveInFlightRef.current = false;
      }
    }, keepAliveIntervalMs);

    return () => clearKeepAliveTimer();
  }, [clearKeepAliveTimer, enabled, idleTimeoutMs, keepAliveIntervalMs, onKeepAlive, warningOpen]);

  const stayLoggedIn = useCallback(() => {
    markActive("stay_logged_in");
  }, [markActive]);

  const api = useMemo(
    () => ({
      warningOpen,
      countdownSeconds,
      stayLoggedIn,
      markActive,
    }),
    [countdownSeconds, markActive, stayLoggedIn, warningOpen]
  );

  return api;
}
