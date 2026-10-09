/**
 * Client Import API — POST /api/company/client-import?op=check|commit.
 * The server resolves the business, re-validates every row and does all writes.
 */
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";
import { CLIENT_IMPORT_LIMITS } from "@shared/clients/clientImport.js";

export class ClientImportApiError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = "ClientImportApiError";
    this.code = extra.code || "ERROR";
    this.status = extra.status || 0;
    this.network = Boolean(extra.network);
  }
}

const NETWORK_MESSAGE = "The connection dropped. Check your connection and try again — clients already imported won't be duplicated.";
const GENERIC_MESSAGE = "Something went wrong. Please try again.";

export function isRetryableClientImportError(err) {
  return Boolean(err?.network || err?.status >= 500 || err?.code === "RATE_LIMITED");
}

async function call(op, body, { signal, method = "POST" } = {}) {
  const session = await getStableSession();
  const token = session?.access_token;
  if (!token) throw new ClientImportApiError("Your session has ended. Sign in again to continue.", { code: "UNAUTHORIZED", status: 401 });
  const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
  let res;
  try {
    res = await apiRequest(`${apiBase}/api/company/client-import?op=${encodeURIComponent(op)}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
      signal,
      __paidlyCritical: true,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ClientImportApiError(NETWORK_MESSAGE, { code: "NETWORK", network: true });
  }
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  if (!res.ok) {
    const message = typeof json.error === "string" && json.code
      ? json.error
      : res.status >= 500
        ? NETWORK_MESSAGE
        : GENERIC_MESSAGE;
    throw new ClientImportApiError(message, {
      code: json.code || `HTTP_${res.status}`,
      status: res.status,
      network: res.status === 502 || res.status === 503 || res.status === 504,
    });
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function checkClientDuplicates(rows, { signal } = {}) {
  const existing = new Map();
  const matches = [];
  for (let i = 0; i < rows.length; i += CLIENT_IMPORT_LIMITS.checkBatchSize) {
    const chunk = rows.slice(i, i + CLIENT_IMPORT_LIMITS.checkBatchSize).map((r) => ({
      row_number: r.row_number,
      email: r.value?.email || "",
      phone: r.value?.phone || "",
      tax_id: r.value?.tax_id || "",
    }));
    const json = await call("check", { rows: chunk }, { signal });
    for (const e of json.existing || []) existing.set(e.id, e);
    matches.push(...(json.matches || []));
  }
  return { existing: [...existing.values()], matches };
}

export async function listClientImportRuns() {
  return call("runs", null, { method: "GET" });
}

/**
 * Send reviewed rows in batches of ≤100. A lost response is retried with the same import id, so a
 * client the server already saved is reported again instead of inserted twice. A batch that still
 * fails is marked failed and the import continues.
 *
 * A session, permission or plan error stops the run, but results from earlier batches are kept. Rows
 * that were never processed come back as "remaining" with the reason, so the report stays accurate.
 */
export async function commitClientImport({ importId, filename, rows, onProgress, signal }) {
  const results = [];
  const size = CLIENT_IMPORT_LIMITS.commitBatchSize;
  const outcomeFor = (r, outcome, reason, fix, extra = {}) =>
    r.action === "skip"
      ? { row_number: r.row_number, outcome: "skipped", reason: "You chose to skip this row." }
      : { row_number: r.row_number, outcome, reason, fix, ...extra };
  onProgress?.(0, rows.length);
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    let attempt = 0;
    for (;;) {
      try {
        const json = await call("commit", { import_id: importId, filename, rows: batch }, { signal });
        results.push(...(json.results || []));
        break;
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        const known = err instanceof ClientImportApiError;
        if (known && !isRetryableClientImportError(err)) {
          const fix = "Fix the problem above, then retry. Clients already imported won't be duplicated.";
          for (const r of rows.slice(i)) results.push(outcomeFor(r, "remaining", err.message, fix, { stopped: true }));
          onProgress?.(rows.length, rows.length);
          return results;
        }
        if (known && attempt < 2) {
          attempt += 1;
          await sleep(800 * attempt);
          continue;
        }
        const reason = known ? err.message : GENERIC_MESSAGE;
        const fix = "Retry the failed rows. Clients already imported won't be duplicated.";
        for (const r of batch) results.push(outcomeFor(r, "failed", reason, fix, { retryable: true }));
        break;
      }
    }
    onProgress?.(Math.min(i + batch.length, rows.length), rows.length);
  }
  return results;
}
