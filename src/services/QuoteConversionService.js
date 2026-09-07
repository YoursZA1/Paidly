import { supabase } from "@/lib/supabaseClient";
import { createViewDocumentUrl } from "@/utils";
import {
  buildInvoiceFromQuote,
  canConvertQuote,
  isQuoteConverted,
  isQuoteImmutable,
  normalizeQuoteStatus,
} from "@shared/commercial/quoteInvoiceConversion.js";

function asResult(payload = {}) {
  return {
    already_converted: Boolean(payload.already_converted),
    invoice_id: payload.invoice_id || payload.invoice?.id || null,
    invoice_number: payload.invoice_number || payload.invoice?.invoice_number || null,
    invoice: payload.invoice || null,
  };
}

export async function findInvoiceBySourceQuoteId(quoteId) {
  const id = String(quoteId || "").trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, source_quote_id, status, total_amount")
    .eq("source_quote_id", id)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

export async function findQuoteByIdForInvoice(quoteId) {
  const id = String(quoteId || "").trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("quotes")
    .select("id, quote_number, status, converted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

/**
 * Convert a specialised quote into a specialised invoice.
 * Idempotent: a second call returns the existing invoice.
 */
export async function convertQuoteToInvoice(quote, overrides = {}) {
  const quoteId = typeof quote === "string" ? quote : quote?.id;
  if (!quoteId) {
    throw new Error("Quote is required");
  }

  const existing = await findInvoiceBySourceQuoteId(quoteId);
  if (existing?.id) {
    return asResult({ already_converted: true, invoice: existing, invoice_id: existing.id, invoice_number: existing.invoice_number });
  }

  const quoteRow = typeof quote === "object" && quote ? quote : { id: quoteId };
  if (typeof quote === "object" && !canConvertQuote(quoteRow, existing)) {
    if (isQuoteConverted(quoteRow, existing)) {
      const again = await findInvoiceBySourceQuoteId(quoteId);
      if (again?.id) {
        return asResult({ already_converted: true, invoice: again, invoice_id: again.id, invoice_number: again.invoice_number });
      }
    }
    throw new Error("This quote cannot be converted");
  }

  const { data, error } = await supabase.rpc("convert_quote_to_invoice", {
    p_quote_id: quoteId,
    p_overrides: overrides && typeof overrides === "object" ? overrides : {},
  });

  if (error) {
    const message = error.message || "Could not convert quote";
    if (/already converted|unique|source_quote_id/i.test(message)) {
      const raced = await findInvoiceBySourceQuoteId(quoteId);
      if (raced?.id) {
        return asResult({ already_converted: true, invoice: raced, invoice_id: raced.id, invoice_number: raced.invoice_number });
      }
    }
    throw new Error(message);
  }

  return asResult(data || {});
}

export function invoiceUrlFromConversion(result) {
  if (!result?.invoice_id) return null;
  return createViewDocumentUrl("invoice", result.invoice_id);
}

export {
  buildInvoiceFromQuote,
  canConvertQuote,
  isQuoteConverted,
  isQuoteImmutable,
  normalizeQuoteStatus,
};
