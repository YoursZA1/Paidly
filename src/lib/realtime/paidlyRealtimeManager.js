/**
 * Single Supabase Realtime channel for app postgres_changes.
 * SyncEngine entity fan-out, profile updates, and notifications subscribe here — not per-component channels.
 *
 * Reconnect policy: coalesced error recovery with backoff (1s→2s→5s→10s→30s), visibility debounce + cooldown,
 * heartbeat validation with post-subscribe grace — see docs/Paidly-Caching-Architecture.md Layer 10.
 */
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import {
  REALTIME_RECOVERY_IDS,
  registerRealtimeRecoveryHandler,
} from "@/lib/realtimeRecoveryRegistry";
import { getConnectionLifecycleManager } from "@/lib/connection/connectionLifecycleRegistry";
import { LifecycleSignalType } from "@/lib/connection/lifecycleSignalTypes";
import { getSessionAuthority } from "@/lib/session/sessionAuthorityRegistry";
import { decideSessionAction, SESSION_DECISION } from "@/lib/sessionDecisionEngine";
import { isRecoveryCircuitOpen } from "@/lib/session/recoveryCircuit";
import { shouldHintRealtimeRecoveredFromSessionHealth, useSessionHealthStore } from "@/stores/sessionHealthStore";
import { useWakeRecoveryStore } from "@/stores/wakeRecoveryStore";
import {
  RealtimeConnectionPhase,
  __resetPaidlyRealtimeConnectionMachineForTests,
  getPaidlyRealtimeConnectionPhase,
  getPaidlyRealtimeConnectionSnapshot,
  setPaidlyRealtimeConnectionPhase,
} from "@/lib/realtime/paidlyRealtimeConnectionMachine";
import { paidlyRealtimeLog } from "@/lib/realtime/paidlyRealtimeStructuredLog";
import { recordRealtimeReconnect } from "@/lib/paidlyPerformanceMetrics";

export const PAIDLY_REALTIME_CHANNEL = "paidly-sync-realtime";

export { getPaidlyRealtimeConnectionPhase, getPaidlyRealtimeConnectionSnapshot };

/** Logical subscription families multiplexed on {@link PAIDLY_REALTIME_CHANNEL}. */
export const REALTIME_DOMAINS = Object.freeze({
  /** @type {"sync"} Entity postgres_changes via {@link setPaidlySyncRealtimeBridge}. */
  sync: "sync",
  /** @type {"profiles"} Profile row changes via {@link subscribePaidlyProfilesRealtime}. */
  profiles: "profiles",
  /** @type {"notifications"} Filtered notifications + message_deliveries. */
  notifications: "notifications",
  /** @type {"aux"} Extra tables via {@link subscribePaidlyAuxPostgres}. */
  aux: "aux",
});

/** Tables owned exclusively by SyncEngine / entity sync (do not add duplicate .on via aux hook). */
export const PAIDLY_REALTIME_SYNC_TABLES = [
  "invoices",
  "clients",
  "document_sends",
  "quotes",
  "payments",
  "expenses",
  "payslips",
];

const SYNC_TABLES_SET = new Set(PAIDLY_REALTIME_SYNC_TABLES);

let channelInstance = null;

/** Queued rebuild while a subscribe handshake is still completing. */
let rebuildQueued = false;
let rebuildInFlight = false;
let lastRebuildCompletedAtMs = 0;
let rebuildDelayTimerId = null;
const REBUILD_MIN_INTERVAL_MS = 1400;

/** Coalesces multiple `schedulePaidlyRealtimeRebuild` calls into one macrotask (yields before teardown). */
let scheduleRebuildTimerId = null;

/** Coalesces duplicate JWT rotation signals in one JS turn. */
let authRotateCoalesce = false;

/** Last access token pushed to Realtime via setAuth (for structured logs). */
let lastRealtimeAuthToken = null;

/** Error-path recovery: single timer + discrete exponential backoff (1s → 2s → 5s → 10s → 30s cap). */
const RECONNECT_BACKOFF_MS_STEPS = Object.freeze([1000, 2000, 5000, 10_000, 30_000]);
let reconnectBackoffStepIndex = 0;
let errorRecoveryTimerId = null;

/** Subscribe callback must fire within this window or we treat the WebSocket handshake as hung. */
const WS_SUBSCRIBE_TIMEOUT_MS = 20_000;

/** Consecutive subscribe failures before the realtime circuit breaker opens (FAILED + pause). */
const REALTIME_CIRCUIT_MAX_CONSECUTIVE_FAILURES = 5;
const REALTIME_CIRCUIT_OPEN_MS = 120_000;
let realtimeConsecutiveFailures = 0;
let realtimeCircuitBreakerUntilMs = 0;
let realtimeCircuitBreakerClearTimerId = null;

/** Monotonic generation so stale subscribe callbacks cannot mutate state after a newer rebuild starts. */
let channelSubscribeGeneration = 0;

/** Debounce rapid visibility events before running stale-channel checks. */
const VISIBILITY_RECONNECT_DEBOUNCE_MS = 400;
let visibilityReconnectDebounceTimerId = null;

/** Minimum spacing between JWT-driven channel rebuilds (setAuth still runs every call). */
const JWT_CHANNEL_REBUILD_MIN_MS = 2000;
let lastJwtChannelRebuildAtMs = 0;

/**
 * When subscribe/transport fails in a tight burst, each rebuild tears down the socket and the browser
 * logs "WebSocket closed before connection established" repeatedly. Cool down so the main thread and
 * Supabase transport can settle; JWT-driven rebuilds still run so tokens stay bound to Realtime.
 */
const TRANSPORT_BURST_WINDOW_MS = 12_000;
const TRANSPORT_BURST_THRESHOLD = 4;
const TRANSPORT_COOLDOWN_MS = 35_000;
let transportFailureTimestamps = [];
let transportCooldownUntilMs = 0;
let transportCooldownTimerId = null;

/**
 * Hard cap: never spin unbounded reconnects. If we enter too many full rebuilds in a rolling window,
 * suppress all reconnect triggers except JWT binding and the post–transport-cooldown wake (both can
 * still run while suppressed for rate).
 */
const REBUILD_HARD_RATE_WINDOW_MS = 90_000;
const REBUILD_HARD_RATE_MAX_IN_WINDOW = 10;
const RECONNECT_HARD_SUPPRESS_MS = 90_000;
let reconnectHardSuppressUntilMs = 0;
let reconnectHardSuppressClearTimerId = null;
let reconnectHardRateTimestamps = [];

