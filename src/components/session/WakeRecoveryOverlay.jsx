import { useEffect, useState } from "react";
import { useWakeRecoveryStore } from "@/stores/wakeRecoveryStore";
import { WakeRecoveryLifecycleEventType } from "@/core/session/wakeRecoveryLifecycleEvents";

const OVERLAY_AFTER_MS = 1500;

/**
 * Full-screen barrier during wake-from-sleep recovery (blocks accidental double-submits).
 * Shown only after {@link OVERLAY_AFTER_MS} so brief recoveries stay invisible.
 */
export default function WakeRecoveryOverlay() {
  const block = useWakeRecoveryStore((s) => s.blockMutations);
  const lockPhase = useWakeRecoveryStore((s) => s.lockPhase);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    if (!block) {
      setShowOverlay(false);
      return undefined;
    }
    if (typeof window === "undefined") return undefined;
    const id = window.setTimeout(() => setShowOverlay(true), OVERLAY_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [block]);

  /** Hide immediately on sequence end / failure (dispatched after unlock in AuthProvider `finally`). */
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const hide = () => setShowOverlay(false);
    window.addEventListener(WakeRecoveryLifecycleEventType.ENDED, hide);
    window.addEventListener(WakeRecoveryLifecycleEventType.FAILED, hide);
    window.addEventListener("paidly:wake-recovery-end", hide);
    return () => {
      window.removeEventListener(WakeRecoveryLifecycleEventType.ENDED, hide);
      window.removeEventListener(WakeRecoveryLifecycleEventType.FAILED, hide);
      window.removeEventListener("paidly:wake-recovery-end", hide);
    };
  }, []);

  if (!block || !showOverlay) return null;

  const title =
    lockPhase === "realtime" ? "Restoring your workspace" : "Reconnecting securely";
  const detail =
    lockPhase === "realtime"
      ? "Restoring live updates and your data. Please wait — saves stay paused until this finishes."
      : "Restoring your workspace after this tab was idle. This usually takes a few seconds.";

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-background/75 backdrop-blur-sm px-4"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-labelledby="wake-recovery-title"
    >
      <div className="max-w-sm rounded-2xl border border-border bg-card px-6 py-5 text-center shadow-xl">
        <p id="wake-recovery-title" className="text-base font-semibold text-foreground">
          {title}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        <div className="mt-4 flex justify-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
