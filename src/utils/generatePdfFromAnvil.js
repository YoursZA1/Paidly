import { supabase } from "@/lib/supabaseClient";
import { getBackendBaseUrl } from "@/api/backendClient";

/** Shared Anvil/browser invoice layout (`public/invoice-anvil/invoice.css`). */
export function getInvoiceAnvilCssUrl() {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}invoice-anvil/invoice.css`;
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