/** At most one visibility-driven reconnect schedule per interval (tab focus churn). */
const VISIBILITY_RECONNECT_MIN_MS = 30_000;
let lastVisibilityReconnectScheduleAt = 0;

/** Heartbeat must not enqueue reconnect storms while the channel is flapping. */
const HEARTBEAT_RECONNECT_MIN_MS = 45_000;
let lastHeartbeatReconnectScheduleAt = 0;

/** After SUBSCRIBED+joined, ignore transient `state !== joined` in heartbeat (socket state catch-up). */
const HEARTBEAT_POST_SUBSCRIBE_GRACE_MS = 5000;
let lastSuccessfulSubscribeAtMs = 0;

function isJwtRefreshOrigin(origin) {
  return String(origin || "").startsWith("jwt_refresh");
}

function isTransportCooldownWakeOrigin(origin) {
  return String(origin || "").includes("transport_cooldown_end");
}

function isReconnectHardRateBypassOrigin(origin) {
  return isJwtRefreshOrigin(origin) || isTransportCooldownWakeOrigin(origin);
}

function isReconnectHardSuppressed(origin) {
  if (typeof window === "undefined") return false;
  if (isReconnectHardRateBypassOrigin(origin)) return false;
  return Date.now() < reconnectHardSuppressUntilMs;
}

function pruneReconnectHardRateWindow(now = Date.now()) {
  reconnectHardRateTimestamps = reconnectHardRateTimestamps.filter((t) => now - t <= REBUILD_HARD_RATE_WINDOW_MS);
}

function armReconnectHardSuppress(reason) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  reconnectHardSuppressUntilMs = Math.max(reconnectHardSuppressUntilMs, now + RECONNECT_HARD_SUPPRESS_MS);
  paidlyRealtimeLog("reconnect_hard_suppress_armed", {
    reason,
    untilMs: reconnectHardSuppressUntilMs,
    durationMs: RECONNECT_HARD_SUPPRESS_MS,
  });
  if (reconnectHardSuppressClearTimerId != null) return;
  reconnectHardSuppressClearTimerId = window.setTimeout(() => {
    reconnectHardSuppressClearTimerId = null;
    reconnectHardSuppressUntilMs = 0;
    reconnectHardRateTimestamps = [];
    paidlyRealtimeLog("reconnect_hard_suppress_cleared", { reason: "timer" });
  }, RECONNECT_HARD_SUPPRESS_MS);
}

function clearReconnectHardSuppressState() {
  reconnectHardSuppressUntilMs = 0;
  reconnectHardRateTimestamps = [];
  if (reconnectHardSuppressClearTimerId != null && typeof window !== "undefined") {
    window.clearTimeout(reconnectHardSuppressClearTimerId);
    reconnectHardSuppressClearTimerId = null;
  }
}

function isBrowserOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isRealtimeCircuitBreakerOpen() {
  return typeof window !== "undefined" && Date.now() < realtimeCircuitBreakerUntilMs;
}

function isRealtimeCircuitBreakerBypassOrigin(origin) {
  return isJwtRefreshOrigin(origin) || isTransportCooldownWakeOrigin(origin);
}

function clearPendingReconnectTimers(reason) {
  if (errorRecoveryTimerId != null && typeof window !== "undefined") {
    window.clearTimeout(errorRecoveryTimerId);
    errorRecoveryTimerId = null;
    paidlyRealtimeLog("reconnect_suppressed", { kind: "stale_timer_cancelled", timer: "error_recovery", reason });
  }
  if (rebuildDelayTimerId != null) {
    clearTimeout(rebuildDelayTimerId);
    rebuildDelayTimerId = null;
    paidlyRealtimeLog("reconnect_suppressed", { kind: "stale_timer_cancelled", timer: "rebuild_min_interval", reason });
  }
}

function peekReconnectBackoffDelayMs() {
  const i = Math.min(reconnectBackoffStepIndex, RECONNECT_BACKOFF_MS_STEPS.length - 1);
  return RECONNECT_BACKOFF_MS_STEPS[i];
}

function bumpReconnectBackoffAfterFailure() {
  reconnectBackoffStepIndex = Math.min(reconnectBackoffStepIndex + 1, RECONNECT_BACKOFF_MS_STEPS.length - 1);
}

function resetReconnectBackoffAndFailures() {
  reconnectBackoffStepIndex = 0;
  realtimeConsecutiveFailures = 0;
}

function openRealtimeCircuitBreaker(reason) {
  if (typeof window === "undefined") return;
  const until = Date.now() + REALTIME_CIRCUIT_OPEN_MS;
  realtimeCircuitBreakerUntilMs = until;
  clearPendingReconnectTimers("circuit_breaker_opened");
  setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.FAILED, `realtime_circuit:${reason}`);
  paidlyRealtimeLog("circuit_breaker_opened", {
    reason,
    untilMs: until,
    consecutiveFailures: realtimeConsecutiveFailures,
    openMs: REALTIME_CIRCUIT_OPEN_MS,
  });
  if (realtimeCircuitBreakerClearTimerId != null) {
    window.clearTimeout(realtimeCircuitBreakerClearTimerId);
    realtimeCircuitBreakerClearTimerId = null;
  }
  realtimeCircuitBreakerClearTimerId = window.setTimeout(() => {
    realtimeCircuitBreakerClearTimerId = null;
    realtimeCircuitBreakerUntilMs = 0;
    resetReconnectBackoffAndFailures();
    paidlyRealtimeLog("circuit_breaker_cleared", { reason: "cooldown_elapsed" });
    if (computePaidlyRealtimeWork() && !isRecoveryCircuitOpen() && !isBrowserOffline()) {
      requestPaidlyRealtimeErrorRecovery("circuit_breaker_cooldown_end");
    }
  }, REALTIME_CIRCUIT_OPEN_MS);
}

/**
 * Clears realtime backoff/circuit state and runs one rebuild (e.g. after tab wake or user refresh).
 * Safe to call when the multiplex channel is stuck after transport errors.
 */
export function resetPaidlyRealtimeForUserRecovery(reason = "user_recovery") {
  if (typeof window === "undefined" || !isSupabaseConfigured) return;
  clearPendingReconnectTimers("user_recovery");
  clearTransportCooldownState();
  clearReconnectHardSuppressState();
  realtimeCircuitBreakerUntilMs = 0;
  realtimeConsecutiveFailures = 0;
  reconnectBackoffStepIndex = 0;
  reconnectHardRateTimestamps = [];
  if (realtimeCircuitBreakerClearTimerId != null) {
    window.clearTimeout(realtimeCircuitBreakerClearTimerId);
    realtimeCircuitBreakerClearTimerId = null;
  }
  paidlyRealtimeLog("circuit_breaker_cleared", { reason: "user_recovery_reset" });
  if (!computePaidlyRealtimeWork() || isRecoveryCircuitOpen() || isBrowserOffline()) return;
  runChannelRebuild(`user_recovery:${reason}`, { force: true });
}

