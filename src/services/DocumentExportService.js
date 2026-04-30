import { supabase } from "@/lib/supabaseClient";
import { invoicesToCsv } from "@/utils/invoiceCsvMapping";
import { quotesToCsv } from "@/utils/quoteCsvMapping";
import { fetchInvoiceItemsByInvoiceIds } from "@/services/InvoiceListService";

function downloadCsv(csvContent, filename) {
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function fetchQuoteItemsByQuoteIds(quoteIds) {
  if (!Array.isArray(quoteIds) || quoteIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("quote_items")
    .select("id, quote_id, service_name, description, quantity, unit_price, total_price")
    .in("quote_id", quoteIds);
  if (error) throw error;

  const itemsByQuoteId = new Map();
  for (const row of data ?? []) {
    if (!itemsByQuoteId.has(row.quote_id)) itemsByQuoteId.set(row.quote_id, []);
    itemsByQuoteId.get(row.quote_id).push({
      service_name: row.service_name,
      description: row.description || "",
      quantity: Number(row.quantity ?? 1),
      unit_price: Number(row.unit_price ?? 0),
      total_price: Number(row.total_price ?? 0),
    });
  }

  return itemsByQuoteId;
}

export async function exportInvoicesCsvWithItems(invoices, paymentsMap = new Map()) {
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const itemsByInvoiceId = await fetchInvoiceItemsByInvoiceIds(invoiceIds);
  const invoicesWithItems = invoices.map((invoice) => ({
    ...invoice,
    items: itemsByInvoiceId.get(invoice.id) || [],
  }));

  const csvContent = invoicesToCsv(invoicesWithItems, paymentsMap);
  const filename = `Invoice_export_${Date.now()}.csv`;
  downloadCsv(csvContent, filename);

  return { count: invoices.length, filename };
}

export async function exportQuotesCsvWithItems(quotes) {
  const quoteIds = quotes.map((quote) => quote.id);
  const itemsByQuoteId = await fetchQuoteItemsByQuoteIds(quoteIds);
  const quotesWithItems = quotes.map((quote) => ({
    ...quote,
    items: itemsByQuoteId.get(quote.id) || [],
  }));

  const csvContent = quotesToCsv(quotesWithItems);
  const filename = `Quote_export_${Date.now()}.csv`;
  downloadCsv(csvContent, filename);

  return { count: quotes.length, filename };
}

