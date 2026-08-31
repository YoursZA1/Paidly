import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

const WAKE_RECOVERY_RESYNC = "paidly:wake-recovery-resync";
import { useSyncQueueStore } from "@/stores/useSyncQueueStore";
import { processSyncJob } from "@/lib/syncJobProcessor";
import { useAppStore } from "@/stores/useAppStore";
import {
  dispatchAppFetchAllSettled,
  notifyAdminDashboardRealtimeStale,
} from "@/lib/realtimeStoreHydration";
import { setPaidlySyncRealtimeBridge } from "@/lib/realtime/paidlyRealtimeManager";
import { reconcileInvoiceRealtimeEvent } from "@/lib/realtimeInvoiceReconciliation";
import { reconcileClientRealtimeEvent } from "@/lib/realtimeClientReconciliation";
import {
  reconcileQuoteRealtimeEvent,
  reconcilePaymentRealtimeEvent,
  reconcileExpenseRealtimeEvent,
  reconcilePayslipRealtimeEvent,
} from "@/lib/realtimeEntityReconciliation";
import { useWakeRecoveryStore } from "@/stores/wakeRecoveryStore";
import { isRecoveryCircuitOpen } from "@/lib/session/recoveryCircuit";
import {
  REALTIME_ENTITY_DEBOUNCE_MS,
  REALTIME_GLOBAL_STORE_REFRESH_DEBOUNCE_MS,
  whenDocumentVisible,
} from "@/lib/paidlyRealtimeReconciliationEngine";
import { requestSessionRefresh } from "@/lib/session/sessionRefreshScheduler";
import { useRuntimeCoordinator } from "@/core/runtime/RuntimeCoordinator";
import { invalidateInvoiceDomain, invalidateClientDomain } from "@/lib/queryInvalidation";
import { hasActiveSession, getStableSession } from "@/core/auth/SessionCoordinator";

const SYNC_INTERVAL_MS = 5000;
/** Coalesce session recovery when the queue has work but `getSession()` is momentarily empty (auth latency / refresh races). */
const SYNC_QUEUE_SESSION_WAKE_MIN_MS = 8000;
/** Max time a single sync job may run before being force-failed as "timed out". Prevents jobs hung on a
 *  stalled network call from keeping processingCount > 0 and showing "Syncing…" indefinitely. */
const JOB_TIMEOUT_MS = 30_000;
/** Interval at which we sweep for jobs that have been stuck in "processing" for longer than JOB_TIMEOUT_MS.
 *  Covers the edge case where the in-flight promise resolved without going through the finally block
 *  (e.g. during HMR in development, or if a future refactor removes the try/finally guard). */
const STUCK_JOB_SWEEP_MS = 60_000;
/** Max jobs drained in a single tick. Bounds work per tick so a large offline backlog can't block the
 *  event loop, while still flushing batches promptly instead of one job per {@link SYNC_INTERVAL_MS}. */
const MAX_JOBS_PER_TICK = 25;
/** Admin dashboard previously listened to these tables only (not `clients` / `document_sends`). */
const ADMIN_STORE_HYDRATION_ENTITIES = new Set(["invoices", "payments", "expenses", "quotes", "payslips"]);

/**
 * Races `promise` against a `ms`-millisecond timeout.
 * Always clears the timer regardless of which settles first.
 */
