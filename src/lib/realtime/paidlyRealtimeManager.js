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
import { useConnectionLifecycleStore } from "@/lib/connection/connectionLifecycleStore";
import { SESSION_STATUS, shouldHintRealtimeRecoveredFromSessionHealth, useSessionHealthStore } from "@/stores/sessionHealthStore";
import { useWakeRecoveryStore } from "@/stores/wakeRecoveryStore";

export const PAIDLY_REALTIME_CHANNEL = "paidly-sync-realtime";

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
let rebuildQueued = false;

/** Single-flight for {@link repairStalePaidlyRealtimeOnTabVisible}. */
let visibleStaleRepairPromise = null;

/** Dedupes multiplex rebuild storms when TOKEN_REFRESHED and refreshSession both land with the same JWT. */
let lastReconciledAccessToken = null;
let lastReconciledAtMs = 0;
const REALTIME_JWT_RECONCILE_DEBOUNCE_MS = 400;

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

function recoveryHandler() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (!computePaidlyRealtimeWork()) return;
  const ch = channelInstance;
  const st = ch ? String(ch.state || "").toLowerCase() : "";
  if (st === "joined") return;
  if (import.meta.env?.DEV) {
    console.info("[PaidlyRealtime] rebuild channel (stale)", st || "no-channel");
  }
  runChannelRebuild();
}

function registerSyncRecoveryHandler() {
  registerRealtimeRecoveryHandler(REALTIME_RECOVERY_IDS.SYNC_ENGINE, recoveryHandler);
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

function recoveryLockBlocksRealtimeDelivery() {
  return useWakeRecoveryStore.getState().blockMutations;
}

function runChannelRebuild() {
  rebuildQueued = false;
  registerSyncRecoveryHandler();

  if (channelInstance) {
    supabase.removeChannel(channelInstance);
    channelInstance = null;
  }

  const hasSync = Boolean(syncBridge.userId && syncBridge.onEntityEvent);
  const hasProfiles = profileListeners.size > 0;
  const hasNotifications = Boolean(notificationUserId && notificationListeners.size > 0);
  const hasAux = auxTableListeners.size > 0;

  if (!hasSync && !hasProfiles && !hasNotifications && !hasAux) {
    lastMainChannelSubscribeStatus = null;
    return;
  }

  const ch = supabase.channel(PAIDLY_REALTIME_CHANNEL);

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

  ch.subscribe((status) => {
    lastMainChannelSubscribeStatus = status;
    notifyMainChannelStatusListeners(status);
    applyMainChannelSubscribeStatus(status, Boolean(syncBridge.userId));
    if (status === "CHANNEL_ERROR" && import.meta.env?.DEV) {
      console.debug(
        "[PaidlyRealtime] channel error (optional). Ensure tables are in supabase_realtime publication."
      );
    }
  });

  channelInstance = ch;
}

export function schedulePaidlyRealtimeRebuild() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  queueMicrotask(runChannelRebuild);
}

/**
 * Read model for “is our multiplex channel actually joined?” — use after auth work, before trusting postgres_changes.
 * @returns {{ ok: boolean, hasWork: boolean, joined: boolean }}
 */
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
 * Wake / recovery: if multiplex work is registered but the main channel is not joined, rebuild once and wait.
 * Does not touch unrelated channels — Paidly uses a single multiplex channel.
 *
 * @param {string} [reason]
 * @returns {Promise<{ ok: boolean, repaired: boolean }>}
 */
export async function validateAndRepairPaidlyRealtimeForWake(reason = "wake_recovery") {
  if (typeof window === "undefined" || !isSupabaseConfigured) {
    return { ok: true, repaired: false };
  }
  const v = validatePaidlyRealtime();
  if (!v.hasWork) return { ok: true, repaired: false };
  if (v.joined) return { ok: true, repaired: false };

  console.info("[Realtime] Multiplex channel not joined; scheduling rebuild", { reason });
  schedulePaidlyRealtimeRebuild();
  const joined = await waitForPaidlyMainChannelJoined({ timeoutMs: 12_000 });
  if (!joined) {
    console.warn("[Realtime] Multiplex channel still not joined after repair wait", { reason });
  }
  return { ok: joined, repaired: true };
}

/**
 * Light path when the tab becomes visible: lifecycle or channel state says realtime is stale, but we are not
 * running the full wake pipeline. No auth refresh, no mutation lock — multiplex rebuild + join wait only.
 *
 * @param {{ believedSignedIn?: boolean, reason?: string }} [opts]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, repaired?: boolean, reason?: string }>}
 */
