/**
 * @deprecated Trial expiry is server-owned (cron + service role). Client-triggered expiry calls are disabled.
 */
export async function expireTrialIfDueViaRpc() {
  return { ok: true, skipped: true, reason: "server_owned_trial_expiry" };
}