function withJobTimeout(promise, ms) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error("sync_job_timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}

export default function SyncEngine() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const markProcessing = useSyncQueueStore((s) => s.markProcessing);
  const markDone = useSyncQueueStore((s) => s.markDone);
  const markFailed = useSyncQueueStore((s) => s.markFailed);
  const retryAllFailed = useSyncQueueStore((s) => s.retryAllFailed);
  const replaceOptimisticInvoice = useAppStore((s) => s.replaceOptimisticInvoice);
  const runningRef = useRef(false);
  const lastSyncQueueSessionWakeMsRef = useRef(0);
  // Stable ref so runOnce doesn't close over user?.id and recreate the interval on every auth change.
  const userIdRef = useRef(user?.id);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);

  // On mount: reset any jobs that were "processing" when the app last crashed,
  // and remove jobs from other users that may share the same localStorage key.
  useEffect(() => {
    const store = useSyncQueueStore.getState();
    store.resetStuckJobs();
    if (user?.id) store.pruneJobsNotForUser(user.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const globalStoreRefreshTimerRef = useRef(null);
  const realtimeEntityDebounceRefs = useRef({
    invoices: null,
    clients: null,
    document_sends: null,
    quotes: null,
    payments: null,
    expenses: null,
    payslips: null,
  });

  const invalidateForEntity = useCallback(
    (entity, payload = null) => {
      const scopeKey = user?.id ?? null;
      if (entity === "invoices") {
        const patched = reconcileInvoiceRealtimeEvent(
          queryClient,
          {
            upsertFromRemote: (row) => useAppStore.getState().upsertInvoiceFromRemote(row),
            removeFromRemote: (id) => useAppStore.getState().removeInvoiceFromRemote(id),
          },
          payload || {}
        );
        if (patched) return true;
        const id = payload?.new?.id || payload?.old?.id || null;
        invalidateInvoiceDomain(queryClient, { scopeKey, invoiceId: id });
        return false;
      }
      if (entity === "clients") {
        const patched = reconcileClientRealtimeEvent(
          queryClient,
          {
            upsertFromRemote: (row) => useAppStore.getState().upsertClientFromRemote(row),
            removeFromRemote: (id) => useAppStore.getState().removeClientFromRemote(id),
          },
          payload || {}
        );
        if (patched) return true;
        invalidateClientDomain(queryClient, { scopeKey });
        return false;
      }
      if (entity === "document_sends") {
        queryClient.invalidateQueries({ queryKey: ["admin-messages"], exact: false });
        // Targeted invalidation is sufficient — skip global fetchAll
        return true;
      }
      if (entity === "quotes") {
        return reconcileQuoteRealtimeEvent(queryClient, payload || {});
      }
      if (entity === "payments") {
        return reconcilePaymentRealtimeEvent(queryClient, scopeKey, payload || {});
      }
      if (entity === "expenses") {
        return reconcileExpenseRealtimeEvent(queryClient, payload || {});
      }
      if (entity === "payslips") {
        return reconcilePayslipRealtimeEvent(queryClient, payload || {});
      }
      return false;
    },
    [queryClient, user?.id]
  );

  const scheduleGlobalStoreRefresh = useCallback(() => {
    if (isRecoveryCircuitOpen()) return;
    if (!user?.id) return;
    if (globalStoreRefreshTimerRef.current) {
      window.clearTimeout(globalStoreRefreshTimerRef.current);
    }
    globalStoreRefreshTimerRef.current = window.setTimeout(() => {
      void (async () => {
        globalStoreRefreshTimerRef.current = null;
        await whenDocumentVisible();
        if (!hasActiveSession()) return;
        if (user?.role === "admin") {
          notifyAdminDashboardRealtimeStale();
          return;
        }
        // Targeted invalidation — TanStack refetches lazily on next render,
        // avoiding a synchronous full-store network call on every fallback path.
        const scopeKey = user?.id ?? null;
        invalidateInvoiceDomain(queryClient, { scopeKey });
        // skipInvoiceCascade: invoices already invalidated above
        invalidateClientDomain(queryClient, { scopeKey, skipInvoiceCascade: true });
        queryClient.invalidateQueries({ queryKey: ["quotes"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["payslips"], exact: false });
        dispatchAppFetchAllSettled();
      })();
    }, REALTIME_GLOBAL_STORE_REFRESH_DEBOUNCE_MS);
  }, [user?.id, user?.role, queryClient]);

  const scheduleEntityInvalidation = useCallback(
    (entity, payload = null, role = null) => {
      if (isRecoveryCircuitOpen()) return;
      const current = realtimeEntityDebounceRefs.current[entity];
      if (current) {
        window.clearTimeout(current);
      }
      realtimeEntityDebounceRefs.current[entity] = window.setTimeout(() => {
        void (async () => {
          realtimeEntityDebounceRefs.current[entity] = null;
          await whenDocumentVisible();
          if (!hasActiveSession()) return;
          const skipGlobalFetchAll = invalidateForEntity(entity, payload);
          if (role !== "admin" && !skipGlobalFetchAll) {
            scheduleGlobalStoreRefresh();
          }
        })();
      }, REALTIME_ENTITY_DEBOUNCE_MS);
    },
    [invalidateForEntity, scheduleGlobalStoreRefresh]
  );

  const runOnce = useCallback(async () => {
    if (isRecoveryCircuitOpen()) return;
    if (runningRef.current) return;
    if (useWakeRecoveryStore.getState().blockMutations) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    runningRef.current = true;
    useRuntimeCoordinator.getState().setSyncActive(true);
    try {
      const pickNextJob = () => {
        const now = Date.now();
        const { queue } = useSyncQueueStore.getState();
        return queue
          .filter((job) => (job.status === "pending" || job.status === "processing") && job.nextAttemptAt <= now)
          .sort((a, b) => a.createdAt - b.createdAt)[0];
      };

      // Bail before fetching the session when there's no ready work.
      if (!pickNextJob()) return;

      const rawSession = await getStableSession();
      if (!rawSession) {
        const now = Date.now();
        if (now - lastSyncQueueSessionWakeMsRef.current >= SYNC_QUEUE_SESSION_WAKE_MIN_MS) {
          lastSyncQueueSessionWakeMsRef.current = now;
          requestSessionRefresh({
            source: "sync_queue_session",
            silent: true,
            debounceMs: 0,
          });
        }
        return;
      }

      // Drain all currently-ready jobs this tick (capped) so an offline backlog flushes promptly
      // instead of one job per SYNC_INTERVAL_MS. Failed jobs get a future nextAttemptAt (backoff)
      // and are skipped until ready, so this loop terminates.
      let processed = 0;
      let nextJob = pickNextJob();
      while (nextJob && processed < MAX_JOBS_PER_TICK) {
        if (isRecoveryCircuitOpen()) break;
        if (useWakeRecoveryStore.getState().blockMutations) break;
        if (typeof navigator !== "undefined" && navigator.onLine === false) break;
        if (!hasActiveSession()) break;

        markProcessing(nextJob.id);
        try {
          const result = await withJobTimeout(processSyncJob(nextJob), JOB_TIMEOUT_MS);
          markDone(nextJob.id, result);
          if (nextJob.type === "CREATE_INVOICE" && nextJob.meta?.optimisticTempId && result?.id) {
            replaceOptimisticInvoice(nextJob.meta.optimisticTempId, {
              id: result.id,
              sync_state: "synced",
            });
          }
          if (nextJob.type === "UPDATE_INVOICE" && nextJob.payload?.invoiceId) {
            useAppStore.getState().setInvoice(nextJob.payload.invoiceId, { sync_state: "synced" });
          }
          if (nextJob.type === "SEND_INVOICE" && nextJob.payload?.invoiceId) {
            useAppStore.getState().setInvoice(nextJob.payload.invoiceId, { sync_state: "synced" });
          }
          if (hasActiveSession()) {
            const scopeKey = userIdRef.current ?? null;
            if (nextJob.type === "CREATE_INVOICE" || nextJob.type === "SEND_INVOICE" || nextJob.type === "UPDATE_INVOICE") {
              invalidateInvoiceDomain(queryClient, { scopeKey });
            } else if (nextJob.type === "UPDATE_CLIENT") {
              invalidateClientDomain(queryClient, { scopeKey });
            }
          }
        } catch (error) {
          markFailed(nextJob.id, error?.message || "Sync job failed", { retryable: true });
          if (nextJob.type === "SEND_INVOICE" && nextJob.payload?.invoiceId) {
            useAppStore.getState().setInvoice(nextJob.payload.invoiceId, { sync_state: "failed" });
          }
        }

        processed += 1;
        const candidate = pickNextJob();
        // Defensive: never re-pick the same job within a tick (avoids a tight loop if a job somehow
        // stays "ready"). It will be retried on a later tick.
        if (candidate && candidate.id === nextJob.id) break;
        nextJob = candidate;
      }
    } finally {
      runningRef.current = false;
      useRuntimeCoordinator.getState().setSyncActive(false);
    }
  }, [markDone, markFailed, markProcessing, queryClient, replaceOptimisticInvoice]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void runOnce();
    }, SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [runOnce]);

  // Periodic sweep: reset jobs that have been stuck in "processing" longer than JOB_TIMEOUT_MS.
  // Guards against the edge case where a job's in-flight promise resolved without clearing
  // runningRef (e.g. development HMR re-mounts, or future refactors that skip the finally block).
  useEffect(() => {
    const sweepId = window.setInterval(() => {
      const { queue } = useSyncQueueStore.getState();
      const cutoff = Date.now() - JOB_TIMEOUT_MS;
      const hasStuck = queue.some(
        (j) => j.status === "processing" && j.updatedAt <= cutoff
      );
      if (!hasStuck) return;
      const now = Date.now();
      useSyncQueueStore.setState((state) => {
        const next = state.queue.map((j) =>
          j.status === "processing" && j.updatedAt <= cutoff
            ? { ...j, status: "pending", nextAttemptAt: now, updatedAt: now }
            : j
        );
        return { queue: next };
      });
    }, STUCK_JOB_SWEEP_MS);
    return () => window.clearInterval(sweepId);
  }, []);

  useEffect(() => {
    const onOnline = () => {
      if (isRecoveryCircuitOpen()) return;
      retryAllFailed();
      void runOnce();
    };
    const onFocus = () => {
      if (isRecoveryCircuitOpen()) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void runOnce();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
    };
  }, [retryAllFailed, runOnce]);

  const onEntityEvent = useCallback(
    (entity, payload) => {
      if (isRecoveryCircuitOpen()) return;
      const role = user?.role;
      scheduleEntityInvalidation(entity, payload, role);
      if (entity === "document_sends") return;
      if (role === "admin" && ADMIN_STORE_HYDRATION_ENTITIES.has(entity)) {
        notifyAdminDashboardRealtimeStale();
      }
    },
    [scheduleEntityInvalidation, user?.role]
  );

  const onEntityEventRef = useRef(onEntityEvent);
  onEntityEventRef.current = onEntityEvent;

  useEffect(() => {
    if (isRecoveryCircuitOpen()) {
      setPaidlySyncRealtimeBridge({ userId: null, onEntityEvent: null });
      return undefined;
    }
    if (!user?.id) {
      setPaidlySyncRealtimeBridge({ userId: null, onEntityEvent: null });
      return () => {
        if (globalStoreRefreshTimerRef.current) {
          window.clearTimeout(globalStoreRefreshTimerRef.current);
          globalStoreRefreshTimerRef.current = null;
        }
        Object.keys(realtimeEntityDebounceRefs.current).forEach((k) => {
          const timer = realtimeEntityDebounceRefs.current[k];
          if (timer) window.clearTimeout(timer);
          realtimeEntityDebounceRefs.current[k] = null;
        });
        setPaidlySyncRealtimeBridge({ userId: null, onEntityEvent: null });
      };
    }
    const handler = (entity, payload) => onEntityEventRef.current?.(entity, payload);
    setPaidlySyncRealtimeBridge({ userId: user.id, onEntityEvent: handler });
    return () => {
      if (globalStoreRefreshTimerRef.current) {
        window.clearTimeout(globalStoreRefreshTimerRef.current);
        globalStoreRefreshTimerRef.current = null;
      }
      Object.keys(realtimeEntityDebounceRefs.current).forEach((k) => {
        const timer = realtimeEntityDebounceRefs.current[k];
        if (timer) window.clearTimeout(timer);
        realtimeEntityDebounceRefs.current[k] = null;
      });
      setPaidlySyncRealtimeBridge({ userId: null, onEntityEvent: null });
    };
  }, [user?.id]);

  /** Fires only after successful wake pipeline, from `finally` after unlock ({@link CustomEvent} `detail.ok`). */
  useEffect(() => {
    const onWakeResync = () => {
      void (async () => {
        await whenDocumentVisible();
        if (!user?.id) return;
        if (!hasActiveSession()) return;
        const scopeKey = user?.id ?? null;
        invalidateInvoiceDomain(queryClient, { scopeKey });
        // skipInvoiceCascade: invoices already invalidated above
        invalidateClientDomain(queryClient, { scopeKey, skipInvoiceCascade: true });
        queryClient.invalidateQueries({ queryKey: ["quotes"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["payslips"], exact: false });
        dispatchAppFetchAllSettled();
      })();
    };
    window.addEventListener(WAKE_RECOVERY_RESYNC, onWakeResync);
    return () => window.removeEventListener(WAKE_RECOVERY_RESYNC, onWakeResync);
  }, [queryClient, user]);

  return null;
}

