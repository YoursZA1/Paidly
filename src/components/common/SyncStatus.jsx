import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CheckCircle2, Loader2, WifiOff, AlertTriangle, RefreshCw } from "lucide-react";
import { CONNECTION_STATUS, useConnectionStore } from "@/stores/useConnectionStore";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
import { useSyncQueueStore } from "@/stores/useSyncQueueStore";
import { cn } from "@/lib/utils";

/**
 * Sync status states — single source of truth derived from three stores.
 *
 * Priority (highest → lowest):
 *   offline       – navigator offline OR session expired/reauth
 *   error         – failed queue jobs
 *   reconnecting  – connectionStore RECONNECTING and session not healthy
 *   syncing       – pending/processing jobs or recent activity (held for MIN_SYNCING_MS)
 *   synced        – everything idle + healthy
 */
const S = {
  SYNCED: "synced",
  SYNCING: "syncing",
  RECONNECTING: "reconnecting",
  OFFLINE: "offline",
  ERROR: "error",
};

/** Minimum time to keep "Syncing…" visible so it doesn't flash. */
const MIN_SYNCING_MS = 1500;
/**
 * If the derived state has been SYNCING continuously for longer than this, force-transition to
 * SYNCED. This is a safety net: once SyncEngine's job timeout (30 s) fires and resets stuck
 * jobs, rawState will naturally resolve on its own — this guard just caps visible stale
 * "Syncing…" to at most 90 s in worst-case scenarios (e.g. rapid job re-queuing with backoff).
 */
const MAX_SYNCING_MS = 90_000;

function deriveState({ connectionStatus, sessionStatus, pendingCount, processingCount, failedCount }) {
  const isOffline =
    (typeof navigator !== "undefined" && navigator.onLine === false) ||
    sessionStatus === SESSION_STATUS.REAUTH_REQUIRED ||
    sessionStatus === SESSION_STATUS.EXPIRED;

  if (isOffline) return S.OFFLINE;

  if (failedCount > 0) return S.ERROR;

  const sessionHealthy = sessionStatus === SESSION_STATUS.CONNECTED;

  if (!sessionHealthy && connectionStatus === CONNECTION_STATUS.RECONNECTING) return S.RECONNECTING;
  if (!sessionHealthy && connectionStatus === CONNECTION_STATUS.DISCONNECTED) return S.OFFLINE;

  if (pendingCount > 0 || processingCount > 0) return S.SYNCING;

  return S.SYNCED;
}