export async function repairStalePaidlyRealtimeOnTabVisible(opts = {}) {
  if (typeof window === "undefined" || !isSupabaseConfigured) {
    return { ok: true, skipped: true, reason: "no_window" };
  }
  if (document.visibilityState !== "visible") {
    return { ok: true, skipped: true, reason: "not_visible" };
  }

  const { believedSignedIn = true, reason = "visibility_stale_realtime" } = opts;
  if (!believedSignedIn) {
    return { ok: true, skipped: true, reason: "guest" };
  }
  if (useSessionHealthStore.getState().status === SESSION_STATUS.EXPIRED) {
    return { ok: true, skipped: true, reason: "expired" };
  }
  if (useWakeRecoveryStore.getState().blockMutations) {
    return { ok: true, skipped: true, reason: "recovery_lock" };
  }

  const rt = useConnectionLifecycleStore.getState().realtime;
  const v = validatePaidlyRealtime();
  const lifecycleSaysStale = rt.phase === "unstable" || rt.phase === "unstable_background";
  const channelDrift = v.hasWork && !v.joined;

  if (!lifecycleSaysStale && !channelDrift) {
    return { ok: true, skipped: true, reason: "not_stale" };
  }

  if (visibleStaleRepairPromise) {
    return visibleStaleRepairPromise;
  }

  visibleStaleRepairPromise = (async () => {
    try {
      console.info("[Realtime] Light repair on tab visible (stale / drift)", {
        reason,
        lifecyclePhase: rt.phase,
        channelDrift,
      });
      return await validateAndRepairPaidlyRealtimeForWake(reason);
    } finally {
      visibleStaleRepairPromise = null;
    }
  })();

  return visibleStaleRepairPromise;
}

/**
 * After a successful JWT refresh: push the new access token into Supabase Realtime, then rebuild Paidly channels.
 * Realtime can stay authorized on an old JWT while PostgREST already uses the new one; `channel.state === joined`
 * is not sufficient. See {@link recoveryHandler} skip-when-joined path.
 *
 * @param {string} accessToken
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
export async function reconcilePaidlyRealtimeAfterTokenRefresh(accessToken, reason = "token_refresh") {
  if (typeof window === "undefined" || !isSupabaseConfigured) return;
  if (!accessToken || typeof accessToken !== "string") return;
  if (!computePaidlyRealtimeWork()) return;

  const now = Date.now();
  const skipRebuild =
    lastReconciledAccessToken === accessToken && now - lastReconciledAtMs < REALTIME_JWT_RECONCILE_DEBOUNCE_MS;

  try {
    await supabase.realtime.setAuth(accessToken);
  } catch (e) {
    if (import.meta.env?.DEV) {
      console.warn("[PaidlyRealtime] realtime.setAuth after token refresh failed:", e?.message || e);
    }
  }

  if (skipRebuild) return;

  lastReconciledAccessToken = accessToken;
  lastReconciledAtMs = now;

  rebuildQueued = false;
  runChannelRebuild();

  if (import.meta.env?.DEV) {
    console.info("[PaidlyRealtime] realtime reconciled after JWT rotation", reason);
  }
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

/**
 * Whether the app has any realtime domain active (main channel should exist after rebuild).
 * @see REALTIME_DOMAINS
 */
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
  schedulePaidlyRealtimeRebuild();
}

/** @param {(payload: { table: string, eventType: string, new: object | null, old: object | null }) => void} listener */
export function subscribePaidlyProfilesRealtime(listener) {
  profileListeners.add(listener);
  schedulePaidlyRealtimeRebuild();
  return () => {
    profileListeners.delete(listener);
    schedulePaidlyRealtimeRebuild();
  };
}

/**
 * @param {string} userId
 * @param {() => void} listener
 */
export function subscribePaidlyNotificationsRealtime(userId, listener) {
  notificationListeners.add(listener);
  notificationUserId = userId;
  schedulePaidlyRealtimeRebuild();
  return () => {
    notificationListeners.delete(listener);
    if (notificationListeners.size === 0) notificationUserId = null;
    schedulePaidlyRealtimeRebuild();
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
  auxTableListeners.get(k).add(listener);
  schedulePaidlyRealtimeRebuild();
  return () => {
    const set = auxTableListeners.get(k);
    if (set) {
      set.delete(listener);
      if (set.size === 0) auxTableListeners.delete(k);
    }
    schedulePaidlyRealtimeRebuild();
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
  lastReconciledAccessToken = null;
  lastReconciledAtMs = 0;
  visibleStaleRepairPromise = null;
  if (channelInstance) {
    try {
      supabase.removeChannel(channelInstance);
    } catch {
      /* ignore */
    }
    channelInstance = null;
  }
}
