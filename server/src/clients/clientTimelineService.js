import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  CLIENT_TIMELINE_PAGE_SIZE,
  CLIENT_TIMELINE_MAX_PAGE_SIZE,
  CLIENT_TIMELINE_CATEGORY,
  canViewInternalNotes,
  computeClientAttention,
  computeClientEngagementSignals,
  computeClientRelationshipSummary,
  documentPaymentEventTypeForStatus,
  eventMatchesCategory,
  groupTimelineItems,
  matchesTimelineSearch,
  mergeTimelineItems,
  messageLogToTimelineItems,
  normalizeTimelineCategory,
  normalizeTimelineItem,
  paymentIntentFallbackItem,
  paymentRowToTimelineItem,
} from "../../../shared/clients/clientRelationshipTimeline.js";
import { DOCUMENT_EVENT_SOURCE } from "../../../shared/documents/documentEvents.js";

const SOURCE_FETCH = 120;

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return CLIENT_TIMELINE_PAGE_SIZE;
  return Math.min(CLIENT_TIMELINE_MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}

function applyTimeFilters(query, { from, to, before }) {
  let q = query;
  if (from) q = q.gte("occurred_at", from);
  if (to) q = q.lte("occurred_at", to);
  if (before) q = q.lt("occurred_at", before);
  return q;
}

async function loadClientOrThrow(orgId, clientId) {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id, org_id, name, last_activity_at")
    .eq("org_id", orgId)
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error("Client not found");
    err.status = 404;
    err.code = "CLIENT_NOT_FOUND";
    throw err;
  }
  return data;
}

async function loadDocuments(orgId, clientId) {
  const [{ data: invoices, error: invErr }, { data: quotes, error: quoteErr }] = await Promise.all([
    supabaseAdmin
      .from("invoices")
      .select("id, org_id, client_id, invoice_number, status, total_amount, delivery_date, created_at, updated_at")
      .eq("org_id", orgId)
      .eq("client_id", clientId)
      .limit(2000),
    supabaseAdmin
      .from("quotes")
      .select("id, org_id, client_id, quote_number, status, total_amount, sent_date, created_at, updated_at")
      .eq("org_id", orgId)
      .eq("client_id", clientId)
      .limit(2000),
  ]);
  if (invErr) throw invErr;
  if (quoteErr) throw quoteErr;
  const invoiceIds = (invoices || []).map((row) => row.id).filter(Boolean);
  let payQuery = supabaseAdmin
    .from("payments")
    .select("id, org_id, client_id, invoice_id, amount, status, paid_at, created_at, method, reference")
    .eq("org_id", orgId)
    .limit(2000);
  payQuery = invoiceIds.length
    ? payQuery.or(`client_id.eq.${clientId},invoice_id.in.(${invoiceIds.join(",")})`)
    : payQuery.eq("client_id", clientId);
  const { data: payments, error: payErr } = await payQuery;
  if (payErr) throw payErr;
  return {
    invoices: invoices || [],
    quotes: quotes || [],
    payments: payments || [],
  };
}

function documentNumberMap(invoices, quotes) {
  const map = new Map();
  for (const inv of invoices) map.set(`invoice:${inv.id}`, inv.invoice_number || null);
  for (const q of quotes) map.set(`quote:${q.id}`, q.quote_number || null);
  return map;
}

function withDocumentNumber(item, numbers) {
  if (item.documentNumber || !item.documentId) return item;
  const kind = item.documentType || item.sourceKind;
  const number = numbers.get(`${kind}:${item.documentId}`);
  if (!number) return item;
  return normalizeTimelineItem({ ...item, documentNumber: number, metadata: { ...item.metadata, [`${kind}_number`]: number } });
}

async function loadDocumentEvents(orgId, clientId, { from, to, before, documentId, documentType }) {
  let query = supabaseAdmin
    .from("document_events")
    .select(
      "id, org_id, client_id, source_kind, source_id, document_id, document_type, event_type, payload, actor_type, actor_user_id, occurred_at, payment_intent_id, idempotency_key"
    )
    .eq("org_id", orgId)
    .eq("client_id", clientId)
    .in("source_kind", [DOCUMENT_EVENT_SOURCE.INVOICE, DOCUMENT_EVENT_SOURCE.QUOTE]);
  // Payslip events stay on the employee/payroll timeline, never this client feed.
  query = applyTimeFilters(query, { from, to, before });
  if (documentId) {
    query = query.or(`source_id.eq.${documentId},document_id.eq.${documentId}`);
  }
  if (documentType === "invoice" || documentType === "quote") {
    query = query.eq("source_kind", documentType);
  }
  const { data, error } = await query.order("occurred_at", { ascending: false }).limit(SOURCE_FETCH);
  if (error) throw error;
  return (data || []).map((row) =>
    normalizeTimelineItem({
      id: `de:${row.id}`,
      origin: "document_events",
      eventType: row.event_type,
      sourceKind: row.source_kind,
      documentType: row.document_type || row.source_kind,
      documentId: row.source_id || row.document_id,
      clientId: row.client_id,
      actorType: row.actor_type,
      actorId: row.actor_user_id,
      occurredAt: row.occurred_at,
      paymentIntentId: row.payment_intent_id,
      metadata: row.payload && typeof row.payload === "object" ? row.payload : {},
      amount: row.payload?.amount,
      searchable: [row.event_type, row.source_id, row.payload?.invoice_number, row.payload?.quote_number, row.payload?.payment_reference].filter(Boolean).join(" "),
    })
  );
}