const CONFIG = {
  [S.SYNCED]: {
    icon: CheckCircle2,
    label: "All changes synced",
    pill: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  [S.SYNCING]: {
    icon: Loader2,
    label: "Syncing…",
    pill: "text-sky-700 dark:text-sky-300",
    dot: null,
    spin: true,
  },
  [S.RECONNECTING]: {
    icon: Loader2,
    label: "Reconnecting…",
    pill: "text-amber-800 dark:text-amber-200 border border-amber-500/35 bg-amber-500/8 dark:bg-amber-500/10 px-2 py-0.5 rounded-full backdrop-blur-sm",
    dot: null,
    spin: true,
    pulse: true,
  },
  [S.OFFLINE]: {
    icon: WifiOff,
    label: "Offline",
    pill: "text-red-800 dark:text-red-200 border border-red-500/35 bg-red-500/8 dark:bg-red-500/10 px-2 py-0.5 rounded-full",
    dot: null,
  },
  [S.ERROR]: {
    icon: AlertTriangle,
    label: "Sync issue",
    pill: "text-red-800 dark:text-red-200 border border-red-500/35 bg-red-500/8 dark:bg-red-500/10 px-2 py-0.5 rounded-full",
    dot: null,
  },
};

/**
 * Unified sync status indicator for the app header.
 *
 * Replaces ConnectionStatusIndicator + SessionIndicator + SyncStatusIndicator.
 * Reads from three Zustand stores; derives a single state via a priority ladder.
 * Includes:
 *   - minimum display duration for SYNCING (avoids flash-on/flash-off)
 *   - debounced transition out of RECONNECTING
 *   - cleanup on unmount
 *   - no duplicate listeners, no interval leaks
 *
 * @param {{ className?: string, onRetryFailed?: () => void }} props
 */
export default function SyncStatus({ className, onRetryFailed }) {
  const prefersReducedMotion = useReducedMotion();

  const connectionStatus = useConnectionStore((s) => s.status);
  const sessionStatus = useSessionHealthStore((s) => s.status);
  const queue = useSyncQueueStore((s) => s.queue);
  const retryAllFailed = useSyncQueueStore((s) => s.retryAllFailed);

  const pendingCount = queue.filter((j) => j.status === "pending").length;
  const processingCount = queue.filter((j) => j.status === "processing").length;
  const failedCount = queue.filter((j) => j.status === "failed").length;

  const rawState = deriveState({ connectionStatus, sessionStatus, pendingCount, processingCount, failedCount });

  // Hold SYNCING visible for at least MIN_SYNCING_MS to avoid flash.
  const [visibleState, setVisibleState] = useState(rawState);
  const syncingHeldUntilRef = useRef(0);
  const transitionTimerRef = useRef(null);
  /** Epoch ms when rawState first entered SYNCING in this streak; 0 = not currently syncing. */
  const syncingStartedAtRef = useRef(0);
  const maxSyncingTimerRef = useRef(null);

  useEffect(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }

    if (rawState === S.SYNCING) {
      syncingHeldUntilRef.current = Date.now() + MIN_SYNCING_MS;
      setVisibleState(S.SYNCING);

      // Start the max-syncing safety timer once per syncing streak.
      if (syncingStartedAtRef.current === 0) {
        syncingStartedAtRef.current = Date.now();
        maxSyncingTimerRef.current = setTimeout(() => {
          maxSyncingTimerRef.current = null;
          // Only escape if we're still visibly syncing — queue may have resolved on its own.
          setVisibleState((prev) => (prev === S.SYNCING ? S.SYNCED : prev));
          syncingStartedAtRef.current = 0;
        }, MAX_SYNCING_MS);
      }
      return;
    }

    // Leaving SYNCING — reset the streak tracker and cancel the max-syncing timer.
    if (syncingStartedAtRef.current !== 0) {
      syncingStartedAtRef.current = 0;
    }
    if (maxSyncingTimerRef.current) {
      clearTimeout(maxSyncingTimerRef.current);
      maxSyncingTimerRef.current = null;
    }

    const now = Date.now();
    const held = syncingHeldUntilRef.current;

    if (held > now) {
      // We were syncing — wait out the hold before transitioning.
      transitionTimerRef.current = setTimeout(() => {
        transitionTimerRef.current = null;
        setVisibleState((prev) => (prev === S.SYNCING ? rawState : prev));
      }, held - now);
      return;
    }

    setVisibleState(rawState);
  }, [rawState]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      if (maxSyncingTimerRef.current) clearTimeout(maxSyncingTimerRef.current);
    };
  }, []);

  const cfg = CONFIG[visibleState];
  const Icon = cfg.icon;

  // Hide the "synced" indicator when nothing interesting is happening and we have no failures.
  // This keeps the header clean in the normal steady state.
  const hideSynced = visibleState === S.SYNCED && failedCount === 0;

  return (
    <div
      className={cn("pointer-events-none flex min-w-0 items-center justify-end", className)}
      aria-hidden={hideSynced}
      aria-label={hideSynced ? undefined : "Sync status"}
    >
      <AnimatePresence mode="wait">
        {!hideSynced && (
          <motion.div
            key={visibleState}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: prefersReducedMotion ? 0.08 : 0.18 }}
            className={cn(
              "pointer-events-auto flex items-center gap-1.5 text-[10px] font-medium sm:text-xs",
              cfg.pill,
              cfg.pulse && !prefersReducedMotion && "animate-pulse"
            )}
            role="status"
            aria-live="polite"
          >
            <Icon
              className={cn(
                "h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5",
                cfg.spin && !prefersReducedMotion && "animate-spin"
              )}
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="max-w-[5rem] truncate sm:max-w-[9rem]">{cfg.label}</span>

            {/* Retry button — only shown when there are failed jobs */}
            {visibleState === S.ERROR && (failedCount > 0) && (
              <button
                type="button"
                aria-label="Retry failed sync jobs"
                title="Retry failed sync jobs"
                className="pointer-events-auto ml-0.5 rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
                onClick={() => {
                  retryAllFailed();
                  onRetryFailed?.();
                }}
              >
                <RefreshCw className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
