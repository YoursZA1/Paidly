/** Key for invoice PDF draft handoff (Create flow, Settings template preview, InvoicePreview). */
export const INVOICE_DRAFT_STORAGE_KEY = "invoiceDraft";

/** Key for quote PDF draft handoff (Create Quote, QuotePreview). */
export const QUOTE_DRAFT_STORAGE_KEY = "quoteDraft";

function writeDraftStorage(key, payload) {
  const s = JSON.stringify(payload);
  try {
    localStorage.setItem(key, s);
  } catch {
    // quota / private mode
  }
  try {
    sessionStorage.setItem(key, s);
  } catch {
    // ignore
  }
}

function readDraftStorage(key) {
  try {
    const fromLocal = localStorage.getItem(key);
    if (fromLocal) return fromLocal;
  } catch {
    // ignore
  }
  try {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession) return fromSession;
  } catch {
    // ignore
  }
  try {
    if (typeof window !== "undefined" && window.opener && !window.opener.closed) {
      return window.opener.sessionStorage.getItem(key);
    }
  } catch {
    // cross-origin or blocked opener access
  }
  return null;
}

/**
 * Persist draft so `InvoicePDF?draft=1` can load it from a tab opened via `window.open`.
 * `sessionStorage` is per-tab only, so we also write `localStorage` (same-origin shared).
 */
export function writeInvoiceDraft(payload) {
  writeDraftStorage(INVOICE_DRAFT_STORAGE_KEY, payload);
}

/**
 * Read invoice draft: prefer shared localStorage, then this tab’s sessionStorage, then opener’s sessionStorage.
 */
export function readInvoiceDraftRaw() {
  return readDraftStorage(INVOICE_DRAFT_STORAGE_KEY);
}

export function writeQuoteDraft(payload) {
  writeDraftStorage(QUOTE_DRAFT_STORAGE_KEY, payload);
}

export function readQuoteDraftRaw() {
  return readDraftStorage(QUOTE_DRAFT_STORAGE_KEY);
}
