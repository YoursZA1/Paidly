import { useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { endLiveDemo, purgeLocalAppCaches } from "@/lib/demo/demoModeApi";
import { setDemoModeActive } from "@/lib/demo/demoModeState";

/**
 * Leaving Demo Mode: the server deletes the demo workspace, this browser signs out and drops every
 * cached query, then lands on `to` with a full page load (no demo state survives in memory).
 */
export function useDemoActions() {
  const { logout } = useAuth();
  const [leaving, setLeaving] = useState(false);

  const leaveDemo = useCallback(
    async (to = "/demo") => {
      if (leaving) return;
      setLeaving(true);
      try {
        await endLiveDemo();
        try {
          await logout?.();
        } catch {
          /* already signed out */
        }
        await purgeLocalAppCaches();
        setDemoModeActive(false);
      } finally {
        window.location.assign(to);
      }
    },
    [leaving, logout]
  );

  return {
    leaving,
    /** End the demo and return to the demo landing page. */
    endDemo: () => leaveDemo("/demo?ended=1"),
    /** End the demo and open signup — a demo account can never become a real one. */
    createAccount: () => leaveDemo("/signup?from=demo"),
  };
}
