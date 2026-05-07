import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useSyncQueueStore } from "@/stores/useSyncQueueStore";
import { processSyncJob } from "@/lib/syncJobProcessor";
import { useAppStore } from "@/stores/useAppStore";
import { decideSessionAction, SESSION_DECISION } from "@/lib/sessionDecisionEngine";
import { setSessionHealthStatus, SESSION_STATUS } from "@/stores/sessionHealthStore";
import {
  dispatchAppFetchAllSettled,
  notifyAdminDashboardRealtimeStale,
} from "@/lib/realtimeStoreHydration";

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
      const current = realtimeEntityDebounceRefs.current[entity];
      if (current) {
        window.clearTimeout(current);
      }
      realtimeEntityDebounceRefs.current[entity] = window.setTimeout(() => {
        realtimeEntityDebounceRefs.current[entity] = null;
        invalidateForEntity(entity, payload);
      }, ENTITY_REALTIME_DEBOUNCE_MS);
    },
    [invalidateForEntity]
  );

  const scheduleGlobalStoreRefresh = useCallback(() => {
    if (!user?.id) return;
    if (globalStoreRefreshTimerRef.current) {
      window.clearTimeout(globalStoreRefreshTimerRef.current);
    }
    globalStoreRefreshTimerRef.current = window.setTimeout(() => {
      globalStoreRefreshTimerRef.current = null;
      const isAdmin = user?.role === "admin";
      if (isAdmin) {
        notifyAdminDashboardRealtimeStale();
        return;
      }
      void fetchAllFromStore(user).finally(() => {
        dispatchAppFetchAllSettled();
      });
    }, GLOBAL_STORE_REFRESH_DEBOUNCE_MS);
  }, [user, fetchAllFromStore]);

  const runOnce = useCallback(async () => {
    if (runningRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    runningRef.current = true;
    try {
      const now = Date.now();
      const nextJob = queue
        .filter((job) => (job.status === "pending" || job.status === "processing") && job.nextAttemptAt <= now)
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!nextJob) return;

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
        if (nextJob.type === "CREATE_INVOICE" || nextJob.type === "SEND_INVOICE") {
          queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
          queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
        } else if (nextJob.type === "UPDATE_CLIENT") {
          queryClient.invalidateQueries({ queryKey: ["clients"], exact: false });
          queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
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
      retryAllFailed();
      void runOnce();
    };
    const onFocus = () => void runOnce();
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
    };
  }, [retryAllFailed, runOnce]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const onEntityEvent = (entity, payload) => {
      scheduleEntityInvalidation(entity, payload);
      if (entity === "document_sends") return;
      if (user?.role === "admin" && !ADMIN_STORE_HYDRATION_ENTITIES.has(entity)) return;
      scheduleGlobalStoreRefresh();
    };

    const channel = supabase
      .channel("paidly-sync-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        (payload) => onEntityEvent("invoices", payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clients" },
        (payload) => onEntityEvent("clients", payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_sends" },
        (payload) => onEntityEvent("document_sends", payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quotes" },
        (payload) => onEntityEvent("quotes", payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        (payload) => onEntityEvent("payments", payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses" },
        (payload) => onEntityEvent("expenses", payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payslips" },
        (payload) => onEntityEvent("payslips", payload)
      );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setSessionHealthStatus(SESSION_STATUS.CONNECTED, "sync_realtime_ready");
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        const decision = decideSessionAction({
          reason: "sync_realtime_unstable",
          believedSignedIn: true,
          online: typeof navigator !== "undefined" ? navigator.onLine !== false : true,
        });
        if (decision.action === SESSION_DECISION.RECONNECTING) {
          setSessionHealthStatus(SESSION_STATUS.RECONNECTING, decision.reason);
        }
      }
    });

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
      supabase.removeChannel(channel);
    };
  }, [scheduleEntityInvalidation, scheduleGlobalStoreRefresh, user?.id, user?.role]);

  return null;
}

