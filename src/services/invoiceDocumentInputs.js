import { supabase } from "@/lib/supabaseClient";
import { Invoice, Client, BankingDetail } from "@/api/entities";

function filledText(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function firstNonEmptyList(...lists) {
  for (const list of lists) {
    if (Array.isArray(list) && list.length > 0) return list;
  }
  return [];
}

async function loadInvoiceItems(invoiceId) {
  const { data, error } = await supabase
    .from("invoice_items")
    .select("id, invoice_id, service_name, description, quantity, unit_price, total_price")
    .eq("invoice_id", invoiceId);
  if (error || !Array.isArray(data)) return [];
  return data;
}

/**
 * Fill bill-to fields from the saved client when the object in hand only has a name.
 */
export async function withSavedClient(client, record) {
  let resolved = client && typeof client === "object" ? { ...client } : {};
  const clientId = resolved.id || record?.client_id;
  if (!clientId) return resolved;
  try {
    const fullClient = await Client.get(clientId);
    if (!fullClient) return resolved;
    resolved = {
      ...fullClient,
      ...resolved,
      id: resolved.id || fullClient.id,
      name: filledText(resolved.name, fullClient.name),
      email: filledText(resolved.email, fullClient.email),
      phone: filledText(resolved.phone, resolved.mobile, fullClient.phone, fullClient.mobile),
      address: filledText(resolved.address, resolved.billing_address, fullClient.address, fullClient.billing_address),
      contact_person: filledText(
        resolved.contact_person,
        resolved.contact_name,
        fullClient.contact_person,
        fullClient.contact_name
      ),
      tax_id: filledText(resolved.tax_id, resolved.vat_number, fullClient.tax_id, fullClient.vat_number),
      vat_number: filledText(resolved.vat_number, resolved.tax_id, fullClient.vat_number, fullClient.tax_id),
    };
  } catch {
    /* Keep the client already in hand. */
  }
  return resolved;
}

/**
 * Invoice, client, and banking used by the preview, download, and email PDF.
 * Line items and bill-to fields are filled from the saved records when the
 * object in hand only has the invoice header.
 */
export async function loadInvoiceDocumentInputs({ invoice, client, user } = {}) {
  let record = invoice && typeof invoice === "object" ? { ...invoice } : {};

  if (record.id) {
    try {
      const full = await Invoice.get(record.id);
      if (full) {
        record = {
          ...record,
          ...full,
          items: firstNonEmptyList(full.items, record.items),
          public_share_token: record.public_share_token || full.public_share_token,
        };
      }
    } catch {
      /* Keep the invoice already in hand. */
    }
  }

  if (record.id && firstNonEmptyList(record.items).length === 0) {
    try {
      const rows = await loadInvoiceItems(record.id);
      if (rows.length > 0) record.items = rows;
    } catch {
      record.items = firstNonEmptyList(record.items);
    }
  }

  const resolved = await withSavedClient(client, record);

  record = {
    ...record,
    items: firstNonEmptyList(record.items),
    client_name: filledText(record.client_name, resolved.name),
    client_email: filledText(record.client_email, resolved.email),
    client_phone: filledText(record.client_phone, resolved.phone),
    client_address: filledText(record.client_address, resolved.address),
    contact_person: filledText(record.contact_person, resolved.contact_person),
    client_vat_number: filledText(record.client_vat_number, resolved.vat_number, resolved.tax_id),
  };

  let bankingDetail = null;
  const bankingId = String(record.banking_detail_id || "").trim();
  if (bankingId) {
    try {
      bankingDetail = await BankingDetail.get(bankingId);
    } catch {
      bankingDetail = null;
    }
  }

  return { invoice: record, client: resolved, bankingDetail, user: user || null };
}
