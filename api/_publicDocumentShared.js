/**
 * Public hub document by share token (contracts and the other Documents Hub types).
 * Token-only access. Commercial invoices and quotes keep their own public routes.
 */
import { getSupabaseAdmin, isValidShareTokenUuid } from "./_publicInvoiceShared.js";

const CLIENT_COLUMNS = "id, name, email, phone, address, contact_person, vat_number";

const SIGNATURE_TYPES = new Set([
  "proposal",
  "contract",
  "service_agreement",
  "scope_of_work",
  "nda",
  "retainer_agreement",
  "employment_contract",
  "offer_letter",
  "sponsorship_proposal",
]);

const OPEN_FOR_SIGN = new Set(["sent", "viewed", "pending"]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

/** Whether the public portal should offer Sign, and whether signing is already finished. */
export function signingState(row, signatures = []) {
  const rows = Array.isArray(signatures) ? signatures : [];
  const pending = rows.filter((item) => item.status === "pending" || item.status === "viewed");
  const signed = rows.filter((item) => item.status === "signed");
  const complete =
    row?.status === "signed" ||
    row?.signature_status === "signed" ||
    row?.signature_status === "completed" ||
    (rows.length > 0 && pending.length === 0 && signed.length === rows.length);
  const signatureDoc =
    SIGNATURE_TYPES.has(row?.type) ||
    ["awaiting_signature", "partially_signed", "signed", "completed"].includes(row?.signature_status);
  const open =
    OPEN_FOR_SIGN.has(row?.status) ||
    row?.signature_status === "awaiting_signature" ||
    row?.signature_status === "partially_signed";
  return {
    required: signatureDoc,
    canSign: Boolean(signatureDoc && !complete && open),
    signed: Boolean(signatureDoc && complete),
    signedName: signed.map((item) => item.signer_name).filter(Boolean)[0] || "",
  };
}

/** Hub types whose sent status becomes viewed when the client opens the public link. */
const OPENS_AS_VIEWED = new Set([
  "proposal",
  "contract",
  "service_agreement",
  "scope_of_work",
  "nda",
  "retainer_agreement",
  "employment_contract",
  "offer_letter",
  "sponsorship_proposal",
  "proforma_invoice",
  "credit_note",
  "debit_note",
  "receipt",
  "event_budget",
]);

async function markHubDocumentOpened(supabase, row) {
  if (!row?.id || row.status !== "sent" || !OPENS_AS_VIEWED.has(row.type)) return row;
  const { error } = await supabase
    .from("documents")
    .update({ status: "viewed", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "sent");
  if (error) {
    console.warn("[document] viewed status update failed", error.message || error);
    return row;
  }
  const { error: eventError } = await supabase.from("document_events").insert({
    document_id: row.id,
    org_id: row.org_id,
    source_kind: "hub",
    source_id: row.id,
    actor_type: "recipient",
    event_type: "viewed",
    payload: { source: "public_portal" },
  });
  if (eventError) {
    console.warn("[document] viewed event skipped", eventError.message || eventError);
  }
  return { ...row, status: "viewed" };
}

function publicDocument(row, items) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    document_number: row.document_number || "",
    title: row.title || "",
    body: row.body || "",
    issue_date: row.issue_date || null,
    due_date: row.due_date || null,
    valid_until: row.valid_until || null,
    subtotal: row.subtotal,
    tax_rate: row.tax_rate,
    tax_amount: row.tax_amount,
    discount_amount: row.discount_amount,
    total_amount: row.total_amount,
    currency: row.currency || "ZAR",
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    document_brand_primary: row.document_brand_primary || null,
    document_brand_secondary: row.document_brand_secondary || null,
    client_name: row.client_name || "",
    client_email: row.client_email || "",
    client_phone: row.client_phone || "",
    client_address: row.client_address || "",
    contact_person: row.contact_person || "",
    signature_status: row.signature_status || null,
    created_at: row.created_at || null,
    document_items: Array.isArray(items) ? items : [],
  };
}

async function loadOwner(supabase, ownerId) {
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
    name: data.full_name || data.company_name || "",
    email: data.email || "",
    phone: data.phone || "",
    company_name: data.company_name || "",
    company_address: data.company_address || "",
    website: data.company_website || "",
    logo_url: data.logo_url || "",
    document_brand_primary: data.document_brand_primary || null,
    document_brand_secondary: data.document_brand_secondary || null,
    currency: data.currency || "",
  };
}

