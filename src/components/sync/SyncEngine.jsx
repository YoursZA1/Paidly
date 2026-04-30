import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useSyncQueueStore } from "@/stores/useSyncQueueStore";
import { processSyncJob } from "@/lib/syncJobProcessor";
import { useAppStore } from "@/stores/useAppStore";

const SYNC_INTERVAL_MS = 5000;
const ENTITY_REALTIME_DEBOUNCE_MS = 400;

export default function SyncEngine() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const queue = useSyncQueueStore((s) => s.queue);
  const markProcessing = useSyncQueueStore((s) => s.markProcessing);
  const markDone = useSyncQueueStore((s) => s.markDone);
  const markFailed = useSyncQueueStore((s) => s.markFailed);
  const retryAllFailed = useSyncQueueStore((s) => s.retryAllFailed);
  const replaceOptimisticInvoice = useAppStore((s) => s.replaceOptimisticInvoice);
  const runningRef = useRef(false);
  const realtimeEntityDebounceRefs = useRef({
    invoices: null,
    clients: null,
    document_sends: null,
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
    const channel = supabase
      .channel("paidly-sync-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        (payload) => scheduleEntityInvalidation("invoices", payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clients" },
        (payload) => scheduleEntityInvalidation("clients", payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_sends" },
        (payload) => scheduleEntityInvalidation("document_sends", payload)
      );
    channel.subscribe();

    return () => {
      Object.keys(realtimeEntityDebounceRefs.current).forEach((k) => {
        const timer = realtimeEntityDebounceRefs.current[k];
        if (timer) window.clearTimeout(timer);
        realtimeEntityDebounceRefs.current[k] = null;
      });
      supabase.removeChannel(channel);
    };
  }, [scheduleEntityInvalidation, user?.id]);

  return null;
}

