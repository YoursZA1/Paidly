import { getBillingSupabaseAdmin } from "./supabaseAdmin.js";
import { assertInternalBillingSecret } from "./httpAuth.js";
import { SUBSCRIPTION_STATUS } from "../../../shared/subscriptionStatuses.js";
import { SUBSCRIPTION_EVENT_TYPE } from "../../../shared/subscriptionEventTypes.js";

function json(res, status, body) {
  return res.status(status).json(body);
}

/**
 * POST /api/internal/activate
 * Body: { subscriptionId }
 * Only after verified ITN path may set active — this endpoint is for ops/cron recovery when
 * payment_history already has a verified completed row. Never call from the SPA.
 */
export async function handleInternalActivate(req, res) {
  const gate = assertInternalBillingSecret(req);
  if (!gate.ok) return json(res, gate.status, { error: gate.error });

  const supabase = getBillingSupabaseAdmin();
  if (!supabase) return json(res, 503, { error: "Server misconfigured" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const subscriptionId = String(body.subscriptionId || body.id || "").trim();
  if (!subscriptionId) return json(res, 400, { error: "subscriptionId is required" });

  const { data: payment } = await supabase
    .from("payment_history")
    .select("id, payment_status")
    .eq("subscription_id", subscriptionId)
    .eq("payment_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) {
    return json(res, 409, {
      error: "No completed payment_history row for subscription — refusing activation",
    });
  }

  const nowIso = new Date().toISOString();
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .update({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      activated_at: nowIso,
      started_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", subscriptionId)
    .select("id, status, company_id, activated_at")
    .single();

  if (error) {
    console.error("[billing/internal/activate]", error);
    return json(res, 500, { error: "Activation failed" });
  }

  await supabase.from("subscription_events").insert({
    subscription_id: subscriptionId,
    company_id: sub.company_id,
    event_type: SUBSCRIPTION_EVENT_TYPE.PAYMENT_VERIFIED,
    source: "system",
    details: { via: "internal_activate", payment_history_id: payment.id },
  });
  await supabase.from("subscription_events").insert({
    subscription_id: subscriptionId,
    company_id: sub.company_id,
    event_type: SUBSCRIPTION_EVENT_TYPE.ACTIVATED,
    source: "system",
    details: { via: "internal_activate", payment_history_id: payment.id },
  });

  return json(res, 200, { subscription: sub });
}

/**
 * POST /api/internal/expire
 * Expires pending past pending_expires_at and optionally status=expired for period end.
 * Body: { mode?: 'pending'|'period'|'all', limit?: number }
 */
export async function handleInternalExpire(req, res) {
  const gate = assertInternalBillingSecret(req);
  if (!gate.ok) return json(res, gate.status, { error: gate.error });

  const supabase = getBillingSupabaseAdmin();
  if (!supabase) return json(res, 503, { error: "Server misconfigured" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const mode = String(body.mode || "all").toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(body.limit) || 100));
  const nowIso = new Date().toISOString();
  const results = { pendingExpired: 0, periodExpired: 0 };

  if (mode === "pending" || mode === "all") {
    const { data: pendingRows } = await supabase
      .from("subscriptions")
      .select("id, company_id")
      .eq("status", SUBSCRIPTION_STATUS.PENDING)
      .lt("pending_expires_at", nowIso)
      .limit(limit);

    for (const row of pendingRows || []) {
      const { error } = await supabase
        .from("subscriptions")
        .update({
          status: SUBSCRIPTION_STATUS.EXPIRED,
          updated_at: nowIso,
        })
        .eq("id", row.id)
        .eq("status", SUBSCRIPTION_STATUS.PENDING);
      if (!error) {
        results.pendingExpired += 1;
        await supabase.from("subscription_events").insert({
          subscription_id: row.id,
          company_id: row.company_id,
          event_type: SUBSCRIPTION_EVENT_TYPE.CANCELLED,
          source: "cron",
          details: { reason: "pending_expired" },
        });
      }
    }
  }

  if (mode === "period" || mode === "all") {
    const { data: periodRows } = await supabase
      .from("subscriptions")
      .select("id, company_id")
      .in("status", [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIALING])
      .lt("expires_at", nowIso)
      .not("expires_at", "is", null)
      .limit(limit);

    for (const row of periodRows || []) {
      const { error } = await supabase
        .from("subscriptions")
        .update({
          status: SUBSCRIPTION_STATUS.EXPIRED,
          updated_at: nowIso,
        })
        .eq("id", row.id);
      if (!error) {
        results.periodExpired += 1;
        await supabase.from("subscription_events").insert({
          subscription_id: row.id,
          company_id: row.company_id,
          event_type: SUBSCRIPTION_EVENT_TYPE.CANCELLED,
          source: "cron",
          details: { reason: "period_expired" },
        });
      }
    }
  }

  return json(res, 200, { ok: true, ...results });
}
