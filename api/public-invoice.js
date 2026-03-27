/**
 * Vercel serverless: GET /api/public-invoice?token=<public_share_token>
 * Loads invoice + line items + client + banking for anonymous public /view/:token pages.
 * Uses service role — token must match invoices.public_share_token (UUID).
 */
import { createClient } from "@supabase/supabase-js";

function isValidUuid(t) {
  return (
    typeof t === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t.trim())
  );
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const raw = req.query?.token;
  const shareToken = typeof raw === "string" ? raw.trim() : "";
  if (!shareToken || !isValidUuid(shareToken)) {
    return res.status(400).json({ error: "Invalid token" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured" });
  }

  try {
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("public_share_token", shareToken)
      .maybeSingle();

    if (invErr) {
      console.warn("[public-invoice]", invErr.message);
      return res.status(500).json({ error: "Failed to load invoice" });
    }
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
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

    return res.status(200).json({
      invoice: out,
      client,
      bankingDetail,
    });
  } catch (e) {
    console.error("[public-invoice]", e);
    return res.status(500).json({ error: e?.message || "Failed" });
  }
}
