/**
 * Public invoice by share token: full payload only after email verification when sent_to_email is set.
 * Viewer token: HMAC-signed payload (same secret strategy as client-portal).
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { getPortalSigningSecret } from "./client-portal/shared.js";

const VIEWER_TTL_SEC = 7 * 24 * 60 * 60;
const VIEWER_TYP = "inv_pub_v1";

export function isValidShareTokenUuid(t) {
  return (
    typeof t === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t.trim())
  );
}

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function normalizeEmail(e) {
  return String(e ?? "")
    .trim()
    .toLowerCase();
}

export function maskEmail(email) {
  const s = normalizeEmail(email);
  const at = s.indexOf("@");
  if (at < 1) return "***";
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}

function signPayload(payloadObj) {
  const secret = getPortalSigningSecret();
  if (!secret) throw new Error("Signing secret not configured");
  const p = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64url");
  const h = crypto.createHmac("sha256", secret).update(p).digest("base64url");
  return `${p}.${h}`;
}

export function signPublicInvoiceViewerToken(shareToken, emailNorm) {
  const exp = Math.floor(Date.now() / 1000) + VIEWER_TTL_SEC;
  return signPayload({
    typ: VIEWER_TYP,
    st: String(shareToken).trim(),
    em: emailNorm,
    exp,
  });
}

export function verifyPublicInvoiceViewerToken(token) {
  try {
    const secret = getPortalSigningSecret();
    if (!secret || !token) return null;
    const [p, h] = String(token).split(".");
    if (!p || !h) return null;
    const expected = crypto.createHmac("sha256", secret).update(p).digest("base64url");
    if (expected !== h) return null;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (payload.typ !== VIEWER_TYP || !payload.st || !payload.em) return null;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { shareToken: payload.st, email: normalizeEmail(payload.em) };
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

function mapInvoiceItems(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    id: row.id,
    invoice_id: row.invoice_id,
    service_name: row.service_name,
    description: row.description || "",
    quantity: Number(row.quantity ?? 1),
    unit_price: Number(row.unit_price ?? 0),
    total_price: Number(row.total_price ?? 0),
    qty: Number(row.quantity ?? 1),
  }));
}

/**
 * @returns {Promise<{ invoice: object, client: object|null, bankingDetail: object|null }|{ error: string, status?: number }>}
 */
export async function loadPublicInvoiceBundle(supabase, shareToken) {
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("public_share_token", shareToken)
    .maybeSingle();

  if (invErr) {
    return { error: "Failed to load invoice", status: 500 };
  }
  if (!invoice) {
    return { error: "Invoice not found", status: 404 };
  }

  const { data: itemRows } = await supabase
    .from("invoice_items")
    .select("id, invoice_id, service_name, description, quantity, unit_price, total_price")
    .eq("invoice_id", invoice.id);

  const items = mapInvoiceItems(itemRows);

  const out = {
    ...invoice,
    items,
    created_date: invoice.created_at,
    updated_date: invoice.updated_at,
  };

  if (invoice.company_id) {
    const { data: comp } = await supabase
      .from("companies")
      .select("id, name, logo_url")
      .eq("id", invoice.company_id)
      .maybeSingle();
    if (comp) out.company = { id: comp.id, name: comp.name, logo_url: comp.logo_url };
  }

  let client = null;
  if (invoice.client_id) {
    const { data: c } = await supabase
      .from("clients")
      .select(
        "id, org_id, name, email, phone, address, contact_person, website, tax_id, notes, payment_terms, payment_terms_days, created_at, updated_at"
      )
      .eq("id", invoice.client_id)
      .maybeSingle();
    client = c;
  }

  let bankingDetail = null;
  if (invoice.banking_detail_id) {
    const { data: b } = await supabase
      .from("banking_details")
      .select("*")
      .eq("id", invoice.banking_detail_id)
      .maybeSingle();
    bankingDetail = b;
  }

  return { invoice: out, client, bankingDetail };
}

function buildTeaserInvoice(invoiceRow) {
  return {
    id: invoiceRow.id,
    invoice_number: invoiceRow.invoice_number,
    project_title: invoiceRow.project_title,
    total_amount: invoiceRow.total_amount,
    currency: invoiceRow.currency,
    owner_currency: invoiceRow.owner_currency,
    status: invoiceRow.status,
    items: [],
    created_date: invoiceRow.created_at,
    updated_date: invoiceRow.updated_at,
  };
}

export async function handlePublicInvoiceGet(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const raw = req.query?.token;
  const shareToken = typeof raw === "string" ? raw.trim() : "";
  if (!shareToken || !isValidShareTokenUuid(shareToken)) {
    return res.status(400).json({ error: "Invalid token" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured" });
  }

  try {
    const bundle = await loadPublicInvoiceBundle(supabase, shareToken);
    if (bundle.error) {
      return res.status(bundle.status || 500).json({ error: bundle.error });
    }

    const { invoice, client, bankingDetail } = bundle;
    const sentTo = invoice.sent_to_email ? normalizeEmail(invoice.sent_to_email) : "";

    if (!sentTo) {
      return res.status(200).json({
        requiresEmailVerification: false,
        invoice,
        client,
        bankingDetail,
      });
    }

    const viewer = verifyPublicInvoiceViewerToken(bearerTokenFromReq(req));
    const okViewer =
      viewer &&
      viewer.shareToken.toLowerCase() === shareToken.toLowerCase() &&
      viewer.email === sentTo;

    if (okViewer) {
      return res.status(200).json({
        requiresEmailVerification: false,
        invoice,
        client,
        bankingDetail,
      });
    }

    return res.status(200).json({
      requiresEmailVerification: true,
      sentToEmailHint: maskEmail(invoice.sent_to_email),
      invoice: buildTeaserInvoice(invoice),
      client: null,
      bankingDetail: null,
    });
  } catch (e) {
    console.error("[public-invoice]", e);
    return res.status(500).json({ error: e?.message || "Failed" });
  }
}

function parseJsonBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body;
}

export async function handlePublicInvoiceVerify(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!getPortalSigningSecret()) {
    return res.status(503).json({ error: "Viewer signing not configured" });
  }

  const body = parseJsonBody(req);
  const shareToken = typeof body?.token === "string" ? body.token.trim() : "";
  const email = normalizeEmail(body?.email);

  if (!shareToken || !isValidShareTokenUuid(shareToken) || !email) {
    return res.status(400).json({ error: "Invalid token or email" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured" });
  }

  try {
    const bundle = await loadPublicInvoiceBundle(supabase, shareToken);
    if (bundle.error) {
      return res.status(bundle.status === 404 ? 404 : 400).json({ error: bundle.error });
    }

    const sentTo = bundle.invoice.sent_to_email ? normalizeEmail(bundle.invoice.sent_to_email) : "";
    if (!sentTo) {
      return res.status(400).json({ error: "This invoice does not require email verification" });
    }
    if (email !== sentTo) {
      return res.status(403).json({ error: "Email does not match our records" });
    }

    const viewerToken = signPublicInvoiceViewerToken(shareToken, email);
    return res.status(200).json({ viewerToken, expiresInSeconds: VIEWER_TTL_SEC });
  } catch (e) {
    console.error("[public-invoice/verify]", e);
    return res.status(500).json({ error: e?.message || "Failed" });
  }
}
