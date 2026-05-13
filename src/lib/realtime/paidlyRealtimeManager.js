/**
 * Single Supabase Realtime channel for app postgres_changes.
 * SyncEngine entity fan-out, profile updates, and notifications subscribe here — not per-component channels.
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
const REBUILD_MIN_INTERVAL_MS = 600;

/** Coalesces multiple `schedulePaidlyRealtimeRebuild` calls into one microtask. */
let pendingScheduleMicrotask = false;

/** Coalesces duplicate JWT rotation signals in one JS turn. */
let authRotateCoalesce = false;

/** Last access token pushed to Realtime via setAuth (for structured logs). */
let lastRealtimeAuthToken = null;

/** Error-path recovery: single timer + exponential backoff (replaces UI-layer reconnect storms). */
let errorRecoveryTimerId = null;
let errorRecoveryBackoffMs = 1000;
const ERROR_RECOVERY_BACKOFF_MIN_MS = 1000;
const ERROR_RECOVERY_BACKOFF_MAX_MS = 30_000;

const HEARTBEAT_INTERVAL_MS = 22_000;
let heartbeatTimerId = null;

/**
 * Watchdog: if the subscribe callback does not fire within this window the rebuild is considered
 * hung (frozen network, server not responding). `rebuildInFlight` is reset and error-recovery backoff
 * is triggered so future rebuilds are not permanently blocked.
 */
const SUBSCRIBE_WATCHDOG_MS = 20_000;
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
    // The channel reference stays until destroyMainChannel runs on next rebuild so we do not
    // double-remove it here — error recovery will schedule a fresh rebuild.
    requestPaidlyRealtimeErrorRecovery("subscribe_watchdog_expired");
  }, SUBSCRIBE_WATCHDOG_MS);
}

function startHeartbeatIfNeeded() {
  if (typeof window === "undefined" || heartbeatTimerId) return;
  heartbeatTimerId = window.setInterval(() => {
    if (!computePaidlyRealtimeWork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (isRecoveryCircuitOpen()) return;
    if (getPaidlyRealtimeConnectionPhase() === RealtimeConnectionPhase.REBUILDING) return;

    const ch = channelInstance;
    if (!ch) {
      paidlyRealtimeLog("stale_channel_detected", { reason: "heartbeat_no_channel" });
      setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.STALE, "heartbeat_no_channel");
      schedulePaidlyRealtimeRebuild("heartbeat_no_channel");
      return;
    }
    const st = String(ch.state || "").toLowerCase();
    if (st !== "joined") {
      paidlyRealtimeLog("stale_channel_detected", { reason: "heartbeat_not_joined", state: st });
      setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.STALE, `heartbeat_not_joined:${st}`);
      schedulePaidlyRealtimeRebuild("heartbeat_not_joined");
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
function createAndSubscribeMainChannel(origin) {
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
    // Watchdog must be cleared first — callback fired so no hung-subscribe risk.
    clearSubscribeWatchdog();
    rebuildInFlight = false;
    lastMainChannelSubscribeStatus = status;
    notifyMainChannelStatusListeners(status);
    applyMainChannelSubscribeStatus(status, Boolean(syncBridge.userId));

    if (status === "SUBSCRIBED") {
      errorRecoveryBackoffMs = ERROR_RECOVERY_BACKOFF_MIN_MS;
      if (String(ch.state || "").toLowerCase() === "joined") {
        setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.CONNECTED, origin);
        lastRebuildCompletedAtMs = Date.now();
        paidlyRealtimeLog("rebuild_success", { origin, status });
      }
    } else if (status === "TIMED_OUT") {
      paidlyRealtimeLog("timed_out", { origin });
      setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.FAILED, "timed_out");
      paidlyRealtimeLog("rebuild_failure", { origin, status });
      requestPaidlyRealtimeErrorRecovery(`subscribe_${status}`);
    } else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
      setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.FAILED, String(status));
      paidlyRealtimeLog("rebuild_failure", { origin, status });
      requestPaidlyRealtimeErrorRecovery(`subscribe_${status}`);
    }

    if (rebuildQueued) {
      rebuildQueued = false;
      queueMicrotask(() => runChannelRebuild("queued_after_subscribe", { force: true }));
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

  flushRebuildDelayTimer("entering_rebuild");
  rebuildInFlight = true;
  rebuildQueued = false;
  setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.REBUILDING, origin);

  destroyMainChannel(origin);
  try {
    createAndSubscribeMainChannel(origin);
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
  if (pendingScheduleMicrotask) {
    paidlyRealtimeLog("reconnect_suppressed", { kind: "schedule_coalesced", origin });
    return;
  }
  pendingScheduleMicrotask = true;
  queueMicrotask(() => {
    pendingScheduleMicrotask = false;
    runChannelRebuild(origin);
  });
}

