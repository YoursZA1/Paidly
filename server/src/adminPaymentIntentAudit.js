/**
 * One-intent support lookup. Not the finance dashboard.
 * Admin role only. The caller must write an audit_logs row before any
 * business name is returned. If the log insert fails, the lookup stops.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeAuditReason(raw) {
  const reason = String(raw || "").trim().replace(/\s+/g, " ");
  if (reason.length < 8 || reason.length > 280) return null;
  return reason;
}

export function normalizeAuditIntentId(raw) {
  const id = String(raw || "").trim();
  return UUID.test(id) ? id : null;
}

export async function investigatePaymentIntent(supabase, { intentId, reason, actor }) {
  const id = normalizeAuditIntentId(intentId);
  const why = normalizeAuditReason(reason);
  if (!id) return { status: 400, error: "A payment intent id is required" };
  if (!why) return { status: 400, error: "Say why this payment is being investigated (at least 8 characters)" };
  if (!actor?.id) return { status: 403, error: "Admin access required" };

  const logged = await supabase.from("audit_logs").insert({
    category: "finance",
    action: "admin_payment_intent_audit",
    description: why,
    before: {},
    after: { intent_id: id },
    actor_id: actor.id,
    actor_email: actor.email || null,
    actor_name: actor.user_metadata?.full_name || actor.email || null,
    actor_role: "admin",
    target_label: id,
  });
  if (logged.error) {
    return { status: 503, error: "Investigation was not opened because the audit log could not be written" };
  }

  const { data, error } = await supabase
    .from("payment_intents")
    .select("id, org_id, source_kind, document_type, provider, amount, currency, status, created_at, metadata")
    .eq("id", id)
    .maybeSingle();
  if (error) return { status: 500, error: "Could not load that payment intent" };
  if (!data) return { status: 404, error: "Payment intent not found" };

  let business = null;
  if (data.org_id) {
    const org = await supabase.from("organizations").select("name").eq("id", data.org_id).maybeSingle();
    business = org.data?.name || null;
  }

  return {
    status: 200,
    audit: {
      id: data.id,
      business,
      source: data.source_kind || null,
      documentType: data.document_type || null,
      provider: data.provider || null,
      method: data.metadata?.offline_method || null,
      amount: data.amount,
      currency: data.currency || "ZAR",
      status: data.status || null,
      createdAt: data.created_at || null,
    },
  };
}
