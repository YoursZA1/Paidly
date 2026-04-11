import { toast } from "sonner";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

const TOAST_ID = "paidly-auth-reconnecting";

let consecutiveGetSessionErrors = 0;
const THRESHOLD = 2;

/**
 * Call when `supabase.auth.getSession()` returns `{ error }` (network / flaky edge).
 * After several failures in a row, shows a non-destructive Sonner toast (same id = no stack).
 */
export function reportSupabaseGetSessionFailure() {
  if (typeof window === "undefined" || !isSupabaseConfigured) return;
  consecutiveGetSessionErrors += 1;
  if (consecutiveGetSessionErrors < THRESHOLD) return;
  toast.loading("Reconnecting…", {
    id: TOAST_ID,
    description:
      "We're having trouble reaching the server. Your session stays active; we'll retry automatically.",
    duration: 45_000,
  });
}

/** Call when a getSession (or equivalent) succeeds without error — clears streak and dismisses the toast. */
export function reportSupabaseGetSessionRecovered() {
  consecutiveGetSessionErrors = 0;
  toast.dismiss(TOAST_ID);
}

const ONLINE_LISTENER_KEY = "__paidlyAuthSessionOnlineListener";

if (typeof window !== "undefined" && !window[ONLINE_LISTENER_KEY]) {
  window[ONLINE_LISTENER_KEY] = true;
  window.addEventListener("online", () => {
    consecutiveGetSessionErrors = 0;
    toast.dismiss(TOAST_ID);
  });
}
