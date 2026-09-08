import { requireOrgMember } from "../pos/posConnectionsRoutes.js";
import {
  DOCUMENT_EVENT_ACTOR,
  DOCUMENT_EVENT_SOURCE,
  DOCUMENT_EVENT_TYPE,
} from "../../../shared/documents/documentEvents.js";
import { appendDocumentEvent, appendDocumentEventBestEffort, listDocumentEvents } from "./documentEventService.js";
import { computeDocumentEngagementMetrics } from "../../../shared/documents/documentEngagementMetrics.js";
import { supabaseAdmin } from "../supabaseAdmin.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

export async function handleDocumentTimeline(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return jsonError(res, 405, "Method not allowed");
  }
  const gate = await requireOrgMember(req, res);
  if (!gate.ok) return gate.response;

  const sourceKind = String(req.query?.source_kind || req.query?.document_type || "invoice").trim().toLowerCase();
  const sourceId = String(req.query?.document_id || req.query?.invoice_id || req.query?.quote_id || "").trim();
  if (!sourceId) return jsonError(res, 422, "document_id is required");
  if (sourceKind !== DOCUMENT_EVENT_SOURCE.INVOICE && sourceKind !== DOCUMENT_EVENT_SOURCE.QUOTE) {
    return jsonError(res, 422, "source_kind must be invoice or quote");
  }

  try {
    const events = await listDocumentEvents({
      orgId: gate.membership.orgId,
      sourceKind,
      sourceId,
    });
    return res.status(200).json({ ok: true, events });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not load activity");
  }
}

export async function handleDocumentEngagement(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return jsonError(res, 405, "Method not allowed");
  }
  const gate = await requireOrgMember(req, res);
  if (!gate.ok) return gate.response;

  try {
    const [{ data: events }, { data: invoices }, { data: payments }, { data: quotes }] = await Promise.all([
      supabaseAdmin
        .from("document_events")
        .select("source_id, document_id, source_kind, document_type, event_type, payload, occurred_at, created_at")
        .eq("org_id", gate.membership.orgId)
        .in("source_kind", [DOCUMENT_EVENT_SOURCE.INVOICE, DOCUMENT_EVENT_SOURCE.QUOTE])
        .limit(3000),
      supabaseAdmin
        .from("invoices")
        .select("id, status, total_amount, delivery_date, due_date")
        .eq("org_id", gate.membership.orgId)
        .limit(1000),
      supabaseAdmin
        .from("payments")
        .select("id, invoice_id, amount, status, paid_at")
        .eq("org_id", gate.membership.orgId)
        .limit(2000),
      supabaseAdmin
        .from("quotes")
        .select("id, status, total_amount")
        .eq("org_id", gate.membership.orgId)
        .limit(1000),
    ]);
    return res.status(200).json({
      ok: true,
      metrics: computeDocumentEngagementMetrics({
        events: events || [],
        invoices: invoices || [],
        payments: payments || [],
        quotes: quotes || [],
      }),
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not load engagement metrics");
  }
}

export async function handleDocumentEventIngest(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return jsonError(res, 405, "Method not allowed");
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const eventType = String(body.event_type || "").trim().toLowerCase();
  if (eventType !== DOCUMENT_EVENT_TYPE.clicked && eventType !== DOCUMENT_EVENT_TYPE.opened) {
    return jsonError(res, 422, "Only opened and clicked events can be ingested here");
  }

  const gate = await requireOrgMember(req, res);
  if (!gate.ok) return gate.response;

  const sourceKind = String(body.source_kind || body.document_type || "invoice").trim().toLowerCase();
  const sourceId = String(body.document_id || body.invoice_id || body.quote_id || "").trim();
  if (!sourceId) return jsonError(res, 422, "document_id is required");

  try {
    const written = await appendDocumentEvent({
      orgId: gate.membership.orgId,
      sourceKind,
      sourceId,
      documentType: sourceKind,
      eventType,
      actorType: DOCUMENT_EVENT_ACTOR.USER,
      actorUserId: gate.user.id,
      action: body.action,
      channel: body.source || "app",
      metadata: {
        action:
          body.action ||
          (eventType === DOCUMENT_EVENT_TYPE.clicked
            ? sourceKind === DOCUMENT_EVENT_SOURCE.QUOTE
              ? "primary_cta"
              : "payment_cta"
            : null),
        source: body.source || (sourceKind === DOCUMENT_EVENT_SOURCE.QUOTE ? "quote_owner" : "invoice_owner"),
      },
    });
    return res.status(written.duplicate ? 200 : 201).json({ ok: true, duplicate: written.duplicate, event: written.event });
  } catch (err) {
    return jsonError(res, err?.status || 500, err?.message || "Could not record event");
  }
}
