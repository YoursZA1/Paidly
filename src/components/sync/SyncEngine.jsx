import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useSyncQueueStore } from "@/stores/useSyncQueueStore";
import { processSyncJob } from "@/lib/syncJobProcessor";
import { useAppStore } from "@/stores/useAppStore";

const SYNC_INTERVAL_MS = 5000;
const SESSION_REFRESH_INTERVAL_MS = 60000;

export default function SyncEngine() {
  const { refreshSession, user } = useAuth();
  const queue = useSyncQueueStore((s) => s.queue);
  const markProcessing = useSyncQueueStore((s) => s.markProcessing);
  const markDone = useSyncQueueStore((s) => s.markDone);
  const markFailed = useSyncQueueStore((s) => s.markFailed);
  const retryAllFailed = useSyncQueueStore((s) => s.retryAllFailed);
  const fetchAll = useAppStore((s) => s.fetchAll);
  const replaceOptimisticInvoice = useAppStore((s) => s.replaceOptimisticInvoice);
  const runningRef = useRef(false);
  const realtimeRefetchDebounceRef = useRef(null);

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
      } catch (error) {
        markFailed(nextJob.id, error?.message || "Sync job failed", { retryable: true });
      }
    } finally {
      runningRef.current = false;
    }
  }, [markDone, markFailed, markProcessing, queue, replaceOptimisticInvoice]);

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
    const onFocus = () => {
      void refreshSession({ silent: true });
      void runOnce();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshSession, retryAllFailed, runOnce]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshSession({ silent: true });
    }, SESSION_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refreshSession]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const scheduleRealtimeRefetch = () => {
      if (realtimeRefetchDebounceRef.current) {
        window.clearTimeout(realtimeRefetchDebounceRef.current);
      }
      realtimeRefetchDebounceRef.current = window.setTimeout(() => {
        realtimeRefetchDebounceRef.current = null;
        void fetchAll(user);
      }, 1200);
    };

    const channel = supabase
      .channel("paidly-sync-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        scheduleRealtimeRefetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clients" },
        scheduleRealtimeRefetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_sends" },
        scheduleRealtimeRefetch
      );
    channel.subscribe();

    return () => {
      if (realtimeRefetchDebounceRef.current) {
        window.clearTimeout(realtimeRefetchDebounceRef.current);
        realtimeRefetchDebounceRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [fetchAll, user]);

  return null;
}

