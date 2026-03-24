import { effectiveInvoiceTermsForDisplay } from "@/constants/invoiceTerms";

/** Profile fields for quote DocumentPreview (logo / company) — mirrors invoice preview resolution. */
export function profileForQuotePreview(quoteData, user) {
  if (!quoteData && !user) return {};
  return {
    ...(user || {}),
    logo_url:
      user?.logo_url ||
      user?.company_logo_url ||
      quoteData?.owner_logo_url ||
      quoteData?.company?.logo_url ||
      quoteData?.company?.company_logo_url ||
      null,
    company_name: quoteData?.owner_company_name || user?.company_name || "",
    company_address: quoteData?.owner_company_address || user?.company_address || "",
    email: quoteData?.owner_email || user?.email || "",
    phone: user?.phone || "",
    company_website: user?.company_website || user?.website || "",
    currency: quoteData?.currency || user?.currency || "ZAR",
  };
}

/**
 * Maps a Paidly invoice or quote (+ client + profile) into the shape expected by DocumentPreview.
 */
export function recordToStyledPreviewDoc(record, client, docType, profile) {
  if (!record) return null;
  const items = Array.isArray(record.items) ? record.items : [];
  let discount = 0;
  const line_items = [];

  for (const it of items) {
    const name = (it.service_name || it.name || "").trim();
    const totalPrice = Number(it.total_price ?? it.total ?? 0);
    const isDiscount = /^discount$/i.test(name) && totalPrice < 0;
    if (isDiscount) {
      discount += Math.abs(totalPrice);
      continue;
    }
    const desc = [it.service_name || it.name, it.description].filter(Boolean).join("\n");
    line_items.push({
      description: desc || "Item",
      quantity: Number(it.quantity ?? it.qty ?? 1) || 1,
      unit_price: Number(it.unit_price ?? it.rate ?? it.price ?? 0) || 0,
      total:
        Number(it.total_price ?? it.total) ||
        (Number(it.quantity ?? 1) || 1) * (Number(it.unit_price ?? 0) || 0),
    });
  }

  const isQuote = docType === "quote";
  const issueRaw = isQuote
    ? record.created_at || record.created_date
    : record.invoice_date || record.created_at;
  const issueDate = issueRaw
    ? String(issueRaw).split("T")[0]
    : new Date().toISOString().split("T")[0];

  const dueDate = isQuote
    ? record.valid_until
      ? String(record.valid_until).split("T")[0]
      : ""
    : record.delivery_date
      ? String(record.delivery_date).split("T")[0]
      : "";

  return {
    number: isQuote ? record.quote_number : record.invoice_number,
    status: record.status,
    client_id: record.client_id,
    client_name: client?.name || "",
    client_email: client?.email || "",
    client_address: client?.address || "",
    issue_date: issueDate,
    due_date: dueDate,
    line_items:
      line_items.length > 0 ? line_items : [{ description: "", quantity: 1, unit_price: 0, total: 0 }],
    tax_rate: Number(record.tax_rate) || 0,
    discount,
    currency: record.currency || profile?.currency || "ZAR",
    notes: record.notes || "",
    terms_conditions: isQuote
      ? record.terms_conditions || ""
      : effectiveInvoiceTermsForDisplay(record.terms_conditions),
    company_name: record.owner_company_name || profile?.company_name || "",
    company_email: record.owner_email || profile?.email || "",
    company_phone: profile?.phone || "",
    company_website: profile?.company_website || profile?.website || "",
    company_address: record.owner_company_address || profile?.company_address || "",
    /** Live profile logo first (Settings), then snapshot on the record (invoices). */
    owner_logo_url:
      profile?.logo_url || profile?.company_logo_url || record.owner_logo_url || null,
    subtotal: Number(record.subtotal) || 0,
    tax_amount: Number(record.tax_amount) || 0,
    total: Number(record.total_amount) || 0,
  };
}
