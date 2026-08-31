import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  normalizePosAuditWrite,
  publicPosAuditView,
  POS_AUDIT_EVENT,
  POS_AUDIT_ACTOR,
} from "./posAuditMath.js";
import { isValidUuid } from "../inputValidation.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function isMissingAuditTable(message) {
  const msg = String(message || "");
  return /pos_audit_events/i.test(msg) && /schema cache|does not exist|could not find the/i.test(msg);
}

/**
 * Append-only till lifecycle. Never throws into checkout — a missing migration
 * must not block a paid sale.
 */
export async function recordPosAuditEvent(input) {
  const parsed = normalizePosAuditWrite(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    const { error } = await supabaseAdmin.from("pos_audit_events").insert(parsed.data);
    if (error) {
      if (isMissingAuditTable(error.message)) return { ok: false, missingSchema: true };
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    if (isMissingAuditTable(err?.message)) return { ok: false, missingSchema: true };
    return { ok: false, error: err?.message || "Could not write POS audit event" };
  }
}

export async function recordPosAuditEvents(rows) {
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    await recordPosAuditEvent(row);
  }
}

/**
 * GET /api/pos/sales/:id/audit
 */
export async function handlePosSaleAudit(req, res, gate) {
  const saleId = String(req.params?.id || "").trim();
  if (!isValidUuid(saleId)) return jsonError(res, 422, "sale id is invalid");

  const { data: sale, error: saleError } = await supabaseAdmin
    .from("pos_sales_events")
    .select("id, org_id")
    .eq("id", saleId)
    .eq("org_id", gate.membership.orgId)
    .maybeSingle();
  if (saleError) return jsonError(res, 500, saleError.message || "Could not load sale");
  if (!sale?.id) return jsonError(res, 404, "Sale not found");

  const { data, error } = await supabaseAdmin
    .from("pos_audit_events")
    .select("id, event_type, actor_type, actor_id, sale_event_id, payment_intent_id, metadata, occurred_at, created_at")
    .eq("org_id", gate.membership.orgId)
    .or(`sale_event_id.eq.${saleId},metadata->>return_id.eq.${saleId}`)
    .order("occurred_at", { ascending: true })
    .limit(200);

  if (error) {
    if (isMissingAuditTable(error.message)) {
      return res.status(200).json({ events: [], sale_id: saleId });
    }
    return jsonError(res, 500, error.message || "Could not load POS audit");
  }

  return res.status(200).json({
    sale_id: saleId,
    events: (data || []).map(publicPosAuditView),
  });
}

export { POS_AUDIT_EVENT, POS_AUDIT_ACTOR };