function recordRealtimeSubscribeFailure(reason) {
  realtimeConsecutiveFailures += 1;
  paidlyRealtimeLog("reconnect_attempt_failed", {
    reason,
    consecutiveFailures: realtimeConsecutiveFailures,
    maxBeforeCircuit: REALTIME_CIRCUIT_MAX_CONSECUTIVE_FAILURES,
  });
  if (realtimeConsecutiveFailures >= REALTIME_CIRCUIT_MAX_CONSECUTIVE_FAILURES) {
    openRealtimeCircuitBreaker(reason);
  }
}

function isTransportCooldownActive() {
  return typeof window !== "undefined" && Date.now() < transportCooldownUntilMs;
}

function clearTransportCooldownState() {
  transportFailureTimestamps = [];
  transportCooldownUntilMs = 0;
  if (transportCooldownTimerId != null && typeof window !== "undefined") {
    window.clearTimeout(transportCooldownTimerId);
    transportCooldownTimerId = null;
  }
}

function recordRealtimeTransportSubscribeFailure() {
  if (typeof window === "undefined") return;
  if (transportCooldownTimerId != null) return;
  const now = Date.now();
  transportFailureTimestamps.push(now);
  transportFailureTimestamps = transportFailureTimestamps.filter((t) => now - t <= TRANSPORT_BURST_WINDOW_MS);
  if (transportFailureTimestamps.length < TRANSPORT_BURST_THRESHOLD) return;

  transportCooldownUntilMs = now + TRANSPORT_COOLDOWN_MS;
  paidlyRealtimeLog("transport_cooldown_armed", {
    failuresInWindow: transportFailureTimestamps.length,
    windowMs: TRANSPORT_BURST_WINDOW_MS,
    cooldownMs: TRANSPORT_COOLDOWN_MS,
  });

  if (transportCooldownTimerId != null) return;
  transportCooldownTimerId = window.setTimeout(() => {
    transportCooldownTimerId = null;
    transportCooldownUntilMs = 0;
    transportFailureTimestamps = [];
    paidlyRealtimeLog("transport_cooldown_cleared", {});
    if (!computePaidlyRealtimeWork() || isRecoveryCircuitOpen()) return;
    requestPaidlyRealtimeErrorRecovery("transport_cooldown_end");
  }, TRANSPORT_COOLDOWN_MS);
}

const HEARTBEAT_INTERVAL_MS = 22_000;
let heartbeatTimerId = null;

/**
 * Watchdog: if the subscribe callback does not fire within this window the rebuild is considered
 * hung (frozen network, server not responding). `rebuildInFlight` is reset and error-recovery backoff
 * is triggered so future rebuilds are not permanently blocked.
 */
const SUBSCRIBE_WATCHDOG_MS = WS_SUBSCRIBE_TIMEOUT_MS;
let subscribeWatchdogId = null;

const syncBridge = {
  userId: null,
  onEntityEvent: null,
};

const profileListeners = new Set();
const notificationListeners = new Set();
let notificationUserId = null;

/** @type {Map<string, Set<(payload: object) => void>>} */
const auxTableListeners = new Map();

/** @type {Set<(status: string) => void>} */
const mainChannelStatusListeners = new Set();
/** Last status from {@link PAIDLY_REALTIME_CHANNEL} subscribe callback (for late listeners). */
let lastMainChannelSubscribeStatus = null;

function computePaidlyRealtimeWork() {
  return Boolean(
    (syncBridge.userId && syncBridge.onEntityEvent) ||
      profileListeners.size > 0 ||
      (notificationUserId && notificationListeners.size > 0) ||
      auxTableListeners.size > 0
  );
}

function clearSubscribeWatchdog() {
  if (subscribeWatchdogId != null) {
    clearTimeout(subscribeWatchdogId);
    subscribeWatchdogId = null;
  }
}

function startSubscribeWatchdog(origin) {
  clearSubscribeWatchdog();
  subscribeWatchdogId = setTimeout(() => {
    subscribeWatchdogId = null;
    if (!rebuildInFlight) return; // subscribe already resolved — nothing to do
    paidlyRealtimeLog("rebuild_failure", {
      origin,
      reason: "subscribe_watchdog_expired",
      detail: `subscribe callback did not fire within ${SUBSCRIBE_WATCHDOG_MS}ms`,
    });
    setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.FAILED, "subscribe_watchdog_expired");
    rebuildInFlight = false;
    recordRealtimeSubscribeFailure("subscribe_watchdog_expired");
    recordRealtimeTransportSubscribeFailure();
    if (!isRealtimeCircuitBreakerOpen()) {
      requestPaidlyRealtimeErrorRecovery("subscribe_watchdog_expired");
      bumpReconnectBackoffAfterFailure();
    }
  }, SUBSCRIBE_WATCHDOG_MS);
}

