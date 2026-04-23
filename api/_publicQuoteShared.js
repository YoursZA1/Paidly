/**
 * Public quote by share token.
 * Token-only access; no direct quote-id access on public routes.
 */
import {
  getSupabaseAdmin,
  isValidShareTokenUuid,
} from "./_publicInvoiceShared.js";

function mapQuoteItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((item) => ({
    description: item?.description || "",
    quantity: Number(item?.quantity ?? 0) || 0,
    rate: Number(item?.rate ?? 0) || 0,
  }));
}

async function loadOwnerProfile(supabase, ownerId) {
  if (!ownerId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email, phone, company_name")
    .eq("id", ownerId)
    .maybeSingle();
  if (!data) return null;
  return {
    name: data.full_name || data.company_name || "Paidly",
    email: data.email || "",
    phone: data.phone || "",
    company_name: data.company_name || "",
  };
}

async function loadClient(supabase, clientId) {
  if (!clientId) return null;
  const { data } = await supabase
    .from("clients")
    .select("name, email, address, city, state, zip")
    .eq("id", clientId)
    .maybeSingle();
  return data || null;
}

export async function handlePublicQuoteGet(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
        "id, quote_number, created_date, due_date, status, subtotal, tax_rate, tax_amount, discount_amount, total, currency, notes, terms, items, client_id, created_by"
      )
      .eq("public_share_token", shareToken)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: "Failed to load quote" });
    }
    if (!quoteRow) {
      return res.status(404).json({ error: "Quote not found" });
    }

    const [client, owner] = await Promise.all([
      loadClient(supabase, quoteRow.client_id),
      loadOwnerProfile(supabase, quoteRow.created_by),
    ]);

    return res.status(200).json({
      quote: {
        ...quoteRow,
        items: mapQuoteItems(quoteRow.items),
      },
      client,
      owner,
    });
  } catch (e) {
    console.error("[public-quote]", e);
    return res.status(500).json({ error: e?.message || "Failed" });
  }
}
