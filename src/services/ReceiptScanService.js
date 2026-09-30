/**
 * Scan Receipt API — POST /api/company/receipts?op=… (server picks the company; see
 * server/src/expenses/receiptScanRoutes.js) plus the direct upload into the private receipts bucket.
 */
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";
import { supabase } from "@/lib/supabaseClient";
import { beginCriticalSessionOperation, endCriticalSessionOperation } from "@/lib/sessionTimeoutControls";

export class ReceiptApiError extends Error {
  /**
   * @param {string} message plain sentence safe to show
   * @param {{ code?: string, status?: number, errors?: Record<string, string>, duplicates?: any[], network?: boolean }} [extra]
   */
  constructor(message, extra = {}) {
    super(message);
    this.name = "ReceiptApiError";
    this.code = extra.code || "ERROR";
    this.status = extra.status || 0;
    this.errors = extra.errors || {};
    this.duplicates = extra.duplicates || [];
    this.network = Boolean(extra.network);
  }
}

const NETWORK_MESSAGE = "You seem to be offline or the connection dropped. Check your connection and try again.";
const GENERIC_MESSAGE = "Something went wrong. Please try again.";

async function call(op, body, { signal } = {}) {
  const session = await getStableSession();
  const token = session?.access_token;
  if (!token) throw new ReceiptApiError("Your session has ended. Sign in again to continue.", { code: "UNAUTHORIZED", status: 401 });
  const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
  let res;
  try {
    res = await apiRequest(`${apiBase}/api/company/receipts?op=${encodeURIComponent(op)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ReceiptApiError(NETWORK_MESSAGE, { code: "NETWORK", network: true });
  }
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  if (!res.ok) {
    // Server messages are written for people; anything else (proxy HTML, 502) gets a generic line.
    const message = typeof json.error === "string" && json.code ? json.error : GENERIC_MESSAGE;
    throw new ReceiptApiError(message, {
      code: json.code || `HTTP_${res.status}`,
      status: res.status,
      errors: json.errors,
      duplicates: json.duplicates,
      network: res.status === 502 || res.status === 503 || res.status === 504,
    });
  }
  return json;
}

/** Server-chosen upload path in the caller's company folder. @param {string} mediaType */
export function prepareReceiptUpload(mediaType) {
  return call("prepare", { media_type: mediaType });
}

/**
 * Upload the ORIGINAL receipt (never the processed copy). upsert:false — a path is used once.
 * @param {string} receiptPath from prepareReceiptUpload
 * @param {Blob} file
 * @param {string} mediaType
 */
export async function uploadReceiptOriginal(receiptPath, file, mediaType) {
  beginCriticalSessionOperation();
  try {
    const { error } = await supabase.storage.from("receipts").upload(receiptPath, file, {
      upsert: false,
      contentType: mediaType,
      cacheControl: "3600",
    });
    if (error) {
      const msg = String(error.message || "");
      // A retry after a lost response: the object is already there — that's success.
      if (/already exists|duplicate/i.test(msg)) return;
      if (/row-level security|unauthori[sz]ed|403/i.test(msg)) {
        throw new ReceiptApiError("You don't have permission to add receipts for this business.", { code: "FORBIDDEN", status: 403 });
      }
      throw new ReceiptApiError("We couldn't upload this receipt.", { code: "UPLOAD_FAILED", network: true });
    }
  } catch (err) {
    if (err instanceof ReceiptApiError) throw err;
    throw new ReceiptApiError("We couldn't upload this receipt.", { code: "UPLOAD_FAILED", network: true });
  } finally {
    endCriticalSessionOperation();
  }
}

/** @param {string} receiptPath @param {{ data: string, media_type: string } | null} image */
export function extractReceiptOnServer(receiptPath, image, opts) {
  return call("extract", { receipt_path: receiptPath, ...(image ? { image } : {}) }, opts);
}

/** Supplier match + duplicate check for the review screen. */
export function reviewReceipt(payload) {
  return call("review", payload);
}

/** Final server validation → expense. Idempotent per client_operation_id. */
export function confirmReceiptExpense(payload) {
  return call("confirm", payload);
}

/** Best-effort removal of an upload the person abandoned. Never throws. @param {string} receiptPath */
export async function discardReceiptUpload(receiptPath) {
  try {
    await call("discard", { receipt_path: receiptPath });
  } catch {
    // Abandoned uploads are harmless (private, company-scoped); nothing to tell the user.
  }
}

/**
 * Short-lived link to view a receipt. Storage RLS decides who may see it.
 * @param {string} objectPath path inside the receipts bucket
 * @param {number} [expiresInSeconds]
 */
export async function getReceiptViewUrl(objectPath, expiresInSeconds = 120) {
  if (!objectPath) return null;
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(objectPath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl || null;
}
