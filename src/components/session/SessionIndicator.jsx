import { useSessionHealth } from "@/hooks/useSessionHealth";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
import { cn } from "@/lib/utils";

export default function SessionIndicator({ className }) {
  const { status } = useSessionHealth();
  const reason = useSessionHealthStore((s) => s.reason);

  if (status === SESSION_STATUS.CONNECTED) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs",
          className
        )}
      >
        <span className="w-2 h-2 bg-green-400 rounded-full" />
        Connected
      </div>
    );
  }

  if (status === SESSION_STATUS.UNSTABLE) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs",
          className
        )}
      >
        <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
        Unstable connection
      </div>
    );
  }

  if (status === SESSION_STATUS.RECONNECTING) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-xs",
          className
        )}
      >
        <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
        Syncing…
      </div>
    );
  }

  if (status === SESSION_STATUS.DEGRADED) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 text-orange-400 text-xs",
          className
        )}
      >
        <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
        Degraded — recovering
      </div>
    );
  }

  if (status === SESSION_STATUS.REAUTH_REQUIRED) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 text-xs",
          className
        )}
      >
        <span className="w-2 h-2 bg-rose-400 rounded-full" />
        Sign in required
      </div>
    );
  }

  if (status === SESSION_STATUS.EXPIRED) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs",
          className
        )}
      >
        <span className="w-2 h-2 bg-red-400 rounded-full" />
        {reason === "inactivity_timeout" ? "Signed out" : "Session expired"}
      </div>
    );
  }

  return null;
}

