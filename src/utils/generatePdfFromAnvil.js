import { supabase } from "@/lib/supabaseClient";
import { getBackendBaseUrl } from "@/api/backendClient";

/** Shared Anvil/browser invoice layout (`public/invoice-anvil/invoice.css`). */
export function getInvoiceAnvilCssUrl() {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}invoice-anvil/invoice.css`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtCurrency(amount, currency = "ZAR") {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: String(currency || "ZAR"),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

function safeDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function buildDocumentHtmlFromData(doc, docType) {
  const isQuote = String(docType || doc?.docType || doc?.type || "invoice").toLowerCase() === "quote";
  const title = isQuote ? "Quote" : "Invoice";
  const number = doc?.number || doc?.invoice_number || doc?.quote_number || "Draft";
  const issueDate = safeDate(doc?.issue_date || doc?.invoice_date || doc?.created_at);
  const dueDate = safeDate(doc?.due_date || doc?.delivery_date || doc?.valid_until);
  const clientName = doc?.client_name || "Client";
  const clientEmail = doc?.client_email || "";
  const clientAddress = doc?.client_address || "";
  const companyName = doc?.company_name || "Your Company";
  const companyEmail = doc?.company_email || "";
  const companyAddress = doc?.company_address || "";
  const currency = doc?.currency || "ZAR";
  const notes = doc?.notes || "";
  const terms = doc?.terms_conditions || "";
  const rows = Array.isArray(doc?.line_items) ? doc.line_items : Array.isArray(doc?.items) ? doc.items : [];
  const normalizedRows = rows.map((row) => {
    const qty = Number(row?.quantity ?? row?.qty ?? 1) || 1;
    const unit = Number(row?.unit_price ?? row?.rate ?? row?.price ?? 0) || 0;
    const total = Number(row?.total ?? row?.total_price ?? qty * unit) || 0;
    const description = row?.description || row?.service_name || row?.name || "Item";
    return { qty, unit, total, description };
  });

  const subtotal =
    Number(doc?.subtotal) ||
    normalizedRows.reduce((sum, row) => sum + (Number.isFinite(row.total) ? row.total : 0), 0);
  const discount = Math.max(0, Number(doc?.discount ?? doc?.discount_amount ?? 0) || 0);
  const taxAmount = Number(doc?.tax_amount ?? 0) || 0;
  const total = Number(doc?.total ?? doc?.total_amount ?? subtotal - discount + taxAmount) || 0;

  const lineRowsHtml = normalizedRows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.description)}</td>
          <td>${escapeHtml(row.qty)}</td>
          <td>${escapeHtml(fmtCurrency(row.unit, currency))}</td>
          <td class="bold">${escapeHtml(fmtCurrency(row.total, currency))}</td>
        </tr>
      `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body>
  <table>
    <tr>
      <td>
        <div class="bold large">${escapeHtml(companyName)}</div>
      </td>
      <td class="right">
        <div class="bold large">${escapeHtml(title)}</div>
        <div>#${escapeHtml(number)}</div>
      </td>
    </tr>
  </table>

  <table class="invoice-info-container">
    <tr><td class="bold">${escapeHtml(isQuote ? "Quote for" : "Bill to")}</td><td class="right bold">Issue date</td></tr>
    <tr><td>${escapeHtml(clientName)}</td><td class="right">${escapeHtml(issueDate)}</td></tr>
    <tr><td>${escapeHtml(clientEmail)}</td><td class="right bold">${escapeHtml(isQuote ? "Valid until" : "Due date")}</td></tr>
    <tr><td>${escapeHtml(clientAddress).replaceAll("\n", "<br/>")}</td><td class="right">${escapeHtml(dueDate)}</td></tr>
  </table>

  <table class="line-items-container has-bottom-border">
    <thead>
      <tr>
        <th>Description</th>
        <th class="heading-quantity">Qty</th>
        <th class="heading-price right">Unit price</th>
        <th class="heading-subtotal right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineRowsHtml || '<tr><td colspan="4">No line items</td></tr>'}
    </tbody>
  </table>

  <table class="payment-info">
    <tr><td>Subtotal</td><td>${escapeHtml(fmtCurrency(subtotal, currency))}</td></tr>
    ${discount > 0 ? `<tr><td>Discount</td><td>-${escapeHtml(fmtCurrency(discount, currency))}</td></tr>` : ""}
    ${taxAmount > 0 ? `<tr><td>Tax</td><td>${escapeHtml(fmtCurrency(taxAmount, currency))}</td></tr>` : ""}
    <tr class="total"><td class="bold">${escapeHtml(isQuote ? "Total quote" : "Total due")}</td><td class="bold">${escapeHtml(fmtCurrency(total, currency))}</td></tr>
  </table>

  ${notes ? `<div class="footer"><div class="bold">Notes</div><div>${escapeHtml(notes).replaceAll("\n", "<br/>")}</div></div>` : ""}
  ${terms ? `<div class="footer"><div class="bold">Terms & Conditions</div><div>${escapeHtml(terms).replaceAll("\n", "<br/>")}</div></div>` : ""}
  ${companyEmail ? `<div class="footer-info"><span>${escapeHtml(companyEmail)}</span></div>` : ""}