export async function handlePublicDocumentGet(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const token = String(req.query.token || "").trim();
  if (!isValidShareTokenUuid(token)) {
    return res.status(400).json({ error: "Invalid link" });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Document service is unavailable" });

  const { data: row, error } = await supabase
    .from("documents")
    .select("*")
    .eq("public_share_token", token)
    .maybeSingle();
  if (error || !row) return res.status(404).json({ error: "Document not found" });

  let itemsResult = await supabase
    .from("document_items")
    .select("id, description, quantity, unit_price, total_price, line_order, metadata")
    .eq("document_id", row.id)
    .order("line_order", { ascending: true });
  if (itemsResult.error) {
    itemsResult = await supabase
      .from("document_items")
      .select("id, description, quantity, unit_price, total_price, line_order")
      .eq("document_id", row.id)
      .order("line_order", { ascending: true });
  }
  const items = itemsResult.data;

  let client = null;
  if (row.client_id) {
    let clientResult = await supabase
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("id", row.client_id)
      .maybeSingle();
    if (clientResult.error) {
      clientResult = await supabase
        .from("clients")
        .select("id, name, email, phone")
        .eq("id", row.client_id)
        .maybeSingle();
    }
    client = clientResult.data || null;
  }

  const owner = await loadOwner(supabase, row.user_id || row.created_by);
  const opened = await markHubDocumentOpened(supabase, row);
  const signatures = await loadSignatures(supabase, opened.id);
  return res.status(200).json({
    document: publicDocument(opened, items),
    client,
    owner,
    signing: signingState(opened, signatures),
  });
}

async function loadSignatures(supabase, documentId) {
  const { data, error } = await supabase
    .from("document_signatures")
    .select("id, signer_name, signer_email, signing_order, status, signed_at")
    .eq("document_id", documentId)
    .order("signing_order", { ascending: true });
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

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

export async function handlePublicDocumentSign(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const body = parseJsonBody(req);
  const token = String(body.token || req.query.token || "").trim();
  const signerName = String(body.signerName || "").trim();
  const signerEmail = normalizeEmail(body.signerEmail);
  if (!isValidShareTokenUuid(token)) return res.status(400).json({ error: "Invalid link" });
  if (signerName.length < 2) return res.status(400).json({ error: "Type your name to sign." });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Document service is unavailable" });

  const { data: row, error } = await supabase
    .from("documents")
    .select("*")
    .eq("public_share_token", token)
    .maybeSingle();
  if (error || !row) return res.status(404).json({ error: "Document not found" });

  const signatures = await loadSignatures(supabase, row.id);
  const state = signingState(row, signatures);
  if (!state.canSign) {
    return res.status(409).json({ error: state.signed ? "This document is already signed." : "This document is not open for signing." });
  }

  const pending = signatures.filter((item) => item.status === "pending" || item.status === "viewed");
  const now = new Date().toISOString();
  let matched = null;
  if (pending.length > 0) {
    if (!signerEmail) return res.status(400).json({ error: "Enter the email this document was sent to." });
    matched = pending.find((item) => normalizeEmail(item.signer_email) === signerEmail) || null;
    if (!matched) return res.status(403).json({ error: "That email is not a signer on this document." });
    const { error: updateError } = await supabase
      .from("document_signatures")
      .update({ status: "signed", signer_name: signerName, signed_at: now, updated_at: now })
      .eq("id", matched.id);
    if (updateError) return res.status(500).json({ error: "Could not record the signature." });
  } else {
    const email = signerEmail || normalizeEmail(row.client_email);
    if (!email) return res.status(400).json({ error: "Enter the email this document was sent to." });
    const { error: insertError } = await supabase.from("document_signatures").insert({
      org_id: row.org_id,
      document_id: row.id,
      signer_name: signerName,
      signer_email: email,
      signing_order: 1,
      status: "signed",
      signed_at: now,
    });
    if (insertError) return res.status(500).json({ error: "Could not record the signature." });
  }

  const remaining = pending.filter((item) => !matched || item.id !== matched.id);
  const partial = remaining.length > 0;
  const patch = partial
    ? { signature_status: "partially_signed", updated_at: now }
    : { status: "signed", signature_status: "signed", updated_at: now };
  const statusWrite = await supabase.from("documents").update(patch).eq("id", row.id);
  if (statusWrite.error && !partial) {
    await supabase.from("documents").update({ status: "signed", updated_at: now }).eq("id", row.id);
  }

  const { error: eventError } = await supabase.from("document_events").insert({
    document_id: row.id,
    org_id: row.org_id,
    source_kind: "hub",
    source_id: row.id,
    actor_type: "recipient",
    event_type: partial ? "signature_viewed" : "signature_completed",
    payload: { signer_name: signerName, source: "public_portal" },
  });
  if (eventError) console.warn("[document] signature event skipped", eventError.message || eventError);

  return res.status(200).json({
    document: {
      status: partial ? row.status : "signed",
      signature_status: partial ? "partially_signed" : "signed",
    },
    signing: {
      required: true,
      canSign: partial,
      signed: !partial,
      signedName: signerName,
    },
  });
}
