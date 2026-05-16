import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/api/entities", () => ({
  Invoice: { create: vi.fn() },
  Client: { update: vi.fn() },
}));

vi.mock("@/services/InvoiceSendService", () => ({
  sendInvoiceToClient: vi.fn(),
}));

import { Invoice } from "@/api/entities";
import { processSyncJob, SYNC_JOB_TYPES } from "../../src/lib/syncJobProcessor.js";
import { syncMutationCoordinator } from "../../src/lib/syncMutationCoordinator.js";

describe("processSyncJob CREATE_INVOICE idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dedupes parallel CREATE_INVOICE with the same operationId", async () => {
    Invoice.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ id: "inv-1" }), 20);
        })
    );

    const job = {
      type: SYNC_JOB_TYPES.CREATE_INVOICE,
      payload: { invoiceData: { invoice_number: "INV-001" } },
      meta: { operationId: "op-dedupe-1" },
    };

    const [a, b] = await Promise.all([processSyncJob(job), processSyncJob(job)]);

    expect(Invoice.create).toHaveBeenCalledTimes(1);
    expect(a.id).toBe("inv-1");
    expect(b.id).toBe("inv-1");
    expect(Invoice.create.mock.calls[0][0].client_operation_id).toBe("op-dedupe-1");
  });
});

describe("processSyncJob UPDATE_CLIENT dedupe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dedupes parallel UPDATE_CLIENT with the same operationId", async () => {
    const { Client } = await import("@/api/entities");
    Client.update.mockResolvedValue({ id: "client-1" });

    const job = {
      type: SYNC_JOB_TYPES.UPDATE_CLIENT,
      payload: { clientId: "client-1", clientData: { name: "Acme" } },
      meta: { operationId: "op-client-1" },
    };

    const [a, b] = await Promise.all([processSyncJob(job), processSyncJob(job)]);

    expect(Client.update).toHaveBeenCalledTimes(1);
    expect(a.id).toBe("client-1");
    expect(b.id).toBe("client-1");
  });
});
