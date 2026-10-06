/**
 * Public quote by share token.
 * Token-only access; no direct quote-id access on public routes.
 */
import {
  getSupabaseAdmin,
  isValidShareTokenUuid,
} from "./_publicInvoiceShared.js";
import {
  QUOTE_STATUS,
  canTransitionQuoteStatus,
  normalizeQuoteStatus,
  sanitizeQuoteStatusWrite,
} from "../shared/commercial/documentStatuses.js";
import {
  DOCUMENT_EVENT_ACTOR,
  DOCUMENT_EVENT_SOURCE,
  DOCUMENT_EVENT_TYPE,
} from "../shared/documents/documentEvents.js";

function parseJsonBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body && typeof body === "object" ? body : {};
}

function mapQuoteItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((item) => {
    const unit = Number(item?.unit_price ?? item?.rate ?? 0) || 0;
    const quantity = Number(item?.quantity ?? 0) || 0;
    return {
      service_name: item?.service_name || "",
      description: item?.description || item?.service_name || "",
      quantity,
      unit_price: unit,
      rate: unit,
      total_price: Number(item?.total_price ?? quantity * unit) || 0,
    };
  });
}

async function loadOwnerProfile(supabase, ownerId) {
  if (!ownerId) return null;
  const rich =
    "full_name, email, phone, company_name, company_address, company_website, logo_url, document_brand_primary, document_brand_secondary, currency";
  let { data, error } = await supabase.from("profiles").select(rich).eq("id", ownerId).maybeSingle();
  if (error || !data) {
    const basic = await supabase
      .from("profiles")
      .select("full_name, email, phone, company_name")
      .eq("id", ownerId)
      .maybeSingle();
    data = basic.data;
  }
  if (!data) return null;
  return {
    name: data.full_name || data.company_name || "Paidly",
    email: data.email || "",
    phone: data.phone || "",
    company_name: data.company_name || "",
    company_address: data.company_address || "",
    company_website: data.company_website || "",
    website: data.company_website || "",
    logo_url: data.logo_url || "",
    document_brand_primary: data.document_brand_primary || null,
    document_brand_secondary: data.document_brand_secondary || null,
    currency: data.currency || "",
  };
}

async function loadBanking(supabase, bankingDetailId) {
  const id = String(bankingDetailId || "").trim();
  if (!id) return null;
  // Same columns the in-app banking record uses. branch_code is not a column;
  // asking for it makes PostgREST reject the row and the PDF loses payment details.
  const { data, error } = await supabase
    .from("banking_details")
    .select("bank_name, account_name, account_number, routing_number, swift_code, additional_info, payment_method")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[public-quote] banking lookup failed", error);
    return null;
  }
  return data || null;
}

async function loadClient(supabase, clientId) {
  if (!clientId) return null;
  // Same public client columns as the invoice share. city/state/zip are not columns;
  // a failed select returns no client and the PDF prints "Client".
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, email, phone, address, contact_person, website, tax_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error) {
    console.error("[public-quote] client lookup failed", error);
    return null;
  }
  if (!data) return null;
  return {
    ...data,
    vat_number: data.tax_id || "",
  };
}

function setPublicQuoteCors(res, methods) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function markQuoteViewed(supabase, quoteRow) {
  if (!canTransitionQuoteStatus(quoteRow.status, QUOTE_STATUS.viewed)) return quoteRow;
  const { data, error } = await supabase
    .from("quotes")
    .update({ status: QUOTE_STATUS.viewed, updated_at: new Date().toISOString() })
    .eq("id", quoteRow.id)
    .select("status")
    .maybeSingle();
  if (error) {
    console.warn("[public-quote] viewed status update failed", error.message || error);
    return quoteRow;
  }
  return { ...quoteRow, status: data?.status || QUOTE_STATUS.viewed };
}

