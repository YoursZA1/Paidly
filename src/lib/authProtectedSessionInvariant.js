import { supabase } from "@/lib/supabaseClient";
import { isPathAllowedWithoutSession } from "@/utils/sessionGuard";

const INVARIANT_MISS_KEY = "paidly_protected_session_invariant_miss";
const INVARIANT_MISS_WINDOW_MS = 30_000;
const INVARIANT_REQUIRED_MISSES = 2;

function readMissState() {
  if (typeof window === "undefined") return { count: 0, ts: 0 };
  try {
    const raw = window.sessionStorage.getItem(INVARIANT_MISS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return { count: 0, ts: 0 };
    return {
      count: Number(parsed.count) || 0,
      ts: Number(parsed.ts) || 0,
    };
  } catch {
    return { count: 0, ts: 0 };
  }
}

function writeMissState(count) {
  if (typeof window === "undefined") return;
  try {
    if (count <= 0) {
      window.sessionStorage.removeItem(INVARIANT_MISS_KEY);
      return;
    }
    window.sessionStorage.setItem(
      INVARIANT_MISS_KEY,
      JSON.stringify({ count, ts: Date.now() })
    );
  } catch {
    // ignore
  }
}

/**
 * Explicit stale-state condition (narrow):
 * - URL is not a public/session-optional path, AND
 * - Auth bootstrap is finished (`loading` false), AND
 * - We still believe the user was signed in (refs / last-known ids), AND
 * - `getSession()` returns success (no transport error) but no session user.
 *
 * Then the client storage truly has no session → hard navigation to sign-in.
 * Skips guests (no believed sign-in) and flaky networks (`getSession` error or offline).
 */
export async function enforceProtectedRouteSessionInvariant(pathname, { loading, believedSignedIn }) {
  if (typeof window === "undefined") return;
  if (loading) return;
  if (!pathname || isPathAllowedWithoutSession(pathname)) return;
  if (!believedSignedIn) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const { data, error } = await supabase.auth.getSession();
  if (error) return;
  if (data?.session?.user) {
    writeMissState(0);
    return;
  }

  const miss = readMissState();
  const now = Date.now();
  const nextMissCount = now - miss.ts <= INVARIANT_MISS_WINDOW_MS ? miss.count + 1 : 1;
  writeMissState(nextMissCount);
  if (nextMissCount < INVARIANT_REQUIRED_MISSES) return;
  window.location.assign("/login");
}
