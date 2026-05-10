/**
 * Single import surface for auth-time realtime: JWT reconciliation on the multiplex channel,
 * debounced handler fan-out, and wake-time “rejoin main channel” sequencing.
 */
import {
  reconcilePaidlyRealtimeAfterTokenRefresh,
  waitForPaidlyMainChannelJoined,
} from "@/lib/realtime/paidlyRealtimeManager";
import {
  awaitRealtimeRecoveryHandlers,
  requestRealtimeRecoveryAfterAuth,
} from "@/lib/realtimeRecoveryRegistry";

/** Fire-and-forget: push JWT into Realtime + rebuild Paidly multiplex when there is work. */
export function reconcileRealtimeJwt(accessToken, reason) {
  void reconcilePaidlyRealtimeAfterTokenRefresh(accessToken, reason);
}

/** Debounced recovery handlers (SyncEngine + friends) after session resync / tab events. */
export function scheduleRealtimeRecoveryAfterAuth(reason, opts) {
  requestRealtimeRecoveryAfterAuth(reason, opts);
}

/**
 * Await registered recovery handlers, then wait for the main multiplex channel to join (or no work).
 * @param {string} reason
 * @param {{ channelJoinTimeoutMs?: number, only?: string[] }} [opts]
 */
export async function awaitRealtimeRecoveryAndMainChannel(reason, opts = {}) {
  const { channelJoinTimeoutMs = 12_000, only } = opts;
  await awaitRealtimeRecoveryHandlers(reason, only != null ? { only } : {});
  await waitForPaidlyMainChannelJoined({ timeoutMs: channelJoinTimeoutMs });
}

/** Supabase `onAuthStateChange` branches that must reconcile Realtime JWT. */
export function reconcileRealtimeJwtFromSupabaseAuthEvent(event, accessToken) {
  if (event === "TOKEN_REFRESHED") {
    void reconcilePaidlyRealtimeAfterTokenRefresh(accessToken, "token_refreshed");
  } else if (event === "USER_UPDATED" && accessToken) {
    void reconcilePaidlyRealtimeAfterTokenRefresh(accessToken, "user_updated");
  }
}