/**
 * After subscribe errors / transport loss: one coalesced rebuild with exponential backoff.
 * @param {string} source
 */
export function requestPaidlyRealtimeErrorRecovery(source = "error_recovery") {
  if (typeof window === "undefined" || !isSupabaseConfigured) return;
  if (isRecoveryCircuitOpen()) return;
  if (!computePaidlyRealtimeWork()) return;
  if (errorRecoveryTimerId) {
    paidlyRealtimeLog("reconnect_suppressed", { kind: "error_recovery_timer_active", source });
    return;
  }
  errorRecoveryTimerId = window.setTimeout(() => {
    errorRecoveryTimerId = null;
    runChannelRebuild(`error_recovery:${source}`, { force: true });
    errorRecoveryBackoffMs = Math.min(ERROR_RECOVERY_BACKOFF_MAX_MS, errorRecoveryBackoffMs * 2);
  }, errorRecoveryBackoffMs);
}

/**
 * Called when the tab becomes visible after a short hide (below wake-recovery threshold).
 * Performs a fast stale-channel check and schedules a rebuild ONLY if the channel is not joined.
 *
 * Requirement 11: visibility changes MUST NOT force reconnects when the channel is healthy.
 * The heartbeat (22 s) remains the primary stale detector; this is a faster supplemental check.
 */
export function checkPaidlyRealtimeOnVisibilityRestore() {
  if (typeof window === "undefined" || !isSupabaseConfigured) return;
  if (!computePaidlyRealtimeWork()) return;
  if (isRecoveryCircuitOpen()) return;

  // Channel is healthy — no action; log suppressed reconnect so it is observable.
  if (isPaidlyRealtimeMainChannelJoined()) {
    paidlyRealtimeLog("reconnect_suppressed", {
      kind: "visibility_restore_channel_healthy",
      phase: getPaidlyRealtimeConnectionPhase(),
    });
    return;
  }

  const currentPhase = getPaidlyRealtimeConnectionPhase();
  // Already rebuilding or connecting — defer to the in-flight attempt.
  if (
    currentPhase === RealtimeConnectionPhase.REBUILDING ||
    currentPhase === RealtimeConnectionPhase.CONNECTING
  ) {
    paidlyRealtimeLog("reconnect_suppressed", {
      kind: "visibility_restore_rebuild_in_progress",
      phase: currentPhase,
    });
    return;
  }

  // Channel is stale or missing — schedule a rebuild.
  paidlyRealtimeLog("stale_channel_detected", {
    reason: "visibility_restore",
    phase: currentPhase,
    channel: channelInstance ? String(channelInstance.state || "unknown") : "null",
  });
  setPaidlyRealtimeConnectionPhase(RealtimeConnectionPhase.STALE, "visibility_restore");
  schedulePaidlyRealtimeRebuild("visibility_restore");
}

/** Browser came back online — optional single rebuild if work exists and channel is not joined. */
export function notifyPaidlyRealtimeNavigatorOnline() {
  if (typeof window === "undefined" || !isSupabaseConfigured) return;
  if (!computePaidlyRealtimeWork()) return;
  if (isPaidlyRealtimeMainChannelJoined()) return;
  schedulePaidlyRealtimeRebuild("navigator_online");
}

/**
 * ConnectionMonitor mount: one-shot if subscriptions exist before the channel joined.
 */
export function kickPaidlyRealtimeIfNeededOnMonitorMount() {
  if (typeof window === "undefined" || !isSupabaseConfigured) return;
  if (!computePaidlyRealtimeWork()) return;
  if (isPaidlyRealtimeMainChannelJoined()) return;
  schedulePaidlyRealtimeRebuild("connection_monitor_mount");
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
    paidlyRealtimeLog("reconnect_suppressed", { kind: "auth_rotate_microtask_coalesce", reason, tokenChanged });
    return;
  }
  authRotateCoalesce = true;
  queueMicrotask(() => {
    authRotateCoalesce = false;
    paidlyRealtimeLog("auth_rotated", { reason, tokenChanged });
    runChannelRebuild(`jwt_refresh:${reason}`, { force: true });
  });
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
  pendingScheduleMicrotask = false;
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
  errorRecoveryBackoffMs = ERROR_RECOVERY_BACKOFF_MIN_MS;
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
  schedulePaidlyRealtimeRebuild(`recovery_registry:${r}`);
}

registerRealtimeRecoveryHandler(REALTIME_RECOVERY_IDS.SYNC_ENGINE, paidlyRealtimeRegistryRecovery);
