import { supabase } from "@/lib/supabaseClient";
import { isPathAllowedWithoutSession } from "@/utils/sessionGuard";

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
  if (data?.session?.user) return;

  window.location.assign("/login");
}
