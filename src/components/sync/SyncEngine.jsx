import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";

const WAKE_RECOVERY_RESYNC = "paidly:wake-recovery-resync";
import { useSyncQueueStore } from "@/stores/useSyncQueueStore";
import { processSyncJob } from "@/lib/syncJobProcessor";
import { useAppStore } from "@/stores/useAppStore";
import {
  dispatchAppFetchAllSettled,
  notifyAdminDashboardRealtimeStale,
} from "@/lib/realtimeStoreHydration";
import { setPaidlySyncRealtimeBridge } from "@/lib/realtime/paidlyRealtimeManager";
import { useWakeRecoveryStore } from "@/stores/wakeRecoveryStore";
import { isRecoveryCircuitOpen } from "@/lib/session/recoveryCircuit";

const SYNC_INTERVAL_MS = 5000;
/** Per-table debounce; coalesces bursts. List pages rely on this (see Invoices/Quotes — no duplicate channels). */
const ENTITY_REALTIME_DEBOUNCE_MS = 550;
/** Match former Dashboard realtime: one heavy `fetchAll` / admin reload after burst settles. */
const GLOBAL_STORE_REFRESH_DEBOUNCE_MS = 1500;
/** Admin dashboard previously listened to these tables only (not `clients` / `document_sends`). */
const ADMIN_STORE_HYDRATION_ENTITIES = new Set(["invoices", "payments", "expenses", "quotes", "payslips"]);

export default function SyncEngine() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const queue = useSyncQueueStore((s) => s.queue);
  const markProcessing = useSyncQueueStore((s) => s.markProcessing);
  const markDone = useSyncQueueStore((s) => s.markDone);
  const markFailed = useSyncQueueStore((s) => s.markFailed);
  const retryAllFailed = useSyncQueueStore((s) => s.retryAllFailed);
  const replaceOptimisticInvoice = useAppStore((s) => s.replaceOptimisticInvoice);
  const fetchAllFromStore = useAppStore((s) => s.fetchAll);
  const runningRef = useRef(false);
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
      if (entity === "invoices") {
        // Keep invoice updates scoped to invoice-related caches only.
        queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
        const id = payload?.new?.id || payload?.old?.id || null;
        if (id) {
          queryClient.invalidateQueries({ queryKey: ["invoice", id], exact: false });
          queryClient.invalidateQueries({ queryKey: ["invoices", "detail", id], exact: false });
        }
        return;
      }
      if (entity === "clients") {
        queryClient.invalidateQueries({ queryKey: ["clients"], exact: false });
        // `useInvoicesQuery` includes client data for filters.
        queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
        return;
      }
      if (entity === "document_sends") {
        queryClient.invalidateQueries({ queryKey: ["admin-messages"], exact: false });
        return;
      }
      if (entity === "quotes") {
        queryClient.invalidateQueries({ queryKey: ["quotes"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
        return;
      }
      if (entity === "payments") {
        queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
        return;
      }
      if (entity === "expenses") {
        queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
        return;
      }
      if (entity === "payslips") {
        queryClient.invalidateQueries({ queryKey: ["payslips"], exact: false });
      }
    },
    [queryClient]
  );

  const scheduleEntityInvalidation = useCallback(
    (entity, payload = null) => {
      if (isRecoveryCircuitOpen()) return;
      const current = realtimeEntityDebounceRefs.current[entity];
      if (current) {
        window.clearTimeout(current);
      }
      realtimeEntityDebounceRefs.current[entity] = window.setTimeout(() => {
        void (async () => {
          realtimeEntityDebounceRefs.current[entity] = null;
          const session = await supabase.auth.getSession();
          if (!session?.data?.session) return;
          invalidateForEntity(entity, payload);
        })();
      }, ENTITY_REALTIME_DEBOUNCE_MS);
    },
    [invalidateForEntity]
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
        const session = await supabase.auth.getSession();
        if (!session?.data?.session) return;
        const isAdmin = user?.role === "admin";
        if (isAdmin) {
          notifyAdminDashboardRealtimeStale();
          return;
        }
        void fetchAllFromStore(user).finally(() => {
          dispatchAppFetchAllSettled();
        });
      })();
    }, GLOBAL_STORE_REFRESH_DEBOUNCE_MS);
  }, [user, fetchAllFromStore]);

  const runOnce = useCallback(async () => {
    if (isRecoveryCircuitOpen()) return;
    if (runningRef.current) return;
    if (useWakeRecoveryStore.getState().blockMutations) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    runningRef.current = true;
    try {
      const now = Date.now();
      const nextJob = queue
        .filter((job) => (job.status === "pending" || job.status === "processing") && job.nextAttemptAt <= now)
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!nextJob) return;

      const session = await supabase.auth.getSession();
      if (!session?.data?.session) return;

      markProcessing(nextJob.id);
      try {
        const result = await processSyncJob(nextJob);
        markDone(nextJob.id, result);
        if (nextJob.type === "CREATE_INVOICE" && nextJob.meta?.optimisticTempId && result?.id) {
          replaceOptimisticInvoice(nextJob.meta.optimisticTempId, {
            id: result.id,
            sync_state: "synced",
          });
        }
        const postJobSession = await supabase.auth.getSession();
        if (postJobSession?.data?.session) {
          if (nextJob.type === "CREATE_INVOICE" || nextJob.type === "SEND_INVOICE") {
            queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
            queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
          } else if (nextJob.type === "UPDATE_CLIENT") {
            queryClient.invalidateQueries({ queryKey: ["clients"], exact: false });
            queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
          }
        }
      } catch (error) {
        markFailed(nextJob.id, error?.message || "Sync job failed", { retryable: true });
      }
    } finally {
      runningRef.current = false;
    }
  }, [markDone, markFailed, markProcessing, queryClient, queue, replaceOptimisticInvoice]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void runOnce();
    }, SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [runOnce]);

  useEffect(() => {
    const onOnline = () => {
      if (isRecoveryCircuitOpen()) return;
      retryAllFailed();
      void runOnce();
    };
    const onFocus = () => {
      if (isRecoveryCircuitOpen()) return;
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
      scheduleEntityInvalidation(entity, payload);
      if (entity === "document_sends") return;
      if (role === "admin" && !ADMIN_STORE_HYDRATION_ENTITIES.has(entity)) return;
      scheduleGlobalStoreRefresh();
    },
    [scheduleEntityInvalidation, scheduleGlobalStoreRefresh, user?.role]
  );

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
    setPaidlySyncRealtimeBridge({ userId: user.id, onEntityEvent });
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
  }, [user?.id, onEntityEvent]);

  /** Fires only after successful wake pipeline, from `finally` after unlock ({@link CustomEvent} `detail.ok`). */
  useEffect(() => {
    const onWakeResync = () => {
      void (async () => {
        if (!user?.id) return;
        const session = await supabase.auth.getSession();
        if (!session?.data?.session) return;
        void fetchAllFromStore(user).finally(() => {
          dispatchAppFetchAllSettled();
        });
        queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["quotes"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["clients"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["payslips"], exact: false });
      })();
    };
    window.addEventListener(WAKE_RECOVERY_RESYNC, onWakeResync);
    return () => window.removeEventListener(WAKE_RECOVERY_RESYNC, onWakeResync);
  }, [fetchAllFromStore, queryClient, user]);

  return null;
}

