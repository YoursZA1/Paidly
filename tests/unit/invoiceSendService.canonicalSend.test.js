import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const {
  Invoice,
  Client,
  User,
  BankingDetail,
  DocumentSend,
  MessageLog,
  messageLogByToken,
} = vi.hoisted(() => ({
  Invoice: { get: vi.fn(), update: vi.fn() },
  Client: { get: vi.fn() },
  User: { me: vi.fn() },
  BankingDetail: { get: vi.fn() },
  DocumentSend: { create: vi.fn() },
  MessageLog: { create: vi.fn() },
  messageLogByToken: new Map(),
}));

vi.mock("@/api/entities", () => ({
  Invoice,
  Client,
  User,
  BankingDetail,
  DocumentSend,
  MessageLog,
  Quote: { get: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: (table) => ({
      select: () => ({
        eq: (_col, token) => ({
          maybeSingle: async () => ({
            data: table === "message_logs" ? messageLogByToken.get(token) || null : null,
            error: null,
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/core/auth/SessionCoordinator", () => ({
  getStableSessionResult: vi.fn(async () => ({
    data: { session: { access_token: "tok-1" } },
    error: null,
  })),
  getStableSession: vi.fn(async () => ({ access_token: "tok-1" })),
}));

vi.mock("@/components/pdf/generateInvoicePDF", () => ({
  generateInvoicePDF: vi.fn(async () => new Blob(["%PDF-1.4"], { type: "application/pdf" })),
}));

vi.mock("@/components/pdf/generateQuotePDF", () => ({
  generateQuotePDF: vi.fn(),
}));

vi.mock("@/utils/invoiceEmailHtml", () => ({
  generateInvoiceEmailHtml: vi.fn(() => "<html>invoice</html>"),
}));

vi.mock("@/utils/quoteEmailHtml", () => ({
  generateQuoteEmailHtml: vi.fn(() => "<html>quote</html>"),
}));

vi.mock("@/api/backendClient", () => ({
  getPublicApiBase: vi.fn(() => "https://api.test"),
}));

vi.mock("@/lib/sessionTimeoutControls", () => ({
  beginCriticalSessionOperation: vi.fn(),
  endCriticalSessionOperation: vi.fn(),
}));

vi.mock("@/utils/documentBrandColors", () => ({
  snapshotDocumentBrandForPersist: vi.fn(() => ({})),
}));

vi.mock("@/utils/retryOnAbort", () => ({
  retryOnAbort: (fn) => fn(),
  retryOnTransientFetch: (fn) => fn(),
  isAbortError: () => false,
}));

import { sendInvoiceToClient, prepareInvoiceTrackingLink, resendInvoice } from "../../src/services/InvoiceSendService.js";
import { processSyncJob, SYNC_JOB_TYPES } from "../../src/lib/syncJobProcessor.js";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("sendInvoiceToClient provider-gated sent status", () => {
  const invoice = {
    id: "inv-1",
    client_id: "cli-1",
    status: "draft",
    invoice_number: "INV-001",
    public_share_token: "share-1",
    total_amount: 100,
    delivery_date: "2026-09-01",
    project_title: "Work",
  };
  const client = { id: "cli-1", email: "client@example.com", name: "Acme" };

  beforeEach(() => {
    vi.clearAllMocks();
    messageLogByToken.clear();
    import.meta.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    Invoice.get.mockResolvedValue(invoice);
    Invoice.update.mockResolvedValue({ ...invoice, status: "sent" });
    Client.get.mockResolvedValue(client);
    User.me.mockResolvedValue({ company_name: "Paidly Test", full_name: "Owner" });
    DocumentSend.create.mockResolvedValue({ id: "ds-1" });
    MessageLog.create.mockResolvedValue({ id: "ml-1" });

    vi.stubGlobal(
      "crypto",
      { randomUUID: () => "track-token-1", ...globalThis.crypto }
    );
    class FileReaderMock {
      result = "data:application/pdf;base64,JVBERi0=";
      onload = null;
      onerror = null;
      readAsDataURL() {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("FileReader", FileReaderMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not mark sent or record document_sends when the provider rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(500, { success: false, error: "Resend down" }))
    );

    await expect(sendInvoiceToClient("inv-1")).rejects.toThrow(/could not be sent|unavailable|rejected|try again/i);
    expect(Invoice.update).not.toHaveBeenCalledWith(
      "inv-1",
      expect.objectContaining({ status: "sent" })
    );
    expect(DocumentSend.create).not.toHaveBeenCalled();
  });

  it("fails before send when the client has no email", async () => {
    Client.get.mockResolvedValue({ id: "cli-1", email: "", name: "Acme" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendInvoiceToClient("inv-1")).rejects.toThrow(/no email/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Invoice.update).not.toHaveBeenCalledWith(
      "inv-1",
      expect.objectContaining({ status: "sent" })
    );
    expect(DocumentSend.create).not.toHaveBeenCalled();
  });

  it("marks sent and records document_sends only after provider success", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("send-invoice-email")) {
        return jsonResponse(200, { success: true });
      }
      return jsonResponse(500, { success: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendInvoiceToClient("inv-1");
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/functions/v1/send-invoice-email");
    expect(Invoice.update).toHaveBeenCalledWith(
      "inv-1",
      expect.objectContaining({ status: "sent", sent_to_email: "client@example.com" })
    );
    expect(DocumentSend.create).toHaveBeenCalledWith(
      expect.objectContaining({
        document_type: "invoice",
        document_id: "inv-1",
        channel: "email",
      })
    );
  });

  it("does not write message_logs when preparing a preview tracking link", () => {
    const prepared = prepareInvoiceTrackingLink({
      id: "inv-1",
      public_share_token: "share-1",
    });
    expect(prepared.trackingToken).toBeTruthy();
    expect(prepared.url).toContain("share-1");
    expect(MessageLog.create).not.toHaveBeenCalled();
  });

  it("skips a second provider call when the send operation was already logged", async () => {
    messageLogByToken.set("op-send-replay", { id: "ml-existing", document_id: "inv-1" });
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendInvoiceToClient("inv-1", { sendOperationId: "op-send-replay" });
    expect(result.success).toBe(true);
    expect(result.idempotentReplay).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Invoice.update).toHaveBeenCalledWith(
      "inv-1",
      expect.objectContaining({ status: "sent" })
    );
    expect(DocumentSend.create).not.toHaveBeenCalled();
  });

  it("resendInvoice sends via the canonical path and does not treat draft as sent-only", async () => {
    Invoice.get.mockResolvedValue({ ...invoice, status: "sent" });
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await resendInvoice("inv-1");
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    expect(Invoice.update).not.toHaveBeenCalledWith(
      "inv-1",
      expect.objectContaining({ status: "sent" })
    );
  });

  it("uses /api/send-invoice fallback when the edge function fails, then marks sent", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("send-invoice-email")) {
        return jsonResponse(500, { success: false, error: "edge down" });
      }
      if (String(url).includes("/api/send-invoice")) {
        return jsonResponse(200, { success: true, data: { id: "re_1" } });
      }
      return jsonResponse(404, { success: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendInvoiceToClient("inv-1");
    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/send-invoice"))).toBe(true);
    expect(Invoice.update).toHaveBeenCalledWith(
      "inv-1",
      expect.objectContaining({ status: "sent" })
    );
  });
});

describe("processSyncJob SEND_INVOICE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces send failures so the queue can retry without a completed job", async () => {
    Invoice.get.mockResolvedValue({
      id: "inv-2",
      client_id: "cli-2",
      status: "draft",
      invoice_number: "INV-002",
      public_share_token: "share-2",
    });
    Client.get.mockResolvedValue({ id: "cli-2", email: "a@b.com", name: "B" });
    User.me.mockResolvedValue({ company_name: "Paidly" });
    class FileReaderMock {
      result = "data:application/pdf;base64,JVBERi0=";
      onload = null;
      onerror = null;
      readAsDataURL() {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("FileReader", FileReaderMock);
    import.meta.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(503, { success: false, error: "down" })));

    await expect(
      processSyncJob({
        type: SYNC_JOB_TYPES.SEND_INVOICE,
        payload: { invoiceId: "inv-2" },
        meta: { operationId: "op-send-1" },
      })
    ).rejects.toThrow();

    expect(Invoice.update).not.toHaveBeenCalledWith(
      "inv-2",
      expect.objectContaining({ status: "sent" })
    );
    expect(DocumentSend.create).not.toHaveBeenCalled();
  });
});