function startHeartbeatIfNeeded() {
  if (typeof window === "undefined" || heartbeatTimerId) return;
  heartbeatTimerId = window.setInterval(() => {
    if (!computePaidlyRealtimeWork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (isRecoveryCircuitOpen()) return;
    if (getPaidlyRealtimeConnectionPhase() === RealtimeConnectionPhase.RECONNECTING) return;

    const ch = channelInstance;
    if (!ch) {
      paidlyRealtimeLog("stale_channel_detected", { reason: "heartbeat_no_channel" });
      setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.STALE, "heartbeat_no_channel");
      const hbNow = Date.now();
      if (hbNow - lastHeartbeatReconnectScheduleAt < HEARTBEAT_RECONNECT_MIN_MS) {
        paidlyRealtimeLog("reconnect_suppressed", {
          kind: "heartbeat_reconnect_rate_limited",
          reason: "heartbeat_no_channel",
          minIntervalMs: HEARTBEAT_RECONNECT_MIN_MS,
        });
        return;
      }
      lastHeartbeatReconnectScheduleAt = hbNow;
      requestPaidlyRealtimeErrorRecovery("heartbeat_no_channel");
      return;
    }
    const st = String(ch.state || "").toLowerCase();
    if (st !== "joined") {
      const sinceOk = Date.now() - lastSuccessfulSubscribeAtMs;
      if (sinceOk >= 0 && sinceOk < HEARTBEAT_POST_SUBSCRIBE_GRACE_MS) {
        paidlyRealtimeLog("reconnect_suppressed", {
          kind: "heartbeat_post_subscribe_grace",
          state: st,
          graceMs: HEARTBEAT_POST_SUBSCRIBE_GRACE_MS,
        });
        return;
      }
      paidlyRealtimeLog("stale_channel_detected", { reason: "heartbeat_not_joined", state: st });
      setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.STALE, `heartbeat_not_joined:${st}`);
      const hbNow = Date.now();
      if (hbNow - lastHeartbeatReconnectScheduleAt < HEARTBEAT_RECONNECT_MIN_MS) {
        paidlyRealtimeLog("reconnect_suppressed", {
          kind: "heartbeat_reconnect_rate_limited",
          reason: "heartbeat_not_joined",
          minIntervalMs: HEARTBEAT_RECONNECT_MIN_MS,
        });
        return;
      }
      lastHeartbeatReconnectScheduleAt = hbNow;
      requestPaidlyRealtimeErrorRecovery("heartbeat_not_joined");
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeatIfIdle() {
  if (computePaidlyRealtimeWork()) return;
  if (heartbeatTimerId && typeof window !== "undefined") {
    window.clearInterval(heartbeatTimerId);
    heartbeatTimerId = null;
  }
}

/**
 * @param {string} status — Supabase channel subscribe status
 * @param {boolean} believedSignedIn — proxy for session decision engine (sync bridge user id)
 */
function applyMainChannelSubscribeStatus(status, believedSignedIn) {
  const clm = getConnectionLifecycleManager();
  if (clm) {
    if (status === "SUBSCRIBED") {
      clm.report({ type: LifecycleSignalType.REALTIME_SUBSCRIBED });
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      clm.report({ type: LifecycleSignalType.REALTIME_DISCONNECTED, status, believedSignedIn });
    }
    return;
  }
  const sink = getSessionAuthority();
  if (status === "SUBSCRIBED") {
    sink?.markConnected("sync_realtime_ready");
    if (shouldHintRealtimeRecoveredFromSessionHealth(useSessionHealthStore.getState().status)) {
      sink?.reportRealtimeRecovered("realtime_recovered");
    }
    return;
  }
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
    sink?.reportRealtimeUnstable("realtime_channel_unstable");
    const decision = decideSessionAction({
      reason: "sync_realtime_unstable",
      believedSignedIn,
      online: typeof navigator !== "undefined" ? navigator.onLine !== false : true,
    });
    if (decision.action === SESSION_DECISION.RECONNECTING) {
      sink?.markReconnecting(decision.reason);
    }
  }
}

function notifyMainChannelStatusListeners(status) {
  for (const fn of mainChannelStatusListeners) {
    try {
      fn(status);
    } catch (e) {
      if (import.meta.env?.DEV) {
        console.warn("[PaidlyRealtime] main-channel status listener error", e?.message || e);
      }
    }
  }
}

function recoveryLockBlocksRealtimeDelivery() {
  return useWakeRecoveryStore.getState().blockMutations;
}

function auxConfigKey(schema, table, filter) {
  return `${schema}:${table}:${filter || ""}`;
}

function dispatchAux(schema, table, filter, payload) {
  const k = auxConfigKey(schema, table, filter);
  const set = auxTableListeners.get(k);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch (e) {
      if (import.meta.env?.DEV) {
        console.warn("[PaidlyRealtime] aux listener error", e?.message || e);
      }
    }
  }
}

/**
 * Fully remove the multiplex channel from the Supabase client (unsubscribe + teardown).
 * @param {string} origin
 */
function destroyMainChannel(origin) {
  const prev = channelInstance;
  if (!prev) return;
  paidlyRealtimeLog("channel_destroyed", { origin, channel: PAIDLY_REALTIME_CHANNEL });
  try {
    supabase.removeChannel(prev);
  } catch (e) {
    paidlyRealtimeLog("rebuild_failure", { step: "removeChannel", message: String(e?.message || e) });
  }
  channelInstance = null;
}

/**
 * @param {string} [reason]
 */
function flushRebuildDelayTimer(reason = "flush") {
  if (rebuildDelayTimerId) {
    clearTimeout(rebuildDelayTimerId);
    rebuildDelayTimerId = null;
    paidlyRealtimeLog("reconnect_suppressed", { kind: "rebuild_timer_cleared", reason });
  }
}

/**
 * Core (re)build: destroy any existing channel, attach postgres listeners once, subscribe.
 * Caller owns phase transitions and debounce gates.
 * @param {string} origin
 */
function createAndSubscribeMainChannel(origin, subscribeGen) {
  const hasSync = Boolean(syncBridge.userId && syncBridge.onEntityEvent);
  const hasProfiles = profileListeners.size > 0;
  const hasNotifications = Boolean(notificationUserId && notificationListeners.size > 0);
  const hasAux = auxTableListeners.size > 0;

  if (!hasSync && !hasProfiles && !hasNotifications && !hasAux) {
    lastMainChannelSubscribeStatus = null;
    setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.IDLE, "no_listeners");
    stopHeartbeatIfIdle();
    rebuildInFlight = false;
    paidlyRealtimeLog("rebuild_success", { origin, detail: "no_work_skipped_create" });
    return;
  }

  startHeartbeatIfNeeded();
  setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.CONNECTING, origin);

  const ch = supabase.channel(PAIDLY_REALTIME_CHANNEL);
  paidlyRealtimeLog("channel_created", { origin, channel: PAIDLY_REALTIME_CHANNEL });

  if (hasSync) {
    for (const table of PAIDLY_REALTIME_SYNC_TABLES) {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        if (recoveryLockBlocksRealtimeDelivery()) return;
        syncBridge.onEntityEvent(table, payload);
      });
    }
  }

  if (hasProfiles) {
    ch.on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (payload) => {
      if (recoveryLockBlocksRealtimeDelivery()) return;
      const normalized = {
        table: "profiles",
        eventType: payload.eventType,
        new: payload.new ?? null,
        old: payload.old ?? null,
      };
      for (const fn of profileListeners) {
        try {
          fn(normalized);
        } catch (e) {
          if (import.meta.env?.DEV) {
            console.warn("[PaidlyRealtime] profile listener error", e?.message || e);
          }
        }
      }
    });
  }

  if (hasNotifications) {
    const notify = () => {
      if (recoveryLockBlocksRealtimeDelivery()) return;
      for (const fn of notificationListeners) {
        try {
          fn();
        } catch (e) {
          if (import.meta.env?.DEV) {
            console.warn("[PaidlyRealtime] notification listener error", e?.message || e);
          }
        }
      }
    };
    ch.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${notificationUserId}`,
      },
      notify
    );
    ch.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "message_deliveries",
        filter: `user_id=eq.${notificationUserId}`,
      },
      notify
    );
  }

  for (const [key, listeners] of auxTableListeners) {
    if (!listeners.size) continue;
    const parts = key.split(":");
    const schema = parts[0];
    const table = parts[1];
    const filter = parts.length > 2 ? parts.slice(2).join(":") : "";
    const filterOpt = filter || undefined;
    const config = { event: "*", schema, table };
    if (filterOpt) config.filter = filterOpt;
    ch.on("postgres_changes", config, (payload) => {
      if (recoveryLockBlocksRealtimeDelivery()) return;
      dispatchAux(schema, table, filterOpt, payload);
    });
  }

  startSubscribeWatchdog(origin);
  ch.subscribe((status) => {
    if (subscribeGen !== channelSubscribeGeneration) {
      paidlyRealtimeLog("reconnect_suppressed", {
        kind: "stale_subscribe_callback",
        subscribeGen,
        currentGen: channelSubscribeGeneration,
        status,
      });
      return;
    }
    // Watchdog must be cleared first — callback fired so no hung-subscribe risk.
    clearSubscribeWatchdog();
    rebuildInFlight = false;
    lastMainChannelSubscribeStatus = status;

    const runStatusSideEffects = () => {
      notifyMainChannelStatusListeners(status);
      applyMainChannelSubscribeStatus(status, Boolean(syncBridge.userId));
    };

    // Failure statuses: defer listener + lifecycle work to the next macrotask so this callback returns
    // before React/session stores run (reduces event-loop saturation with transport teardown).
    if (status === "SUBSCRIBED") {
      runStatusSideEffects();
    } else if (typeof window !== "undefined") {
      window.setTimeout(runStatusSideEffects, 0);
    } else {
      runStatusSideEffects();
    }

    if (status === "SUBSCRIBED") {
      if (String(ch.state || "").toLowerCase() === "joined") {
        resetReconnectBackoffAndFailures();
        clearTransportCooldownState();
        clearReconnectHardSuppressState();
        lastVisibilityReconnectScheduleAt = 0;
        lastHeartbeatReconnectScheduleAt = 0;
        if (realtimeCircuitBreakerUntilMs > 0 || realtimeCircuitBreakerClearTimerId != null) {
          if (realtimeCircuitBreakerClearTimerId != null && typeof window !== "undefined") {
            window.clearTimeout(realtimeCircuitBreakerClearTimerId);
            realtimeCircuitBreakerClearTimerId = null;
          }
          realtimeCircuitBreakerUntilMs = 0;
          paidlyRealtimeLog("circuit_breaker_cleared", { reason: "websocket_stabilized" });
        }
        setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.CONNECTED, origin);
        lastRebuildCompletedAtMs = Date.now();
        lastSuccessfulSubscribeAtMs = Date.now();
        paidlyRealtimeLog("rebuild_success", { origin, status });
        paidlyRealtimeLog("websocket_stabilized", { origin, channel: PAIDLY_REALTIME_CHANNEL });
      }
    } else if (status === "TIMED_OUT") {
      paidlyRealtimeLog("timed_out", { origin });
      setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.FAILED, "timed_out");
      paidlyRealtimeLog("rebuild_failure", { origin, status });
      recordRealtimeSubscribeFailure(`subscribe_${status}`);
      recordRealtimeTransportSubscribeFailure();
      if (!isRealtimeCircuitBreakerOpen()) {
        requestPaidlyRealtimeErrorRecovery(`subscribe_${status}`);
        bumpReconnectBackoffAfterFailure();
      }
    } else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
      setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.FAILED, String(status));
      paidlyRealtimeLog("rebuild_failure", { origin, status });
      recordRealtimeSubscribeFailure(`subscribe_${status}`);
      recordRealtimeTransportSubscribeFailure();
      if (!isRealtimeCircuitBreakerOpen()) {
        requestPaidlyRealtimeErrorRecovery(`subscribe_${status}`);
        bumpReconnectBackoffAfterFailure();
      }
    }

    if (rebuildQueued) {
      rebuildQueued = false;
      if (typeof window !== "undefined") {
        window.setTimeout(() => runChannelRebuild("queued_after_subscribe", { force: true }), 0);
      } else {
        queueMicrotask(() => runChannelRebuild("queued_after_subscribe", { force: true }));
      }
    }
  });

  channelInstance = ch;
}

/** @param {{ force?: boolean }} [opts] — `force` skips min-interval debounce (JWT rotation, timer drain). */
function runChannelRebuild(origin, opts = {}) {
  const force = Boolean(
    opts.force ||
      origin.startsWith("jwt_refresh") ||
      origin.startsWith("debounced_after_min_interval") ||
      origin.startsWith("error_recovery") ||
      origin.endsWith("_subscribe") ||
      origin === "sync_bridge" ||
      origin.endsWith("_unsubscribe")
  );

  if (isRecoveryCircuitOpen()) {
    paidlyRealtimeLog("reconnect_suppressed", { kind: "recovery_circuit_open", origin });
    rebuildInFlight = false;
    return;
  }

  if (isBrowserOffline()) {
    paidlyRealtimeLog("reconnect_skipped", { reason: "offline", origin });
    rebuildInFlight = false;
    return;
  }

  if (isRealtimeCircuitBreakerOpen() && !isRealtimeCircuitBreakerBypassOrigin(origin)) {
    paidlyRealtimeLog("reconnect_skipped", {
      reason: "realtime_circuit_breaker",
      origin,
      untilMs: realtimeCircuitBreakerUntilMs,
    });
    rebuildInFlight = false;
    return;
  }

  if (isTransportCooldownActive() && !isJwtRefreshOrigin(origin)) {
    paidlyRealtimeLog("reconnect_suppressed", {
      kind: "transport_cooldown",
      origin,
      untilMs: transportCooldownUntilMs,
    });
    rebuildInFlight = false;
    return;
  }

  if (isReconnectHardSuppressed(origin)) {
    paidlyRealtimeLog("reconnect_suppressed", {
      kind: "reconnect_hard_suppress",
      origin,
      untilMs: reconnectHardSuppressUntilMs,
    });
    rebuildInFlight = false;
    return;
  }

  if (rebuildInFlight) {
    rebuildQueued = true;
    paidlyRealtimeLog("reconnect_suppressed", { kind: "rebuild_in_flight", origin });
    return;
  }

  const now = Date.now();
  if (!force && now - lastRebuildCompletedAtMs < REBUILD_MIN_INTERVAL_MS) {
    if (!rebuildDelayTimerId) {
      rebuildDelayTimerId = setTimeout(() => {
        rebuildDelayTimerId = null;
        runChannelRebuild("debounced_after_min_interval", { force: true });
      }, REBUILD_MIN_INTERVAL_MS);
    }
    paidlyRealtimeLog("reconnect_suppressed", {
      kind: "rebuild_min_interval",
      origin,
      waitMs: REBUILD_MIN_INTERVAL_MS,
    });
    return;
  }

  const rateNow = Date.now();
  pruneReconnectHardRateWindow(rateNow);
  if (!isReconnectHardRateBypassOrigin(origin)) {
    if (reconnectHardRateTimestamps.length >= REBUILD_HARD_RATE_MAX_IN_WINDOW) {
      armReconnectHardSuppress("rebuild_rate_budget_exceeded");
      paidlyRealtimeLog("reconnect_suppressed", {
        kind: "reconnect_hard_rate_budget",
        origin,
        windowMs: REBUILD_HARD_RATE_WINDOW_MS,
        maxInWindow: REBUILD_HARD_RATE_MAX_IN_WINDOW,
      });
      rebuildInFlight = false;
      return;
    }
    reconnectHardRateTimestamps.push(rateNow);
  }

  flushRebuildDelayTimer("entering_rebuild");
  clearPendingReconnectTimers("reconnect_started");
  rebuildInFlight = true;
  rebuildQueued = false;
  const subscribeGen = ++channelSubscribeGeneration;
  setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.RECONNECTING, origin);
  paidlyRealtimeLog("reconnect_started", { origin, subscribeGen });
  recordRealtimeReconnect();

  destroyMainChannel(origin);
  try {
    createAndSubscribeMainChannel(origin, subscribeGen);
  } catch (e) {
    rebuildInFlight = false;
    setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.FAILED, "create_throw");
    paidlyRealtimeLog("rebuild_failure", { origin, message: String(e?.message || e) });
  }
}

/**
 * @param {string} [origin]
 */
export function schedulePaidlyRealtimeRebuild(origin = "schedule") {
  if (isRecoveryCircuitOpen()) return;
  if (typeof window !== "undefined" && isBrowserOffline()) {
    paidlyRealtimeLog("reconnect_skipped", { reason: "offline", origin, op: "schedule" });
    return;
  }
  if (typeof window !== "undefined" && isRealtimeCircuitBreakerOpen() && !isRealtimeCircuitBreakerBypassOrigin(origin)) {
    paidlyRealtimeLog("reconnect_skipped", { reason: "realtime_circuit_breaker", origin, op: "schedule" });
    return;
  }
  if (typeof window !== "undefined" && isReconnectHardSuppressed(origin)) {
    paidlyRealtimeLog("reconnect_suppressed", { kind: "reconnect_hard_suppress_schedule", origin });
    return;
  }
  if (typeof window === "undefined") {
    runChannelRebuild(origin);
    return;
  }
  if (scheduleRebuildTimerId != null) {
    paidlyRealtimeLog("reconnect_suppressed", { kind: "schedule_coalesced", origin });
    return;
  }
  scheduleRebuildTimerId = window.setTimeout(() => {
    scheduleRebuildTimerId = null;
    runChannelRebuild(origin);
  }, 0);
}

/**
 * After subscribe errors / transport loss: one coalesced rebuild with exponential backoff.
 * @param {string} source
 */
export function requestPaidlyRealtimeErrorRecovery(source = "error_recovery") {
  if (typeof window === "undefined" || !isSupabaseConfigured) return;
  if (isRecoveryCircuitOpen()) return;
  if (isBrowserOffline()) {
    paidlyRealtimeLog("reconnect_skipped", { reason: "offline", source, op: "error_recovery" });
    return;
  }
  if (!computePaidlyRealtimeWork()) return;
  const recoveryOrigin = `error_recovery:${source}`;
  if (isRealtimeCircuitBreakerOpen() && !isRealtimeCircuitBreakerBypassOrigin(recoveryOrigin)) {
    paidlyRealtimeLog("reconnect_skipped", { reason: "realtime_circuit_breaker", source });
    return;
  }
  if (isReconnectHardSuppressed(recoveryOrigin)) {
    paidlyRealtimeLog("reconnect_suppressed", { kind: "error_recovery_hard_suppress", source });
    return;
  }
  if (isTransportCooldownActive() && !String(source || "").includes("transport_cooldown_end")) {
    paidlyRealtimeLog("reconnect_suppressed", { kind: "error_recovery_deferred_transport_cooldown", source });
    return;
  }
  if (errorRecoveryTimerId) {
    paidlyRealtimeLog("reconnect_suppressed", { kind: "error_recovery_timer_active", source });
    return;
  }
  const delayMs = peekReconnectBackoffDelayMs();
  paidlyRealtimeLog("reconnect_backoff_scheduled", {
    source,
    delayMs,
    step: reconnectBackoffStepIndex,
    steps: RECONNECT_BACKOFF_MS_STEPS,
  });
  errorRecoveryTimerId = window.setTimeout(() => {
    errorRecoveryTimerId = null;
    if (isBrowserOffline()) {
      paidlyRealtimeLog("reconnect_skipped", { reason: "offline", source, phase: "error_recovery_timer" });
      return;
    }
    const origin = `error_recovery:${source}`;
    if (isTransportCooldownActive() && !isJwtRefreshOrigin(origin) && !isTransportCooldownWakeOrigin(origin)) {
      paidlyRealtimeLog("reconnect_suppressed", { kind: "transport_cooldown_skipped_recovery", source });
      return;
    }
    runChannelRebuild(origin, { force: true });
  }, delayMs);
}

/**
 * Called when the tab becomes visible (non-wake-recovery path).
 * Debounced: rapid visibility churn does not enqueue reconnect work every event.
 */
function runVisibilityReconnectCheckInternal() {
  if (typeof window === "undefined" || !isSupabaseConfigured) return;
  if (!computePaidlyRealtimeWork()) return;
  if (isRecoveryCircuitOpen()) return;
  if (isBrowserOffline()) {
    paidlyRealtimeLog("reconnect_skipped", { reason: "offline", op: "visibility_restore" });
    return;
  }

  // Channel is healthy — no action; log suppressed reconnect so it is observable.
  if (isPaidlyRealtimeMainChannelJoined()) {
    paidlyRealtimeLog("reconnect_suppressed", {
      kind: "visibility_restore_channel_healthy",
      phase: getPaidlyRealtimeConnectionPhase(),
    });
    return;
  }

  const currentPhase = getPaidlyRealtimeConnectionPhase();
  // Already reconnecting or connecting — defer to the in-flight attempt.
  if (
    currentPhase === RealtimeConnectionPhase.RECONNECTING ||
    currentPhase === RealtimeConnectionPhase.CONNECTING
  ) {
    paidlyRealtimeLog("reconnect_suppressed", {
      kind: "visibility_restore_rebuild_in_progress",
      phase: currentPhase,
    });
    return;
  }

  // Channel is stale or missing — rate-limit visibility-driven reconnects (focus churn).
  const visNow = Date.now();
  if (visNow - lastVisibilityReconnectScheduleAt < VISIBILITY_RECONNECT_MIN_MS) {
    paidlyRealtimeLog("reconnect_suppressed", {
      kind: "visibility_reconnect_rate_limited",
      phase: currentPhase,
      minIntervalMs: VISIBILITY_RECONNECT_MIN_MS,
    });
    paidlyRealtimeLog("reconnect_cooldown", {
      source: "visibility_restore",
      minIntervalMs: VISIBILITY_RECONNECT_MIN_MS,
      phase: currentPhase,
    });
    return;
  }
  lastVisibilityReconnectScheduleAt = visNow;

  paidlyRealtimeLog("stale_channel_detected", {
    reason: "visibility_restore",
    phase: currentPhase,
    channel: channelInstance ? String(channelInstance.state || "unknown") : "null",
  });
  setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.STALE, "visibility_restore");
  requestPaidlyRealtimeErrorRecovery("visibility_restore");
}

export function checkPaidlyRealtimeOnVisibilityRestore() {
  if (typeof window === "undefined") return;
  if (visibilityReconnectDebounceTimerId != null) {
    window.clearTimeout(visibilityReconnectDebounceTimerId);
  }
  visibilityReconnectDebounceTimerId = window.setTimeout(() => {
    visibilityReconnectDebounceTimerId = null;
    runVisibilityReconnectCheckInternal();
  }, VISIBILITY_RECONNECT_DEBOUNCE_MS);
}

/** Browser came back online — optional single rebuild if work exists and channel is not joined. */
export function notifyPaidlyRealtimeNavigatorOnline() {
  if (typeof window === "undefined" || !isSupabaseConfigured) return;
  if (!computePaidlyRealtimeWork()) return;
  if (isPaidlyRealtimeMainChannelJoined()) return;
  requestPaidlyRealtimeErrorRecovery("navigator_online");
}

/**
 * ConnectionMonitor mount: one-shot if subscriptions exist before the channel joined.
 */
export function kickPaidlyRealtimeIfNeededOnMonitorMount() {
  if (typeof window === "undefined" || !isSupabaseConfigured) return;
  if (!computePaidlyRealtimeWork()) return;
  if (isPaidlyRealtimeMainChannelJoined()) return;
  requestPaidlyRealtimeErrorRecovery("connection_monitor_mount");
}

export function validatePaidlyRealtime() {
  const hasWork = computePaidlyRealtimeWork();
  const joined = isPaidlyRealtimeMainChannelJoined();
  return {
    ok: !hasWork || joined,
    hasWork,
    joined,
  };
}

/**
 * After JWT rotation: push token into Realtime, **fully** tear down the multiplex channel, then recreate it.
 * Coalesces duplicate refresh signals in the same synchronous burst.
 *
 * @param {string} accessToken
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
export async function reconcilePaidlyRealtimeAfterTokenRefresh(accessToken, reason = "token_refresh") {
  if (typeof window === "undefined" || !isSupabaseConfigured) return;
  if (!accessToken || typeof accessToken !== "string") return;
  if (!computePaidlyRealtimeWork()) return;

  try {
    await supabase.realtime.setAuth(accessToken);
  } catch (e) {
    paidlyRealtimeLog("rebuild_failure", { step: "setAuth", message: String(e?.message || e), reason });
    if (import.meta.env?.DEV) {
      console.warn("[PaidlyRealtime] realtime.setAuth after token refresh failed:", e?.message || e);
    }
  }

  const tokenChanged = lastRealtimeAuthToken !== accessToken;
  lastRealtimeAuthToken = accessToken;

  if (authRotateCoalesce) {
    paidlyRealtimeLog("reconnect_suppressed", { kind: "auth_rotate_burst_coalesce", reason, tokenChanged });
    return;
  }
  authRotateCoalesce = true;

  const flushJwtRebuild = () => {
    authRotateCoalesce = false;
    paidlyRealtimeLog("auth_rotated", { reason, tokenChanged });
    if (isBrowserOffline()) {
      paidlyRealtimeLog("reconnect_skipped", { reason: "offline", op: "jwt_refresh_rebuild", jwtReason: reason });
      return;
    }
    if (!computePaidlyRealtimeWork()) return;
    const now = Date.now();
    if (lastJwtChannelRebuildAtMs > 0 && now - lastJwtChannelRebuildAtMs < JWT_CHANNEL_REBUILD_MIN_MS) {
      paidlyRealtimeLog("reconnect_suppressed", {
        kind: "jwt_refresh_rebuild_throttled",
        jwtReason: reason,
        minMs: JWT_CHANNEL_REBUILD_MIN_MS,
        elapsedMs: now - lastJwtChannelRebuildAtMs,
      });
      return;
    }
    lastJwtChannelRebuildAtMs = now;
    clearPendingReconnectTimers("jwt_refresh_preempt");
    runChannelRebuild(`jwt_refresh:${reason}`, { force: true });
  };

  if (typeof window === "undefined") {
    flushJwtRebuild();
    return;
  }
  window.setTimeout(flushJwtRebuild, 0);
}

/**
 * Auth pipeline hook: same as {@link reconcilePaidlyRealtimeAfterTokenRefresh}.
 * @param {string} accessToken
 * @param {string} [reason]
 */
export function onTokenRefreshSuccess(accessToken, reason = "token_refreshed") {
  return reconcilePaidlyRealtimeAfterTokenRefresh(accessToken, reason);
}

/**
 * Resolve when the multiplexed channel is joined or there is no realtime work. Rejects never — returns false on timeout.
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<boolean>}
 */
export function waitForPaidlyMainChannelJoined({ timeoutMs = 12_000 } = {}) {
  if (typeof window === "undefined") return Promise.resolve(true);
  if (!hasPaidlyRealtimeWork()) return Promise.resolve(true);
  if (isPaidlyRealtimeMainChannelJoined()) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        unsub();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    const timer = window.setTimeout(() => finish(false), timeoutMs);

    const unsub = subscribePaidlyMainChannelStatus((status) => {
      if (status === "SUBSCRIBED" && isPaidlyRealtimeMainChannelJoined()) {
        finish(true);
      }
    });
  });
}

export function hasPaidlyRealtimeWork() {
  return computePaidlyRealtimeWork();
}

/**
 * Subscribe to {@link PAIDLY_REALTIME_CHANNEL} subscribe statuses (SUBSCRIBED, CLOSED, …).
 * Replays the last known status to new listeners (e.g. {@link ConnectionMonitor}).
 * @param {(status: string) => void} listener
 * @returns {() => void}
 */
export function subscribePaidlyMainChannelStatus(listener) {
  mainChannelStatusListeners.add(listener);
  if (lastMainChannelSubscribeStatus != null) {
    queueMicrotask(() => listener(lastMainChannelSubscribeStatus));
  }
  return () => {
    mainChannelStatusListeners.delete(listener);
  };
}

/** True when the multiplexed realtime channel exists and is joined. */
export function isPaidlyRealtimeMainChannelJoined() {
  const ch = channelInstance;
  if (!ch) return false;
  return String(ch.state || "").toLowerCase() === "joined";
}

/**
 * @param {{ userId: string | null, onEntityEvent: ((table: string, payload: object) => void) | null }} next
 */
export function setPaidlySyncRealtimeBridge(next) {
  syncBridge.userId = next?.userId ?? null;
  syncBridge.onEntityEvent = next?.onEntityEvent ?? null;
  schedulePaidlyRealtimeRebuild("sync_bridge");
}

/** @param {(payload: { table: string, eventType: string, new: object | null, old: object | null }) => void} listener */
export function subscribePaidlyProfilesRealtime(listener) {
  profileListeners.add(listener);
  schedulePaidlyRealtimeRebuild("profiles_subscribe");
  return () => {
    profileListeners.delete(listener);
    schedulePaidlyRealtimeRebuild("profiles_unsubscribe");
  };
}

/**
 * @param {string} userId
 * @param {() => void} listener
 */
export function subscribePaidlyNotificationsRealtime(userId, listener) {
  notificationListeners.add(listener);
  notificationUserId = userId;
  schedulePaidlyRealtimeRebuild("notifications_subscribe");
  return () => {
    notificationListeners.delete(listener);
    if (notificationListeners.size === 0) notificationUserId = null;
    schedulePaidlyRealtimeRebuild("notifications_unsubscribe");
  };
}

/**
 * Extra postgres listeners for tables outside {@link PAIDLY_REALTIME_SYNC_TABLES}.
 * @param {{ schema?: string, table: string, filter?: string }} config
 * @param {(payload: object) => void} listener
 */
export function subscribePaidlyAuxPostgres(config, listener) {
  const schema = config.schema ?? "public";
  const { table } = config;
  const filter = config.filter;
  if (SYNC_TABLES_SET.has(table) && schema === "public") {
    if (import.meta.env?.DEV) {
      console.warn(
        `[PaidlyRealtime] Table "${table}" is handled by SyncEngine; avoid a second realtime subscription.`
      );
    }
    return () => {};
  }
  const k = auxConfigKey(schema, table, filter);
  if (!auxTableListeners.has(k)) auxTableListeners.set(k, new Set());
  const bucket = auxTableListeners.get(k);
  if (bucket.has(listener)) {
    paidlyRealtimeLog("reconnect_suppressed", { kind: "duplicate_aux_listener", table, schema });
    return () => {};
  }
  bucket.add(listener);
  schedulePaidlyRealtimeRebuild("aux_subscribe");
  return () => {
    const set = auxTableListeners.get(k);
    if (set) {
      set.delete(listener);
      if (set.size === 0) auxTableListeners.delete(k);
    }
    schedulePaidlyRealtimeRebuild("aux_unsubscribe");
  };
}

/** @internal */
export function __getPaidlyRealtimeChannelForTests() {
  return channelInstance;
}

/** @internal Vitest */
export function __resetPaidlyRealtimeManagerForTests() {
  syncBridge.userId = null;
  syncBridge.onEntityEvent = null;
  profileListeners.clear();
  notificationListeners.clear();
  notificationUserId = null;
  auxTableListeners.clear();
  mainChannelStatusListeners.clear();
  lastMainChannelSubscribeStatus = null;
  rebuildQueued = false;
  rebuildInFlight = false;
  lastRebuildCompletedAtMs = 0;
  if (scheduleRebuildTimerId && typeof window !== "undefined") {
    window.clearTimeout(scheduleRebuildTimerId);
    scheduleRebuildTimerId = null;
  }
  lastRealtimeAuthToken = null;
  authRotateCoalesce = false;
  if (rebuildDelayTimerId) {
    clearTimeout(rebuildDelayTimerId);
    rebuildDelayTimerId = null;
  }
  if (errorRecoveryTimerId && typeof window !== "undefined") {
    window.clearTimeout(errorRecoveryTimerId);
    errorRecoveryTimerId = null;
  }
  if (visibilityReconnectDebounceTimerId && typeof window !== "undefined") {
    window.clearTimeout(visibilityReconnectDebounceTimerId);
    visibilityReconnectDebounceTimerId = null;
  }
  if (realtimeCircuitBreakerClearTimerId && typeof window !== "undefined") {
    window.clearTimeout(realtimeCircuitBreakerClearTimerId);
    realtimeCircuitBreakerClearTimerId = null;
  }
  realtimeCircuitBreakerUntilMs = 0;
  realtimeConsecutiveFailures = 0;
  reconnectBackoffStepIndex = 0;
  channelSubscribeGeneration = 0;
  lastJwtChannelRebuildAtMs = 0;
  clearTransportCooldownState();
  clearReconnectHardSuppressState();
  lastVisibilityReconnectScheduleAt = 0;
  lastHeartbeatReconnectScheduleAt = 0;
  lastSuccessfulSubscribeAtMs = 0;
  clearSubscribeWatchdog();
  if (heartbeatTimerId && typeof window !== "undefined") {
    window.clearInterval(heartbeatTimerId);
    heartbeatTimerId = null;
  }
  if (channelInstance) {
    try {
      supabase.removeChannel(channelInstance);
    } catch {
      /* ignore */
    }
    channelInstance = null;
  }
  __resetPaidlyRealtimeConnectionMachineForTests();
}

function paidlyRealtimeRegistryRecovery(ctx) {
  const r = ctx?.reason ?? "unknown";
  if (isRecoveryCircuitOpen()) return;
  if (!computePaidlyRealtimeWork()) return;
  requestPaidlyRealtimeErrorRecovery(`recovery_registry:${r}`);
}

registerRealtimeRecoveryHandler(REALTIME_RECOVERY_IDS.SYNC_ENGINE, paidlyRealtimeRegistryRecovery);
