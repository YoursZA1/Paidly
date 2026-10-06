import {
  INVOICE_STATUS,
  invoiceStatusAfterClientOpen,
} from "../../../shared/commercial/documentStatuses.js";

/**
 * Client opened the public invoice or the email. Sent invoices become viewed.
 * Paid, overdue, and draft rows are left alone. Message logs for that invoice
 * are marked opened when they do not already have an open time.
 */
export async function markInvoiceOpened(supabase, invoiceRow) {
  if (!supabase || !invoiceRow?.id) return invoiceRow;
  const next = invoiceStatusAfterClientOpen(invoiceRow.status);
  let row = invoiceRow;
  if (next === INVOICE_STATUS.viewed) {
    const { data, error } = await supabase
      .from("invoices")
      .update({ status: INVOICE_STATUS.viewed, updated_at: new Date().toISOString() })
      .eq("id", invoiceRow.id)
      .select("status")
      .maybeSingle();
    if (error) {
      console.warn("[invoice] viewed status update failed", error.message || error);
    } else {
      row = { ...invoiceRow, status: data?.status || INVOICE_STATUS.viewed };
    }
  }

  const { error: logError } = await supabase
    .from("message_logs")
    .update({ viewed: true, opened_at: new Date().toISOString() })
    .eq("document_id", invoiceRow.id)
    .eq("document_type", "invoice")
    .is("opened_at", null);
  if (logError) {
    console.warn("[invoice] open log update failed", logError.message || logError);
  }

  return row;
}

export async function markInvoiceOpenedById(supabase, invoiceId) {
  if (!supabase || !invoiceId) return null;
  const { data, error } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("[invoice] open status lookup failed", error.message || error);
    return null;
  }
  return markInvoiceOpened(supabase, data);
}
