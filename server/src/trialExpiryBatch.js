/**
 * Calls `expire_all_overdue_trials()` (service_role) — same rules as per-user `expire_trial_if_due`,
 * for users who never open the app after trial ends.
 */
export async function runExpireOverdueTrialsBatch(supabase) {
  if (!supabase?.rpc) return;
  try {
    const { data, error } = await supabase.rpc("expire_all_overdue_trials");
    if (error) {
      console.warn("[trial-batch] expire_all_overdue_trials:", error.message);
      return;
    }
    const n = typeof data === "number" ? data : 0;
    if (n > 0) {
      console.log(`[trial-batch] Marked ${n} overdue trial profile(s) as expired`);
    }
  } catch (e) {
    console.warn("[trial-batch]", e?.message || e);
  }
}
