/**
 * Public hub document by share token (contracts and the other Documents Hub types).
 * Token-only access. Commercial invoices and quotes keep their own public routes.
 */
import { getSupabaseAdmin, isValidShareTokenUuid } from "./_publicInvoiceShared.js";

const CLIENT_COLUMNS = "id, name, email, phone, address, contact_person, vat_number";

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
  return res.status(200).json({
    document: publicDocument(opened, items),
    client,
    owner,
  });
}
