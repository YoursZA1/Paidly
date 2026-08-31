import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Registers the production service worker and offers a non-blocking update.
 * Never auto-reloads (would drop unsaved invoice/quote edits).
 */
export default function PwaLifecycle() {
  const toastIdRef = useRef(null);
  const updateTimerRef = useRef(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      if (updateTimerRef.current) window.clearInterval(updateTimerRef.current);
      updateTimerRef.current = window.setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        void registration.update();
      }, 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    return () => {
      if (updateTimerRef.current) window.clearInterval(updateTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!needRefresh) return;
    if (toastIdRef.current) return;
    toastIdRef.current = toast("A new version of Paidly is ready", {
      duration: Infinity,
      id: "paidly-pwa-update",
      description: "Update when you are ready — open work is not interrupted.",
      action: {
        label: "Update",
        onClick: () => {
          toastIdRef.current = null;
          void updateServiceWorker(true);
        },
      },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