</body>
</html>`;
}

async function fetchInvoiceAnvilBaseCss() {
  try {
    const res = await fetch(getInvoiceAnvilCssUrl(), { credentials: "same-origin" });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Best-effort: same-origin stylesheets + inline <style> (skipped on CORS).
 * Pulls built CSS so Tailwind utility classes in the invoice node still apply in Anvil.
 */
export async function collectDocumentCss() {
  const parts = [];
  const seen = new Set();
  const sheets = Array.from(document.styleSheets || []);
  for (const sheet of sheets) {
    try {
      if (sheet.href) {
        if (seen.has(sheet.href)) continue;
        seen.add(sheet.href);
        const res = await fetch(sheet.href, { credentials: "include" });
        if (res.ok) parts.push(await res.text());
      } else if (sheet.ownerNode && "textContent" in sheet.ownerNode) {
        const text = sheet.ownerNode.textContent;
        if (text) parts.push(text);
      }
    } catch {
      // CORS or inaccessible sheet
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

function wrapInvoiceHtml(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll("script").forEach((n) => n.remove());
  const inner = clone.innerHTML;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head><body style="margin:0;background:#fff">${inner}</body></html>`;
}

/**
 * Generate a PDF via Anvil through POST /api/generate-pdf-html (Bearer token).
 * Mirrors the server-side payload: type html, data.html, data.css, page margins.
 *
 * @param {HTMLElement} element - e.g. printRef root
 * @param {string} [filename]
 * @param {{ css?: string, title?: string, includeInvoiceBaseCss?: boolean, page?: { marginLeft?: string, marginRight?: string, marginTop?: string, marginBottom?: string } }} [options]
 */
export default async function generatePdfFromAnvil(element, filename = "document.pdf", options = {}) {
  if (!element) throw new Error("No element provided to generate PDF");

  const html = wrapInvoiceHtml(element);
  const includeBase = options.includeInvoiceBaseCss !== false;
  const baseCss = includeBase ? await fetchInvoiceAnvilBaseCss() : "";
  const restCss = options.css != null ? options.css : await collectDocumentCss();
  const css = [baseCss, restCss].filter(Boolean).join("\n\n");
  const title = options.title || filename.replace(/\.pdf$/i, "") || "Document";
  const page = options.page || {
    marginLeft: "60px",
    marginRight: "60px",
  };

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new Error("Sign in required to generate PDF");
  }

  const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
  const res = await fetch(`${apiBase}/api/generate-pdf-html`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      html,
      css,
      title,
      page,
      filename,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || errJson.detail || res.statusText || "PDF generation failed");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Generate a PDF from structured invoice/quote data (no DOM capture required).
 * Uses the same /api/generate-pdf-html endpoint and current user auth session.
 *
 * @param {{doc: object, docType: "invoice"|"quote"}} payload
 * @param {string} [filename]
 * @param {{ title?: string, page?: { marginLeft?: string, marginRight?: string, marginTop?: string, marginBottom?: string } }} [options]
 */
export async function generateDocumentPdfFromAnvil(payload, filename = "document.pdf", options = {}) {
  const doc = payload?.doc || {};
  const docType = payload?.docType || "invoice";
  const html = buildDocumentHtmlFromData(doc, docType);
  const baseCss = await fetchInvoiceAnvilBaseCss();
  const title = options.title || (docType === "quote" ? "Quote" : "Invoice");
  const page = options.page || { marginLeft: "60px", marginRight: "60px" };

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Sign in required to generate PDF");

  const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
  const res = await fetch(`${apiBase}/api/generate-pdf-html`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      html,
      css: baseCss || "",
      title,
      page,
      filename,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || errJson.detail || res.statusText || "PDF generation failed");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