export async function handlePublicQuoteGet(req, res) {
  setPublicQuoteCors(res, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const tokenRaw = req.query?.token;
  const shareToken = typeof tokenRaw === "string" ? tokenRaw.trim() : "";
  if (!shareToken || !isValidShareTokenUuid(shareToken)) {
    return res.status(400).json({ error: "Invalid token" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured" });
  }

  try {
    const { data: quoteRow, error } = await supabase
      .from("quotes")
      .select(
        "id, org_id, quote_number, created_at, valid_until, status, subtotal, tax_rate, tax_amount, discount_type, discount_value, discount_amount, total_amount, vat_mode, currency, notes, terms_conditions, project_title, client_id, created_by, banking_detail_id, document_brand_primary, document_brand_secondary, owner_company_name, owner_company_address, owner_logo_url, owner_email, owner_phone, owner_vat_number, owner_currency"
      )
      .eq("public_share_token", shareToken)
      .maybeSingle();

    if (error) {
      console.error("[public-quote] quote lookup failed", error);
      return res.status(500).json({ error: "Failed to load quote" });
    }
    if (!quoteRow) {
      return res.status(404).json({ error: "Quote not found" });
    }

    const { data: quoteItems, error: quoteItemsError } = await supabase
      .from("quote_items")
      .select("service_name, description, quantity, unit_price, total_price")
      .eq("quote_id", quoteRow.id)
      .order("id", { ascending: true });
    if (quoteItemsError) {
      console.error("[public-quote] quote items lookup failed", quoteItemsError);
      return res.status(500).json({ error: "Failed to load quote items" });
    }

    const [client, owner, banking] = await Promise.all([
      loadClient(supabase, quoteRow.client_id),
      loadOwnerProfile(supabase, quoteRow.created_by),
      loadBanking(supabase, quoteRow.banking_detail_id),
    ]);

    const viewedQuote = await markQuoteViewed(supabase, quoteRow);

    if (viewedQuote.org_id) {
      const { recordPublicDocumentOpened } = await import("../server/src/documents/documentEventService.js");
      await recordPublicDocumentOpened({
        orgId: viewedQuote.org_id,
        sourceKind: DOCUMENT_EVENT_SOURCE.QUOTE,
        sourceId: viewedQuote.id,
        clientId: viewedQuote.client_id || null,
        source: "quote_public_page",
      }, supabase);
    }

    return res.status(200).json({
      quote: {
        ...viewedQuote,
        created_date: quoteRow.created_at,
        due_date: quoteRow.valid_until,
        terms: quoteRow.terms_conditions || "",
        terms_conditions: quoteRow.terms_conditions || "",
        client_name: client?.name || "",
        client_email: client?.email || "",
        client_phone: client?.phone || "",
        client_address: client?.address || "",
        contact_person: client?.contact_person || "",
        client_vat_number: client?.tax_id || "",
        total: Number(quoteRow.total_amount ?? 0) || 0,
        discount_amount: 0,
        items: mapQuoteItems(quoteItems),
      },
      client,
      owner,
      banking,
    });
  } catch (e) {
    console.error("[public-quote]", e);
    return res.status(500).json({ error: e?.message || "Failed" });
  }
}

export async function handlePublicQuoteDecide(req, res) {
  setPublicQuoteCors(res, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseJsonBody(req);
  const shareToken = String(body?.token || body?.share_token || req.query?.token || "").trim();
  const actionRaw = String(body?.action || "").trim().toLowerCase();
  const nextStatus =
    actionRaw === "accept" || actionRaw === "accepted"
      ? QUOTE_STATUS.accepted
      : actionRaw === "reject" || actionRaw === "rejected" || actionRaw === "declined"
        ? QUOTE_STATUS.declined
        : null;

  if (!shareToken || !isValidShareTokenUuid(shareToken)) {
    return res.status(400).json({ error: "Invalid token" });
  }
  if (!nextStatus) {
    return res.status(422).json({ error: "action must be accept or reject" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured" });
  }

  try {
    const { data: quoteRow, error } = await supabase
      .from("quotes")
      .select("id, org_id, status, client_id, quote_number")
      .eq("public_share_token", shareToken)
      .maybeSingle();
    if (error) {
      console.error("[public-quote] decide lookup failed", error);
      return res.status(500).json({ error: "Failed to load quote" });
    }
    if (!quoteRow) {
      return res.status(404).json({ error: "Quote not found" });
    }

    const current = normalizeQuoteStatus(quoteRow.status);
    if (current === nextStatus) {
      return res.status(200).json({ ok: true, quote: quoteRow, duplicate: true });
    }

    let sanitized;
    try {
      sanitized = sanitizeQuoteStatusWrite(nextStatus, quoteRow.status);
    } catch (err) {
      return res.status(409).json({ error: err?.message || "Quote can no longer be accepted or rejected" });
    }

    const { data: updated, error: updateError } = await supabase
      .from("quotes")
      .update({ status: sanitized, updated_at: new Date().toISOString() })
      .eq("id", quoteRow.id)
      .select("id, org_id, status, client_id, quote_number")
      .maybeSingle();
    if (updateError) {
      console.error("[public-quote] decide update failed", updateError);
      return res.status(500).json({ error: "Could not update quote" });
    }

    const { appendDocumentEventBestEffort } = await import("../server/src/documents/documentEventService.js");
    const clickAction = sanitized === QUOTE_STATUS.accepted ? "accept_quote" : "reject_quote";
    await appendDocumentEventBestEffort({
      orgId: quoteRow.org_id,
      sourceKind: DOCUMENT_EVENT_SOURCE.QUOTE,
      sourceId: quoteRow.id,
      documentType: "quote",
      eventType: DOCUMENT_EVENT_TYPE.clicked,
      clientId: quoteRow.client_id || null,
      actorType: DOCUMENT_EVENT_ACTOR.RECIPIENT,
      action: clickAction,
      channel: "quote_public_page",
      metadata: { action: clickAction, source: "quote_public_page" },
    }, supabase);
    await appendDocumentEventBestEffort({
      orgId: quoteRow.org_id,
      sourceKind: DOCUMENT_EVENT_SOURCE.QUOTE,
      sourceId: quoteRow.id,
      documentType: "quote",
      eventType: sanitized === QUOTE_STATUS.accepted ? DOCUMENT_EVENT_TYPE.accepted : DOCUMENT_EVENT_TYPE.rejected,
      clientId: quoteRow.client_id || null,
      actorType: DOCUMENT_EVENT_ACTOR.RECIPIENT,
      channel: "quote_public_page",
      metadata: { source: "quote_public_page", action: clickAction },
    }, supabase);

    return res.status(200).json({ ok: true, quote: updated || { ...quoteRow, status: sanitized } });
  } catch (e) {
    console.error("[public-quote] decide", e);
    return res.status(500).json({ error: e?.message || "Failed" });
  }
}
