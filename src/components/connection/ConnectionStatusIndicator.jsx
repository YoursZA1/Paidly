import { useState, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Wifi, WifiOff, Loader2, RefreshCw } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { CONNECTION_STATUS, useConnectionStore } from "@/stores/useConnectionStore";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionManager } from "@/contexts/SessionManagerContext";
import { runSupabaseHealthCheck } from "@/components/connection/connectionHealth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { decideSessionAction, SESSION_DECISION } from "@/lib/sessionDecisionEngine";
import { useAuthGatedConnectedSignal } from "@/lib/connection/connectionLifecycleStore";

/**
 * Top-bar status: subtle wifi icon when connected (briefly for signed-in users); soft pills for problems + retry.
 * Renders inline — place inside the app header row.
 * “Connected” visibility timing is owned by {@link ConnectionMonitor} (`suppressConnectedIndicator`).
 */
export default function ConnectionStatusIndicator({ className }) {
  const prefersReducedMotion = useReducedMotion();
  const { isAuthenticated } = useAuth();
  const status = useConnectionStore((s) => s.status);
  const lastError = useConnectionStore((s) => s.lastError);
  const suppressConnectedIndicator = useConnectionStore((s) => s.suppressConnectedIndicator);
  const setConnectionState = useConnectionStore((s) => s.setConnectionState);
  const sessionManager = useSessionManager();
  const canShowConnected = useAuthGatedConnectedSignal();

  const sessionStatus = useSessionHealthStore((s) => s.status);
  const sessionHealthy = sessionStatus === SESSION_STATUS.CONNECTED;

  const [retryBusy, setRetryBusy] = useState(false);

  // Sanitize internal snake_case reason codes that should never reach the UI.
  const normalizedError = (() => {
    const raw = String(lastError || "").toLowerCase();
    if (!raw) return null;
    if (
      raw.includes("session_reconnecting") ||
      raw.includes("profiles_timeout") ||
      raw.includes("session_timeout") ||
      raw.includes("inactivity_timeout") ||
      raw.includes("keep_alive") ||
      raw.includes("refreshing") ||
      raw.includes("refresh_ok")
    ) {
      return "Connection interrupted";
    }
    return lastError;
  })();

  const onRetry = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setRetryBusy(true);
    setConnectionState({ status: CONNECTION_STATUS.RECONNECTING, lastError: null });
    try {
      await getStableSession();
      const { ok, error } = await runSupabaseHealthCheck();
      if (ok) {
        // Route through ConnectionManager.markConnected so degradedSince + pending timers are
        // cleared — prevents a stale timer overriding the recovered state on the next failure.
        if (sessionManager?.ConnectionMonitor?.markConnected) {
          sessionManager.ConnectionMonitor.markConnected(setConnectionState);
        } else {
          setConnectionState({ status: CONNECTION_STATUS.CONNECTED, lastError: null, lastCheckAt: Date.now() });
        }
      } else {
        const decision = decideSessionAction({
          reason: error?.message || "retry_unreachable",
          believedSignedIn: isAuthenticated,
          online: typeof navigator !== "undefined" ? navigator.onLine !== false : true,
        });
        setConnectionState({
          status:
            decision.action === SESSION_DECISION.RECONNECTING
              ? CONNECTION_STATUS.RECONNECTING
              : CONNECTION_STATUS.DISCONNECTED,
          lastError: error?.message || "Still unreachable.",
          lastCheckAt: Date.now(),
        });
      }
    } finally {
      setRetryBusy(false);
    }
  }, [isAuthenticated, sessionManager, setConnectionState]);

  if (!isSupabaseConfigured) return null;

  const showConnectedIcon =
    isAuthenticated &&
    canShowConnected &&
    status === CONNECTION_STATUS.CONNECTED &&
    !suppressConnectedIndicator;
  // Never show either problem pill when session health confirms we are connected — the two stores
  // can transiently diverge (e.g. a Supabase CLOSED event sets connectionStore to RECONNECTING
  // while the session-health store already resolved back to CONNECTED). Session health is the
  // authoritative signal; connectionStore is a derived transport view.
  const showProblemPill =
    !sessionHealthy &&
    (status === CONNECTION_STATUS.RECONNECTING || status === CONNECTION_STATUS.DISCONNECTED);
  const visible = showConnectedIcon || showProblemPill;

  const pill = (
    <motion.div
      key={status}
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{
        opacity: 1,
        scale: 1,
      }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: prefersReducedMotion ? 0.12 : 0.2 }}
      title={
        status === CONNECTION_STATUS.CONNECTED
          ? "Connected to Paidly"
          : status === CONNECTION_STATUS.RECONNECTING
            ? "Reconnecting to Paidly…"
            : normalizedError || "Offline"
      }
      className={cn(
        "pointer-events-auto flex items-center gap-1.5 text-[10px] font-medium sm:gap-2 sm:text-xs",
        status === CONNECTION_STATUS.CONNECTED &&
          "rounded-md border-0 bg-transparent px-0 py-0 shadow-none backdrop-blur-0 text-muted-foreground",
        status === CONNECTION_STATUS.RECONNECTING &&
          cn(
            "rounded-full border border-amber-500/35 bg-amber-500/8 px-2 py-1 shadow-none backdrop-blur-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:px-2.5 sm:py-1",
            !prefersReducedMotion && "animate-pulse"
          ),
        status === CONNECTION_STATUS.DISCONNECTED &&
          "rounded-full border border-red-500/35 bg-red-500/8 px-2 py-1 shadow-none backdrop-blur-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100 sm:px-2.5 sm:py-1"
      )}
      role="status"
      aria-live="polite"
    >
      {status === CONNECTION_STATUS.CONNECTED ? (
        <Wifi
          className="h-3.5 w-3.5 shrink-0 opacity-55 sm:h-4 sm:w-4 text-emerald-600 dark:text-emerald-400"
          strokeWidth={1.5}
          aria-hidden
        />
      ) : status === CONNECTION_STATUS.RECONNECTING ? (
        <Loader2
          className={cn("h-3 w-3 shrink-0 opacity-90 sm:h-3.5 sm:w-3.5", !prefersReducedMotion && "animate-spin")}
          strokeWidth={1.75}
          aria-hidden
        />
      ) : (
        <WifiOff className="h-3 w-3 shrink-0 opacity-90 sm:h-3.5 sm:w-3.5" strokeWidth={1.75} aria-hidden />
      )}
      {status === CONNECTION_STATUS.CONNECTED ? null : (
        <span className="max-w-[4.5rem] truncate sm:max-w-[9rem] md:max-w-[13rem]">
          {status === CONNECTION_STATUS.RECONNECTING && "Reconnecting…"}
          {status === CONNECTION_STATUS.DISCONNECTED && (normalizedError || "Offline")}
        </span>
      )}
      {status === CONNECTION_STATUS.DISCONNECTED ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Retry connection"
          className="h-6 w-6 p-0 shrink-0 text-inherit opacity-80 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 sm:h-7 sm:w-7"
          disabled={retryBusy}
          onClick={() => void onRetry()}
        >
          <RefreshCw
            className={cn("h-3 w-3", retryBusy && !prefersReducedMotion && "animate-spin")}
            strokeWidth={1.75}
          />
          <span className="sr-only">Retry connection</span>
        </Button>
      ) : null}
    </motion.div>
  );

  return (
    <div
      className={cn("pointer-events-none flex min-w-0 items-center justify-end", className)}
      aria-hidden={!visible}
      aria-label={visible ? "Connection status" : undefined}
    >
      <AnimatePresence mode="wait">{visible ? pill : null}</AnimatePresence>
    </div>
  );
}
