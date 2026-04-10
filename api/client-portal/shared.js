/**
 * Shared client-portal logic for Vercel `/api/client-portal/*` and Express (server/src).
 * Data: Supabase via service role. Session: signed HMAC token (CLIENT_PORTAL_JWT_SECRET).
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const PORTAL_TTL_SEC = 7 * 24 * 60 * 60;

export function normalizePortalEmail(email) {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

export function getPortalSigningSecret() {
  const explicit = String(process.env.CLIENT_PORTAL_JWT_SECRET ?? "").trim();
  if (explicit) return explicit;
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
}

export function isPortalSigningReady() {
  return Boolean(getPortalSigningSecret());
}

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function signPortalToken(clientId, email) {
  const secret = getPortalSigningSecret();
  if (!secret) throw new Error("Missing CLIENT_PORTAL_JWT_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  const exp = Math.floor(Date.now() / 1000) + PORTAL_TTL_SEC;
  const payload = { sub: clientId, email: normalizePortalEmail(email), exp };
  const p = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const h = crypto.createHmac("sha256", secret).update(p).digest("base64url");
  return `${p}.${h}`;
}

export function verifyPortalToken(token) {
  const secret = getPortalSigningSecret();
  if (!secret || !token) return null;
  const [p, h] = String(token).split(".");
  if (!p || !h) return null;
  const expected = crypto.createHmac("sha256", secret).update(p).digest("base64url");
  if (expected !== h) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.sub || !payload.email) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearerTokenFromReq(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization;
  if (!raw || typeof raw !== "string") return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function mapInvoiceRow(row) {
  if (!row) return row;
  return {
    ...row,
    created_date: row.created_at ?? row.created_date,
    updated_date: row.updated_at ?? row.updated_date,
  };
}

function mapQuoteRow(row) {
  if (!row) return row;
  return {
    ...row,
    created_date: row.created_at ?? row.created_date,
    updated_date: row.updated_at ?? row.updated_date,
  };
}

function mapPaymentRow(row) {
  if (!row) return row;
  return {
    ...row,
    payment_date: row.payment_date ?? row.paid_at,
    payment_method: row.payment_method ?? row.method,
    reference_number: row.reference_number ?? row.reference,
    created_date: row.created_at ?? row.created_date,
    updated_date: row.updated_at ?? row.updated_date,
  };
}

export async function findClientsByEmail(supabase, email) {
  const normalized = normalizePortalEmail(email);
  if (!normalized) return { clients: [], error: "Email required" };
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, org_id, name, email, phone, address, contact_person, website, tax_id, notes, payment_terms, payment_terms_days, created_at, updated_at"
    )
    .ilike("email", normalized);
  if (error) {
    return { clients: [], error: error.message || "Lookup failed" };
  }
  return { clients: data || [], error: null };
}

export function clientRowForResponse(row) {
  if (!row) return null;
  return {
    ...row,
    created_date: row.created_at,
    updated_date: row.updated_at,
  };
}

export async function loadPortalDocuments(supabase, clientId, expectedEmail) {
  const { data: client, error: cErr } = await supabase
    .from("clients")
    .select(
      "id, org_id, name, email, phone, address, contact_person, website, tax_id, notes, payment_terms, payment_terms_days, created_at, updated_at"
    )
    .eq("id", clientId)
    .maybeSingle();

  if (cErr || !client) {
    return { error: "Client not found", client: null, invoices: [], quotes: [] };
  }
  if (normalizePortalEmail(client.email) !== normalizePortalEmail(expectedEmail)) {
    return { error: "Session mismatch", client: null, invoices: [], quotes: [] };
  }

  const orgId = client.org_id;

  const { data: invRows, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, org_id, client_id, company_id, invoice_number, status, project_title, project_description, invoice_date, delivery_date, delivery_address, subtotal, tax_rate, tax_amount, total_amount, currency, notes, terms_conditions, created_by, user_id, created_at, updated_at, banking_detail_id, upfront_payment, milestone_payment, final_payment, milestone_date, final_date, pdf_url, recurring_invoice_id, public_share_token, sent_to_email, owner_company_name, owner_company_address, owner_logo_url, owner_email, owner_currency, document_brand_primary, document_brand_secondary"
    )
    .eq("client_id", clientId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (invErr) {
    return { error: invErr.message || "Failed to load invoices", client, invoices: [], quotes: [] };
  }

  const invoiceIds = (invRows || []).map((r) => r.id);
  let itemsByInvoice = {};
  if (invoiceIds.length > 0) {
    const { data: itemRows } = await supabase
      .from("invoice_items")
      .select("id, invoice_id, service_name, description, quantity, unit_price, total_price")
      .in("invoice_id", invoiceIds);
    itemsByInvoice = {};
    for (const row of itemRows || []) {
      if (!itemsByInvoice[row.invoice_id]) itemsByInvoice[row.invoice_id] = [];
      itemsByInvoice[row.invoice_id].push({
        service_name: row.service_name,
        description: row.description || "",
        quantity: Number(row.quantity ?? 1),
        unit_price: Number(row.unit_price ?? 0),
        total_price: Number(row.total_price ?? 0),
      });
    }
  }

  let paymentsByInvoice = {};
  if (invoiceIds.length > 0) {
    const { data: payRows } = await supabase
      .from("payments")
      .select("id, org_id, invoice_id, client_id, amount, status, paid_at, method, reference, notes, created_at, updated_at")
      .in("invoice_id", invoiceIds)
      .eq("org_id", orgId);
    for (const row of payRows || []) {
      if (!paymentsByInvoice[row.invoice_id]) paymentsByInvoice[row.invoice_id] = [];
      paymentsByInvoice[row.invoice_id].push(mapPaymentRow(row));
    }
  }

  const invoices = (invRows || []).map((inv) => {
    const base = mapInvoiceRow(inv);
    return {
      ...base,
      items: itemsByInvoice[inv.id] || [],
      payments: paymentsByInvoice[inv.id] || [],
    };
  });

  const { data: quoteRows, error: qErr } = await supabase
    .from("quotes")
    .select(
      "id, org_id, client_id, quote_number, status, project_title, project_description, valid_until, subtotal, tax_rate, tax_amount, total_amount, currency, notes, terms_conditions, created_by, user_id, created_at, updated_at, banking_detail_id, document_brand_primary, document_brand_secondary, public_share_token, owner_company_name, owner_company_address, owner_logo_url, owner_email, owner_currency"
    )
    .eq("client_id", clientId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (qErr) {
    return { error: qErr.message || "Failed to load quotes", client, invoices, quotes: [] };
  }

  const quoteIds = (quoteRows || []).map((r) => r.id);
  let itemsByQuote = {};
  if (quoteIds.length > 0) {
    const { data: qItems } = await supabase
      .from("quote_items")
      .select("id, quote_id, service_name, description, quantity, unit_price, total_price")
      .in("quote_id", quoteIds);
    for (const row of qItems || []) {
      if (!itemsByQuote[row.quote_id]) itemsByQuote[row.quote_id] = [];
      itemsByQuote[row.quote_id].push({
        service_name: row.service_name,
        description: row.description || "",
        quantity: Number(row.quantity ?? 1),
        unit_price: Number(row.unit_price ?? 0),
        total_price: Number(row.total_price ?? 0),
      });
    }
  }

  const quotes = (quoteRows || []).map((q) => ({
    ...mapQuoteRow(q),
    items: itemsByQuote[q.id] || [],
  }));

  return { error: null, client, invoices, quotes };
}

export async function listPortalMessages(supabase, orgId, clientId) {
  const { data, error } = await supabase
    .from("client_portal_messages")
    .select("id, org_id, client_id, sender_type, subject, content, attachments, is_read, created_at")
    .eq("org_id", orgId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    if (/relation|does not exist|schema cache/i.test(String(error.message || ""))) {
      return { messages: [], missingTable: true };
    }
    return { messages: [], error: error.message };
  }

  const messages = (data || []).map((m) => ({
    id: m.id,
    sender_type: m.sender_type,
    subject: m.subject,
    content: m.content,
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    is_read: m.is_read,
    created_date: m.created_at,
  }));

  return { messages, missingTable: false };
}

export async function markPortalMessagesRead(supabase, orgId, clientId, messageIds) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) return { ok: true };
  const { error } = await supabase
    .from("client_portal_messages")
    .update({ is_read: true })
    .eq("org_id", orgId)
    .eq("client_id", clientId)
    .eq("sender_type", "business")
    .in("id", messageIds);
  if (error && /relation|does not exist/i.test(String(error.message || ""))) {
    return { ok: true, skipped: true };
  }
  return { ok: !error, error: error?.message };
}

export async function recordPortalPayment(supabase, orgId, clientId, invoiceId, amountRaw, method, notes) {
  const amountNum = Number(amountRaw);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return { ok: false, error: "Invalid amount" };
  }

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id, client_id, org_id, total_amount, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr || !inv || inv.org_id !== orgId || inv.client_id !== clientId) {
    return { ok: false, error: "Invoice not found" };
  }

  const { error: payErr } = await supabase.from("payments").insert({
    org_id: orgId,
    invoice_id: invoiceId,
    client_id: clientId,
    amount: amountNum,
    status: "completed",
    paid_at: new Date().toISOString(),
    method: method || "portal",
    reference: notes ? String(notes).slice(0, 500) : null,
  });

  if (payErr) {
    return { ok: false, error: payErr.message || "Payment failed" };
  }

  const { data: pays } = await supabase
    .from("payments")
    .select("amount")
    .eq("invoice_id", invoiceId)
    .eq("org_id", orgId);

  const totalPaid = (pays || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const total = Number(inv.total_amount || 0);
  let newStatus = inv.status;
  if (total > 0 && totalPaid >= total) {
    newStatus = "paid";
  } else if (totalPaid > 0) {
    newStatus = "partial_paid";
  }

  await supabase
    .from("invoices")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("org_id", orgId);

  return { ok: true };
}

const PORTAL_CLIENT_PATCH_KEYS = new Set(["phone", "address", "contact_person", "website"]);

export async function patchPortalClient(supabase, orgId, clientId, body) {
  const patch = {};
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid body" };
  }
  for (const key of PORTAL_CLIENT_PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const v = body[key];
      patch[key] = v == null ? null : String(v).slice(0, 2000);
    }
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No allowed fields to update" };
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("clients")
    .update(patch)
    .eq("id", clientId)
    .eq("org_id", orgId)
    .select(
      "id, org_id, name, email, phone, address, contact_person, website, tax_id, notes, payment_terms, payment_terms_days, created_at, updated_at"
    )
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message || "Update failed" };
  }
  return { ok: true, client: data };
}

export async function insertPortalMessage(supabase, orgId, clientId, { content, attachments = [] }) {
  const { data, error } = await supabase
    .from("client_portal_messages")
    .insert({
      org_id: orgId,
      client_id: clientId,
      sender_type: "client",
      content: String(content || "").slice(0, 20000),
      attachments: Array.isArray(attachments) ? attachments : [],
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (/relation|does not exist/i.test(String(error.message || ""))) {
      return { ok: false, error: "Messaging is not enabled for this workspace yet." };
    }
    return { ok: false, error: error.message || "Send failed" };
  }
  return { ok: true, id: data?.id };
}
