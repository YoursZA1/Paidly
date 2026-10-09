/**
 * Commit retries a dropped connection with the same import id, then keeps going.
 */
import { describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("@/utils/apiRequest", () => ({ apiRequest: (...args) => apiRequest(...args) }));
vi.mock("@/core/auth/SessionCoordinator", () => ({ getStableSession: async () => ({ access_token: "token" }) }));
vi.mock("@/api/backendClient", () => ({ getBackendBaseUrl: () => "" }));

const { commitClientImport, isRetryableClientImportError, ClientImportApiError } = await import("../../src/services/ClientImportService.js");

function ok(body) {
  return { ok: true, status: 200, json: async () => body };
}

describe("commitClientImport", () => {
  it("retries a network failure once and does not mark the row failed", async () => {
    apiRequest.mockReset();
    apiRequest
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(ok({ results: [{ row_number: 2, outcome: "created", client_id: "new-1" }] }));
    const results = await commitClientImport({
      importId: "44444444-4444-4444-8444-444444444444",
      filename: "clients.csv",
      rows: [{ row_number: 2, action: "create", values: { name: "A" } }],
    });
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(results).toEqual([{ row_number: 2, outcome: "created", client_id: "new-1" }]);
    const body = JSON.parse(apiRequest.mock.calls[1][1].body);
    expect(body.import_id).toBe("44444444-4444-4444-8444-444444444444");
  });

  it("keeps saved batches and reports the rest as remaining when a later batch is refused", async () => {
    apiRequest.mockReset();
    const rows = Array.from({ length: 150 }, (_, i) => ({ row_number: i + 2, action: "create", values: { name: `C${i}` } }));
    apiRequest
      .mockResolvedValueOnce(ok({ results: rows.slice(0, 100).map((r) => ({ row_number: r.row_number, outcome: "created", client_id: `id-${r.row_number}` })) }))
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ ok: false, code: "SUBSCRIPTION_REQUIRED", error: "Your trial has ended. You can view your data until you subscribe." }) });
    const results = await commitClientImport({ importId: "44444444-4444-4444-8444-444444444444", filename: "c.csv", rows });
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(results.filter((r) => r.outcome === "created")).toHaveLength(100);
    const remaining = results.filter((r) => r.outcome === "remaining");
    expect(remaining).toHaveLength(50);
    expect(remaining[0].reason).toMatch(/trial has ended/);
  });

  it("marks a batch failed after its retries run out and still sends the next batch", async () => {
    apiRequest.mockReset();
    const rows = Array.from({ length: 101 }, (_, i) => ({ row_number: i + 2, action: "create", values: { name: `C${i}` } }));
    apiRequest
      .mockRejectedValueOnce(new TypeError("network"))
      .mockRejectedValueOnce(new TypeError("network"))
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(ok({ results: [{ row_number: 102, outcome: "created", client_id: "last" }] }));
    const results = await commitClientImport({ importId: "44444444-4444-4444-8444-444444444444", filename: "c.csv", rows });
    expect(results.filter((r) => r.outcome === "failed" && r.retryable)).toHaveLength(100);
    expect(results.at(-1)).toEqual({ row_number: 102, outcome: "created", client_id: "last" });
  });

  it("treats connection and server errors as retryable, and permission errors as final", () => {
    expect(isRetryableClientImportError(new ClientImportApiError("down", { network: true, status: 0 }))).toBe(true);
    expect(isRetryableClientImportError(new ClientImportApiError("busy", { status: 503, code: "SCHEMA" }))).toBe(true);
    expect(isRetryableClientImportError(new ClientImportApiError("no", { status: 403, code: "FORBIDDEN" }))).toBe(false);
  });
});