async function loadRelationshipEvents(orgId, clientId, { from, to, before, includeNotes }) {
  let query = supabaseAdmin
    .from("client_relationship_events")
    .select(
      "id, org_id, client_id, event_type, actor_type, actor_id, source, document_id, document_type, note_id, metadata, occurred_at"
    )
    .eq("org_id", orgId)
    .eq("client_id", clientId);
  if (!includeNotes) {
    query = query.not("event_type", "in", "(note_added,note_updated,note_archived)");
  }
  query = applyTimeFilters(query, { from, to, before });
  const { data, error } = await query.order("occurred_at", { ascending: false }).limit(SOURCE_FETCH);
  if (error) {
    if (/schema cache|does not exist|client_relationship_events/i.test(error.message || "")) return [];
    throw error;
  }
  return (data || []).map((row) =>
    normalizeTimelineItem({
      id: `cre:${row.id}`,
      origin: "client_relationship_events",
      eventType: row.event_type,
      sourceKind: row.document_type || "client",
      documentType: row.document_type || null,
      documentId: row.document_id,
      clientId: row.client_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      source: row.source,
      occurredAt: row.occurred_at,
      noteId: row.note_id,
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
      searchable: [row.event_type, row.metadata?.preview, row.metadata?.field, row.metadata?.to, row.note_id].filter(Boolean).join(" "),
    })
  );
}

async function loadMessageLogItems(orgId, clientId, { from, to, before, channel }) {
  let query = supabaseAdmin
    .from("message_logs")
    .select("id, org_id, client_id, document_id, document_type, channel, recipient, sent_at, opened_at, clicked_at, created_at, tracking_token, viewed")
    .eq("org_id", orgId)
    .eq("client_id", clientId);
  if (channel) query = query.eq("channel", channel);
  if (from) query = query.gte("sent_at", from);
  if (to) query = query.lte("sent_at", to);
  if (before) query = query.lt("sent_at", before);
  const { data, error } = await query.order("sent_at", { ascending: false }).limit(SOURCE_FETCH);
  if (error) return [];
  return (data || []).flatMap(messageLogToTimelineItems);
}

async function loadPaymentFallbacks(orgId, clientId, invoices) {
  const [{ data: payments }, { data: intents }] = await Promise.all([
    supabaseAdmin
      .from("payments")
      .select("id, org_id, client_id, invoice_id, amount, status, paid_at, created_at, method, reference")
      .eq("org_id", orgId)
      .eq("client_id", clientId)
      .limit(500),
    supabaseAdmin
      .from("payment_intents")
      .select("id, org_id, client_id, document_id, source_kind, status, amount, provider, created_at, updated_at, external_id")
      .eq("org_id", orgId)
      .eq("client_id", clientId)
      .eq("source_kind", "document")
      .limit(500),
  ]);
  const invoiceNumbers = new Map((invoices || []).map((row) => [String(row.id), row.invoice_number]));
  return {
    payments: (payments || [])
      .map((row) => paymentRowToTimelineItem(row, invoiceNumbers.get(String(row.invoice_id)) || null))
      .filter(Boolean),
    intents: (intents || [])
      .map((row) => paymentIntentFallbackItem(row, invoiceNumbers.get(String(row.document_id)) || null))
      .filter(Boolean),
  };
}

