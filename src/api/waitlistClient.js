import { supabase } from "@/lib/supabaseClient";
import { backendApi } from "@/api/backendClient";
import { alertSupabaseWriteFailure } from "@/utils/supabaseErrorUtils";

/**
 * Insert waitlist row via Supabase (anon key + RLS insert policy).
 * Falls back to Node `/api/waitlist` if the table/policy is not available (older deploys).
 *
 * @param {{ email: string, name?: string, source?: string }} payload
 * @returns {Promise<{ ok: boolean, message?: string, error?: string, duplicate?: boolean }>}
 */
export async function submitWaitlistSignup(payload) {
  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  const name = payload.name != null ? String(payload.name).trim() : "";
  const source = payload.source != null ? String(payload.source).trim() : "landing";

  const trySupabase = async () => {
    const { error } = await supabase.from("waitlist_signups").insert({
      email,
      name: name || null,
      source: source || "landing",
    });
    if (!error) return { ok: true };
    if (error.code === "23505") {
      return { ok: true, duplicate: true };
    }
    return { ok: false, error };
  };

  const supaResult = await trySupabase();
  if (supaResult.ok) {
    return {
      ok: true,
      duplicate: supaResult.duplicate === true,
      message: supaResult.duplicate
        ? "You're already on the list — we'll email you before we launch."
        : undefined,
    };
  }

  try {
    const { data } = await backendApi.post("/api/waitlist", {
      email,
      name: name || undefined,
      source: source || "landing",
    });
    return data;
  } catch (err) {
    const msg =
      err?.response?.data?.error ||
      supaResult.error?.message ||
      err?.message ||
      "We couldn't save that right now. Please try again in a moment.";
    alertSupabaseWriteFailure(err, "Waitlist signup");
    return { ok: false, error: msg };
  }
}
