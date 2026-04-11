/**
 * Runs DB-side trial expiry for the signed-in user (SECURITY DEFINER RPC).
 * Billing fields are not writable from the browser on `profiles`; this replaces a raw `.update()`.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} [client]
 */
export async function expireTrialIfDueViaRpc(client) {
  const db = client;
  if (!db?.rpc) return;
  try {
    const { error } = await db.rpc("expire_trial_if_due");
    if (error && import.meta.env?.DEV) {
      console.warn("[trial] expire_trial_if_due:", error.message);
    }
  } catch (e) {
    if (import.meta.env?.DEV) {
      console.warn("[trial] expire_trial_if_due:", e?.message || e);
    }
  }
}
