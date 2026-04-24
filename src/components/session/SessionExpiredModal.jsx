import { useMemo, useState } from "react";
import { useSessionHealthStore, setSessionHealthStatus } from "@/stores/sessionHealthStore";
import { useAuth } from "@/contexts/AuthContext";
import { isPathAllowedWithoutSession } from "@/utils/sessionGuard";
import Button from "@/components/ui/button";

export default function SessionExpiredModal() {
  const status = useSessionHealthStore((s) => s.status);
  const reason = useSessionHealthStore((s) => s.reason);
  const { refreshSession } = useAuth();
  const [busy, setBusy] = useState(false);

  const shouldShow = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (status !== "expired") return false;
    return !isPathAllowedWithoutSession(window.location.pathname);
  }, [status]);

  const handleReconnect = async () => {
    setBusy(true);
    setSessionHealthStatus("reconnecting");
    try {
      const ok = await refreshSession();
      if (!ok) {
        window.location.assign("/login");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">Session expired</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your session needs to be reconnected. You can try to reconnect now, otherwise continue to sign in.
        </p>
        {reason ? <p className="mt-1 text-xs text-muted-foreground">Reason: {reason}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => window.location.assign("/login")}>
            Go to login
          </Button>
          <Button onClick={() => void handleReconnect()} disabled={busy}>
            {busy ? "Reconnecting..." : "Reconnect"}
          </Button>
        </div>
      </div>
    </div>
  );
}

