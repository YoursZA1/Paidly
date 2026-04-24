import { cn } from "@/lib/utils";
import { useSessionHealthStore } from "@/stores/sessionHealthStore";

const LABELS = {
  connected: "Connected",
  reconnecting: "Reconnecting",
  expired: "Expired",
};

export default function SessionIndicator({ className }) {
  const status = useSessionHealthStore((s) => s.status);
  const reason = useSessionHealthStore((s) => s.reason);
  const label =
    status === "reconnecting" && reason === "offline"
      ? "Offline"
      : status === "reconnecting" && reason === "refresh_failed"
        ? "Session retrying"
        : LABELS[status] || LABELS.connected;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
        status === "connected" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        status === "reconnecting" && "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        status === "expired" && "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          status === "connected" && "bg-emerald-500",
          status === "reconnecting" && "bg-amber-500 animate-pulse",
          status === "expired" && "bg-red-500"
        )}
        aria-hidden
      />
      {label}
    </div>
  );
}

