import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  POS_CONNECTIVITY,
  posConnectivityLabel,
} from "@/lib/pos/posConnectivity";

/**
 * Till connectivity — always visible (unlike the dashboard header, which hides “connected”).
 * Does not imply offline sales are queued.
 */
export default function PosConnectivityBar({ state, className }) {
  const label = posConnectivityLabel(state);
  const Icon =
    state === POS_CONNECTIVITY.ONLINE
      ? Wifi
      : state === POS_CONNECTIVITY.RECONNECTING
        ? Loader2
        : WifiOff;

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium leading-none sm:text-xs",
        state === POS_CONNECTIVITY.ONLINE &&
          "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
        state === POS_CONNECTIVITY.RECONNECTING &&
          "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-100",
        state === POS_CONNECTIVITY.OFFLINE &&
          "border-red-500/35 bg-red-500/10 text-red-900 dark:text-red-100",
        className
      )}
      role="status"
      aria-live="polite"
      title={
        state === POS_CONNECTIVITY.ONLINE
          ? "Connected. Checkout can run."
          : "Checkout needs a connection. Cash is not queued on this device."
      }
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          state === POS_CONNECTIVITY.RECONNECTING && "animate-spin"
        )}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </div>
  );
}
