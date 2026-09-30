/**
 * Product Import API — POST /api/company/product-import?op=check|commit. The server resolves the
 * company, re-validates every row and does all writes (see server/src/catalog/productImportRoutes.js).
 */
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";
import { IMPORT_LIMITS } from "@shared/catalog/productImport.js";

export class ProductImportApiError extends Error {
  /** @param {string} message plain sentence safe to show @param {{ code?: string, status?: number, network?: boolean }} [extra] */
  constructor(message, extra = {}) {
    super(message);
    this.name = "ProductImportApiError";
    this.code = extra.code || "ERROR";
    this.status = extra.status || 0;
    this.network = Boolean(extra.network);
  }
}

const NETWORK_MESSAGE = "The connection dropped. Check your connection and try again.";
const GENERIC_MESSAGE = "Something went wrong. Please try again.";

async function call(op, body, { signal } = {}) {
  const session = await getStableSession();
  const token = session?.access_token;
  if (!token) throw new ProductImportApiError("Your session has ended. Sign in again to continue.", { code: "UNAUTHORIZED", status: 401 });
  const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
  let res;
  try {
    res = await apiRequest(`${apiBase}/api/company/product-import?op=${encodeURIComponent(op)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ProductImportApiError(NETWORK_MESSAGE, { code: "NETWORK", network: true });
  }
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  if (!res.ok) {
    const message = typeof json.error === "string" && json.code ? json.error : GENERIC_MESSAGE;
    throw new ProductImportApiError(message, {
      code: json.code || `HTTP_${res.status}`,
      status: res.status,
      network: res.status === 502 || res.status === 503 || res.status === 504,
    });
  }
  return json;
}

/**
 * Existing catalogue items that share a SKU / barcode / name with these rows (this company only).
 * @param {"product" | "service"} itemType
 * @param {Array<{ row_number: number, sku?: string | null, barcode?: string | null, name?: string | null }>} keys
 */
export async function checkImportDuplicates(itemType, keys, { signal } = {}) {
  const existing = new Map();
  const matches = [];
  for (let i = 0; i < keys.length; i += IMPORT_LIMITS.checkBatchSize) {
    const chunk = keys.slice(i, i + IMPORT_LIMITS.checkBatchSize).map((k) => ({
      row_number: k.row_number,
      sku: k.sku || "",
      barcode: k.barcode || "",
      name: k.name || "",
    }));
    const json = await call("check", { item_type: itemType, rows: chunk }, { signal });
    for (const e of json.existing || []) existing.set(e.id, e);
    matches.push(...(json.matches || []));
  }
  return { existing: [...existing.values()], matches };
}

const RETRYABLE = (err) => err?.network || err?.status >= 500 || err?.code === "RATE_LIMITED";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Send reviewed rows in batches of ≤100. Each batch is retried (same import id → the server never
 * creates a row twice). A batch that still fails marks its rows failed and the import continues;
 * an auth / plan / permission error stops everything.
 *
 * @param {{ importId: string, itemType: "product" | "service", rows: any[], standardRate?: number,
 *           onProgress?: (done: number, total: number) => void, signal?: AbortSignal }} args
 */
export async function commitProductImport({ importId, itemType, rows, standardRate, onProgress, signal }) {
  const results = [];
  const size = IMPORT_LIMITS.commitBatchSize;
  onProgress?.(0, rows.length);
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    let attempt = 0;
    for (;;) {
      try {
        const json = await call(
          "commit",
          { import_id: importId, item_type: itemType, standard_vat_rate: standardRate, rows: batch },
          { signal }
        );
        results.push(...(json.results || []));
        break;
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        if (!(err instanceof ProductImportApiError) || !RETRYABLE(err) || attempt >= 2) {
          if (err instanceof ProductImportApiError && !RETRYABLE(err) && err.status !== 422) throw err;
          const reason = err instanceof ProductImportApiError ? err.message : GENERIC_MESSAGE;
          for (const r of batch) {
            results.push({ row_number: r.row_number, outcome: "failed", reason, fix: "Retry the failed rows — rows already imported won't be duplicated.", retryable: true });
          }
          break;
        }
        attempt += 1;
        await sleep(800 * attempt);
      }
    }
    onProgress?.(Math.min(i + size, rows.length), rows.length);
  }
  return results;
}
