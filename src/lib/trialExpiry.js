/**
 * Runs trial-expiry via backend API (service-role execution on server).
 * Client never calls sensitive RPC directly.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} [client]
 */
export async function expireTrialIfDueViaRpc(client) {
  const db = client;
  if (!db?.auth) return;
  if (expireTrialApiDisabled) return;
  try {
    const { data: sessionData } = await db.auth.getSession();
    const accessToken = sessionData?.session?.access_token || null;
    const userId = sessionData?.session?.user?.id || null;
    if (!accessToken || !userId) return;

    const response = await fetch("/api/cron/expire-trials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ user_id: userId }),
    });

    if (!response.ok) {
      if ([401, 403, 404, 405].includes(response.status)) {
        expireTrialApiDisabled = true;
      }
      if (import.meta.env?.DEV) {
        console.warn("[trial] /api/cron/expire-trials failed:", response.status);
      }
    }
  } catch (e) {
    if (import.meta.env?.DEV) {
      console.warn("[trial] /api/cron/expire-trials:", e?.message || e);
    }
  }
}

let expireTrialApiDisabled = false;