function dedupeOverlappingSources(items) {
  const tokens = new Set();
  const paymentKeys = new Set();
  const intentKeys = new Set();
  for (const item of items) {
    if (item.origin === "document_events") {
      if (item.metadata?.tracking_token) tokens.add(String(item.metadata.tracking_token));
      if (item.metadata?.payment_id) paymentKeys.add(String(item.metadata.payment_id));
      if (item.paymentIntentId && item.eventType) {
        intentKeys.add(`${item.paymentIntentId}:${item.eventType}`);
      }
    }
  }
  return items.filter((item) => {
    if (item.origin === "message_logs") {
      const token = item.metadata?.tracking_token;
      if (token && tokens.has(String(token))) return false;
    }
    if (item.origin === "payments") {
      const pid = item.metadata?.payment_id || item.paymentId;
      if (pid && paymentKeys.has(String(pid))) return false;
      if (item.documentId && paymentKeys.size && items.some((other) => other.origin === "document_events" && other.eventType === "paid" && other.documentId === item.documentId && other.metadata?.payment_id)) {
        return false;
      }
      const alreadyPaid = items.some(
        (other) =>
          other.origin === "document_events" &&
          other.eventType === "paid" &&
          other.documentId === item.documentId &&
          Math.abs((Date.parse(other.occurredAt) || 0) - (Date.parse(item.occurredAt) || 0)) < 5 * 60 * 1000
      );
      if (alreadyPaid) return false;
    }
    if (item.origin === "payment_intents") {
      const key = `${item.paymentIntentId}:${item.eventType}`;
      if (intentKeys.has(key)) return false;
    }
    return true;
  });
}

export async function getClientRelationshipTimeline(orgId, clientId, membership, query = {}) {
  const client = await loadClientOrThrow(orgId, clientId);
  const includeNotes = canViewInternalNotes(membership);
  const category = normalizeTimelineCategory(query.category);
  const limit = clampLimit(query.limit);
  const search = String(query.q || query.search || "").trim();
  const from = query.from || query.from_date || null;
  const to = query.to || query.to_date || null;
  const before = query.before || null;
  const documentId = query.document_id || query.invoice_id || query.quote_id || null;
  const documentType = String(query.document_type || "").trim().toLowerCase() || null;
  const channel = String(query.channel || "").trim().toLowerCase() || null;

  const docs = await loadDocuments(orgId, clientId);
  const numbers = documentNumberMap(docs.invoices, docs.quotes);

  const [documentEvents, relationshipEvents, messageItems, paymentFallbacks] = await Promise.all([
    loadDocumentEvents(orgId, clientId, { from, to, before, documentId, documentType }),
    loadRelationshipEvents(orgId, clientId, { from, to, before, includeNotes }),
    category === CLIENT_TIMELINE_CATEGORY.COMMUNICATION || category === CLIENT_TIMELINE_CATEGORY.ALL
      ? loadMessageLogItems(orgId, clientId, { from, to, before, channel })
      : Promise.resolve([]),
    loadPaymentFallbacks(orgId, clientId, docs.invoices),
  ]);

  let merged = mergeTimelineItems([
    documentEvents,
    relationshipEvents,
    messageItems,
    paymentFallbacks.payments,
    paymentFallbacks.intents,
  ]).map((item) => withDocumentNumber(item, numbers));

  merged = dedupeOverlappingSources(merged);

  if (documentId) {
    merged = merged.filter((item) => String(item.documentId || "") === String(documentId));
  }
  if (documentType === "invoice" || documentType === "quote") {
    merged = merged.filter((item) => item.documentType === documentType || item.sourceKind === documentType);
  }
  if (channel) {
    merged = merged.filter((item) => !item.metadata?.channel || String(item.metadata.channel).toLowerCase() === channel);
  }
  merged = merged.filter((item) => eventMatchesCategory(item, category));
  if (search) {
    merged = merged.filter((item) => matchesTimelineSearch(item, search));
  }

  const pageItems = merged.slice(0, limit);
  const hasMore = merged.length > limit;
  const last = pageItems[pageItems.length - 1];
  const grouped = groupTimelineItems(pageItems);

  const summary = computeClientRelationshipSummary({
    invoices: docs.invoices,
    quotes: docs.quotes,
    payments: docs.payments,
    lastActivityAt: client.last_activity_at,
  });
  const attention = computeClientAttention({
    invoices: docs.invoices,
    quotes: docs.quotes,
    payments: docs.payments,
    events: merged,
  });
  const signals = computeClientEngagementSignals({
    invoices: docs.invoices,
    quotes: docs.quotes,
    payments: docs.payments,
    events: merged.concat(documentEvents),
  });

  return {
    client: { id: client.id, name: client.name, last_activity_at: client.last_activity_at },
    summary,
    attention,
    signals,
    events: grouped,
    page: {
      limit,
      hasMore,
      nextCursor: hasMore && last ? last.id : null,
      nextBefore: hasMore && last ? last.occurredAt : null,
    },
    permissions: {
      canViewNotes: includeNotes,
      canMutate: includeNotes,
    },
  };
}

export { documentPaymentEventTypeForStatus };
