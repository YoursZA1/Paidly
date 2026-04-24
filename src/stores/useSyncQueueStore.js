import { create } from "zustand";

const STORAGE_KEY = "paidly_sync_queue_v1";
const MAX_RECENT_DONE = 40;

function loadQueue() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistQueue(queue) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // ignore storage write failures
  }
}

function makeId() {
  return `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function mergePayload(currentPayload, nextPayload) {
  const current = currentPayload || {};
  const next = nextPayload || {};
  return {
    ...current,
    ...next,
    clientData: { ...(current.clientData || {}), ...(next.clientData || {}) },
    invoiceData: { ...(current.invoiceData || {}), ...(next.invoiceData || {}) },
    options: { ...(current.options || {}), ...(next.options || {}) },
  };
}

export const useSyncQueueStore = create((set, get) => ({
  queue: loadQueue(),

  addToQueue: (type, payload, meta = {}) => {
    const job = {
      id: makeId(),
      type,
      payload,
      meta,
      status: "pending",
      attempts: 0,
      maxRetries: Number(meta.maxRetries ?? 5),
      nextAttemptAt: Date.now(),
      lastError: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      doneAt: null,
      result: null,
    };
    set((state) => {
      const conflictKey = String(meta?.conflictKey || "").trim();
      if (conflictKey) {
        const existingIndex = state.queue.findIndex((existing) => {
          if (existing.type !== type) return false;
          if (String(existing.meta?.conflictKey || "") !== conflictKey) return false;
          return existing.status === "pending" || existing.status === "failed";
        });
        if (existingIndex >= 0) {
          const existing = state.queue[existingIndex];
          const merged = {
            ...existing,
            payload: mergePayload(existing.payload, payload),
            meta: { ...existing.meta, ...meta, conflictKey },
            status: "pending",
            attempts: 0,
            nextAttemptAt: Date.now(),
            lastError: null,
            updatedAt: Date.now(),
          };
          const queue = state.queue.map((entry, idx) => (idx === existingIndex ? merged : entry));
          persistQueue(queue);
          return { queue };
        }
      }
      const queue = [job, ...state.queue];
      persistQueue(queue);
      return { queue };
    });
    return job;
  },

  markProcessing: (id) =>
    set((state) => {
      const queue = state.queue.map((job) =>
        job.id === id ? { ...job, status: "processing", updatedAt: Date.now() } : job
      );
      persistQueue(queue);
      return { queue };
    }),

  markDone: (id, result = null) =>
    set((state) => {
      const queue = state.queue
        .map((job) =>
          job.id === id
            ? {
                ...job,
                status: "done",
                result,
                lastError: null,
                doneAt: Date.now(),
                updatedAt: Date.now(),
              }
            : job
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const trimmed = queue.filter((j, idx) => j.status !== "done" || idx < MAX_RECENT_DONE);
      persistQueue(trimmed);
      return { queue: trimmed };
    }),

  markFailed: (id, errorMessage, { retryable = true } = {}) =>
    set((state) => {
      const queue = state.queue.map((job) => {
        if (job.id !== id) return job;
        const attempts = (job.attempts || 0) + 1;
        const cappedBackoff = Math.min(60_000, 2000 * 2 ** Math.max(0, attempts - 1));
        const canRetry = retryable && attempts <= job.maxRetries;
        return {
          ...job,
          attempts,
          status: canRetry ? "pending" : "failed",
          lastError: String(errorMessage || "Sync failed"),
          nextAttemptAt: Date.now() + (canRetry ? cappedBackoff : 0),
          updatedAt: Date.now(),
        };
      });
      persistQueue(queue);
      return { queue };
    }),

  retryJob: (id) =>
    set((state) => {
      const queue = state.queue.map((job) =>
        job.id === id
          ? { ...job, status: "pending", nextAttemptAt: Date.now(), updatedAt: Date.now(), lastError: null }
          : job
      );
      persistQueue(queue);
      return { queue };
    }),

  retryAllFailed: () =>
    set((state) => {
      const queue = state.queue.map((job) =>
        job.status === "failed"
          ? { ...job, status: "pending", nextAttemptAt: Date.now(), updatedAt: Date.now(), lastError: null }
          : job
      );
      persistQueue(queue);
      return { queue };
    }),

  pendingJobs: () => {
    const now = Date.now();
    return get().queue.filter((job) => (job.status === "pending" || job.status === "processing") && job.nextAttemptAt <= now);
  },
}));

