import { supabase } from "@/lib/supabaseClient";

const HEALTH_TIMEOUT_MS = 4500;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label || "timeout")), ms);
    }),
  ]);
}

function isLikelyNetworkError(err) {
  if (!err) return false;
  const msg = String(err.message || err.toString() || "").toLowerCase();
  return (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("load failed") ||
    err.name === "AbortError"
  );
}

/**
 * Validates Supabase auth + a minimal PostgREST read when logged in.
 * @returns {{ ok: boolean, error?: Error }}
 */
export async function runSupabaseHealthCheck() {
  try {
    const { data: sessionData, error: sessionError } = await withTimeout(
      supabase.auth.getSession(),
      HEALTH_TIMEOUT_MS,
      "session_reconnecting"
    );

    if (sessionError) {
      if (isLikelyNetworkError(sessionError)) {
        return { ok: false, error: sessionError };
      }
      // Auth errors (e.g. invalid refresh) — still "reachable"; treat as connected for network indicator
    }

    const uid = sessionData?.session?.user?.id;
    if (uid) {
      const { error: profileError } = await withTimeout(
        supabase.from("profiles").select("id").eq("id", uid).limit(1).maybeSingle(),
        HEALTH_TIMEOUT_MS,
        "profiles_timeout"
      );
      // RLS / missing row means API responded — not a network outage
      if (profileError && isLikelyNetworkError(profileError)) {
        return { ok: false, error: profileError };
      }
    }

    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { ok: false, error: err };
  }
}
