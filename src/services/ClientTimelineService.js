import { createPageUrl } from "@/utils";
import { createViewDocumentUrl } from "@/utils";

/**
 * @typedef {{ id: string, kind: 'invoice' | 'quote' | 'payment', label: string, sub?: string, at: string, href: string }} ClientTimelineEvent
 */

function pickTs(row, ...keys) {
  for (const k of keys) {
    const v = row?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return new Date(0).toISOString();
}

/**
 * Merge invoices, quotes, and payments for one client into a single descending timeline.
 * Spike: uses row timestamps already on entities; future: document_sends / message_logs.
 *
 * @param {{
 *   invoices?: object[],
 *   quotes?: object[],
 *   payments?: object[],
 *   currency?: string,
 * }} input
 * @returns {ClientTimelineEvent[]}
 */
export function buildClientTimelineEvents({ invoices = [], quotes = [], payments = [], currency = "ZAR" }) {
  const cur = (currency || "ZAR").trim() || "ZAR";
  const money = (n) => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(Number(n) || 0);
    } catch {
      return `${cur} ${(Number(n) || 0).toFixed(2)}`;
    }
  };
  /** @type {ClientTimelineEvent[]} */
  const out = [];

  for (const inv of invoices) {
    if (!inv?.id) continue;
    const num = inv.invoice_number || String(inv.id).slice(0, 8);
    const st = String(inv.status || "draft").replace(/_/g, " ");
    out.push({
      id: `inv-${inv.id}`,
      kind: "invoice",
      label: `Invoice #${num} · ${st}`,
      sub: inv.project_title || undefined,
      at: pickTs(inv, "updated_at", "updated_date", "created_at", "created_date"),
      href: createViewDocumentUrl("invoice", inv.id),
    });
  }

  for (const q of quotes) {
    if (!q?.id) continue;
    const num = q.quote_number || String(q.id).slice(0, 8);
    const st = String(q.status || "draft").replace(/_/g, " ");
    out.push({
      id: `quo-${q.id}`,
      kind: "quote",
      label: `Quote #${num} · ${st}`,
      sub: q.project_title || undefined,
      at: pickTs(q, "updated_at", "updated_date", "sent_date", "created_at", "created_date"),
      href: createViewDocumentUrl("quote", q.id),
    });
  }

  for (const p of payments) {
    if (!p?.id) continue;
    const amt = Number(p.amount ?? 0);
    const invId = p.invoice_id;
    const href =
      invId && String(invId).trim()
        ? `${createPageUrl("ViewInvoice")}?id=${encodeURIComponent(invId)}`
        : createPageUrl("Invoices");
    out.push({
      id: `pay-${p.id}`,
      kind: "payment",
      label: `Payment received · ${money(amt)}`,
      sub: p.reference || p.method || undefined,
      at: pickTs(p, "paid_at", "created_at", "created_date"),
      href,
    });
  }

  out.sort((a, b) => {
    const ta = Date.parse(a.at) || 0;
    const tb = Date.parse(b.at) || 0;
    return tb - ta;
  });

  return out;
}
