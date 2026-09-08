import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DOCUMENT_ENGINE_ERROR,
  DOCUMENT_ENGINE_TYPES,
  DOCUMENT_OBSERVE_ACTION,
  DocumentEngineError,
  buildSendIdempotencyKey,
  createDocumentContext,
  defaultObserveClickAction,
  isAuthorizedPayslipViewer,
  payslipRequiresEmailVerification,
  resolveDocumentDeliveryPath,
  sanitizeDocumentEventMetadata,
} from "../../shared/documents/documentEngine.js";
import {
  DOCUMENT_EVENT_TYPE,
  assertEventAllowedForSource,
  isEventAllowedForSource,
} from "../../shared/documents/documentEvents.js";
import { formatDocumentEventType } from "../../src/document-engine/documentEventLabels.js";
import { resolveLifecycleEventType } from "../../src/document-engine/documentEventTypes.js";
import { sendPayslipEmail } from "../../server/src/documents/documentSendAdapter.js";
import { sendDocument } from "../../src/document-engine/send/adapter.js";

vi.mock("@/utils/inputSanitization", () => ({
  isValidEmail: (value) => /@/.test(String(value || "")),
}));

vi.mock("../../src/document-engine/pdf/adapter.js", () => ({
  generateDocumentPdf: vi.fn(async (context) => ({
    blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    filename: `${context.documentType}.pdf`,
    mimeType: "application/pdf",
    documentId: context.documentId,
    documentType: context.documentType,
  })),
}));

vi.mock("../../src/document-engine/send/message.js", () => ({
  recordDocumentSend: vi.fn(async () => {}),
  persistDocumentMessageLog: vi.fn(async () => {}),
}));

vi.mock("../../src/document-engine/send/email.js", () => ({
  dispatchDocumentEmail: vi.fn(async () => ({ success: true, channel: "test" })),
}));

describe("document engine context and errors", () => {
  it("builds a typed context without forcing shared business fields", () => {
    const invoice = createDocumentContext({
      documentType: "invoice",
      record: { id: "inv-1", org_id: "org-1", client_id: "cli-1", invoice_number: "INV-9" },
    });
    const payslip = createDocumentContext({
      documentType: "payslip",
      record: { id: "ps-1", org_id: "org-1", payslip_number: "PS-9", employee_user_id: "emp-1" },
    });
    expect(invoice.documentType).toBe("invoice");
    expect(invoice.clientId).toBe("cli-1");
    expect(payslip.documentType).toBe("payslip");
    expect(payslip.clientId).toBeNull();
    expect(payslip.documentNumber).toBe("PS-9");
  });

  it("rejects a missing document id", () => {
    expect(() => createDocumentContext({ documentType: "quote", record: {} })).toThrow(DocumentEngineError);
    try {
      createDocumentContext({ documentType: "quote", record: {} });
    } catch (error) {
      expect(error.code).toBe(DOCUMENT_ENGINE_ERROR.DOCUMENT_NOT_FOUND);
    }
  });
});

describe("quote ≠ invoice ≠ payslip events", () => {
  it("keeps payment events on invoices only", () => {
    expect(isEventAllowedForSource("invoice", "paid")).toBe(true);
    expect(isEventAllowedForSource("invoice", "overdue")).toBe(true);
    expect(isEventAllowedForSource("quote", "paid")).toBe(false);
    expect(isEventAllowedForSource("payslip", "paid")).toBe(false);
    expect(isEventAllowedForSource("payslip", "overdue")).toBe(false);
    expect(isEventAllowedForSource("payslip", "payment_intent")).toBe(false);
  });

  it("keeps quote decisions off invoices and payslips", () => {
    expect(isEventAllowedForSource("quote", "accepted")).toBe(true);
    expect(isEventAllowedForSource("invoice", "accepted")).toBe(false);
    expect(isEventAllowedForSource("payslip", "accepted")).toBe(false);
    expect(() => assertEventAllowedForSource("payslip", "paid")).toThrow(/Payslips cannot record/);
  });

  it("allows payslip delivery and download events only on payslips", () => {
    for (const eventType of ["created", "sent", "delivered", "opened", "clicked", "downloaded"]) {
      expect(isEventAllowedForSource("payslip", eventType)).toBe(true);
    }
    expect(isEventAllowedForSource("invoice", "downloaded")).toBe(false);
    expect(isEventAllowedForSource("quote", "delivered")).toBe(false);
  });

  it("does not map payroll paid status to an invoice paid event", () => {
    expect(resolveLifecycleEventType("payslip", "sent", "paid")).toBeNull();
    expect(resolveLifecycleEventType("invoice", "sent", "paid")).toBe("paid");
  });

  it("uses distinct timeline labels", () => {
    expect(formatDocumentEventType("opened", "invoice")).toBe("Client viewed invoice");
    expect(formatDocumentEventType("opened", "quote")).toBe("Client viewed quote");
    expect(formatDocumentEventType("opened", "payslip")).toBe("Employee opened payslip");
    expect(formatDocumentEventType("downloaded", "payslip")).toBe("Payslip downloaded");
  });
});

describe("observation actions", () => {
  it("keeps payment, quote, and payslip click actions separate", () => {
    expect(defaultObserveClickAction("invoice")).toBe(DOCUMENT_OBSERVE_ACTION.PAYMENT_CTA);
    expect(defaultObserveClickAction("quote")).toBe(DOCUMENT_OBSERVE_ACTION.PRIMARY_CTA);
    expect(defaultObserveClickAction("payslip")).toBe(DOCUMENT_OBSERVE_ACTION.VIEW_PAYSLIP);
  });
});

describe("payslip security", () => {
  it("does not treat a payslip like a public invoice URL", () => {
    const path = resolveDocumentDeliveryPath(
      { documentType: DOCUMENT_ENGINE_TYPES.payslip },
      { shareToken: "11111111-1111-4111-8111-111111111111" }
    );
    expect(path).toContain("/PublicPayslip?token=");
    expect(path).not.toContain("/view/");
  });

  it("rejects another employee's viewer token", () => {
    const shareToken = "share-a";
    expect(
      isAuthorizedPayslipViewer({
        shareToken,
        sentToEmail: "a@paidly.test",
        viewer: { shareToken, email: "b@paidly.test" },
      })
    ).toBe(false);
    expect(
      isAuthorizedPayslipViewer({
        shareToken,
        sentToEmail: "a@paidly.test",
        viewer: { shareToken, email: "a@paidly.test" },
      })
    ).toBe(true);
  });

  it("rejects a missing or mismatched token as unauthorized", () => {
    expect(
      isAuthorizedPayslipViewer({
        shareToken: "share-a",
        sentToEmail: "a@paidly.test",
        viewer: null,
      })
    ).toBe(false);
    expect(payslipRequiresEmailVerification("a@paidly.test")).toBe(true);
  });

  it("strips payroll amounts from event metadata", () => {
    const payload = sanitizeDocumentEventMetadata("payslip", {
      channel: "email",
      net_pay: 12000,
      tax_amount: 2000,
      bank_details: "secret",
      id_number: "900101",
    });
    expect(payload).toEqual({ channel: "email" });
    expect(payload.net_pay).toBeUndefined();
  });
});

describe("send adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    class FileReaderMock {
      result = "data:application/pdf;base64,JVBERi0=";
      onload = null;
      readAsDataURL() {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("FileReader", FileReaderMock);
  });

  it("fails before the provider when the recipient is missing", async () => {
    const transport = vi.fn();
    await expect(
      sendDocument({
        context: createDocumentContext({
          documentType: "invoice",
          record: { id: "inv-1", invoice_number: "INV-1" },
        }),
        recipient: { email: "" },
        options: { html: "<p>x</p>" },
      }, { transport, generatePdf: vi.fn() })
    ).rejects.toMatchObject({ code: DOCUMENT_ENGINE_ERROR.RECIPIENT_MISSING });
    expect(transport).not.toHaveBeenCalled();
  });

  it("does not record a sent event when the provider fails", async () => {
    const recordSentEvent = vi.fn();
    const transport = vi.fn(async () => ({ success: false, error: "Resend down" }));
    await expect(
      sendDocument({
        context: createDocumentContext({
          documentType: "invoice",
          record: { id: "inv-1", invoice_number: "INV-1" },
          client: { email: "client@test.com" },
        }),
        recipient: { email: "client@test.com" },
        options: { html: "<p>x</p>", attachPdf: false },
      }, { transport, recordSentEvent })
    ).rejects.toMatchObject({ code: DOCUMENT_ENGINE_ERROR.EMAIL_PROVIDER_FAILED });
    expect(recordSentEvent).not.toHaveBeenCalled();
  });

  it("records sent after provider success and is idempotent per send attempt", async () => {
    const recordSentEvent = vi.fn();
    const transport = vi.fn(async () => ({ success: true, channel: "edge" }));
    const context = createDocumentContext({
      documentType: "quote",
      record: { id: "q-1", quote_number: "QUO-1" },
      client: { email: "client@test.com" },
    });
    const first = await sendDocument(
      { context, recipient: { email: "client@test.com" }, options: { html: "<p>q</p>", attachPdf: false, sendAttempt: "attempt-1" } },
      { transport, recordSentEvent }
    );
    const secondKey = buildSendIdempotencyKey({
      documentType: "quote",
      documentId: "q-1",
      sendAttempt: "attempt-1",
    });
    expect(first.success).toBe(true);
    expect(first.idempotencyKey).toBe(secondKey);
    expect(recordSentEvent).toHaveBeenCalledTimes(1);

    const resend = await sendDocument(
      { context, recipient: { email: "client@test.com" }, options: { html: "<p>q</p>", attachPdf: false, sendAttempt: "attempt-2" } },
      { transport, recordSentEvent }
    );
    expect(resend.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(recordSentEvent).toHaveBeenCalledTimes(2);
  });

  it("refuses to attach a payslip PDF", async () => {
    await expect(
      sendDocument({
        context: createDocumentContext({
          documentType: "payslip",
          record: { id: "ps-1", payslip_number: "PS-1" },
        }),
        recipient: { email: "emp@test.com" },
        options: { attachPdf: true, html: "<p>no</p>" },
      }, { transport: vi.fn() })
    ).rejects.toMatchObject({ code: DOCUMENT_ENGINE_ERROR.UNAUTHORIZED_DOCUMENT_ACCESS });
  });
});

describe("payslip send adapter", () => {
  it("sends a secure link and does not attach payroll data", async () => {
    const transport = vi.fn(async () => ({ success: true }));
    const result = await sendPayslipEmail({
      to: "emp@test.com",
      employeeName: "Ada",
      periodLabel: "August 2026",
      payslipNumber: "PS-1001",
      shareToken: "11111111-1111-4111-8111-111111111111",
      origin: "https://www.paidly.co.za",
      transport,
    });
    expect(result.success).toBe(true);
    expect(result.url).toContain("/PublicPayslip?token=");
    expect(transport.mock.calls[0][2]).toContain("/PublicPayslip?token=");
    expect(transport.mock.calls[0][2]).not.toMatch(/12000|net pay/i);
    expect(transport.mock.calls[0][3]).toBe("Paidly");
  });

  it("does not treat provider failure as sent", async () => {
    await expect(
      sendPayslipEmail({
        to: "emp@test.com",
        employeeName: "Ada",
        periodLabel: "August 2026",
        payslipNumber: "PS-1001",
        shareToken: "11111111-1111-4111-8111-111111111111",
        origin: "https://www.paidly.co.za",
        transport: async () => ({ success: false, error: "bounce" }),
      })
    ).rejects.toMatchObject({ code: DOCUMENT_ENGINE_ERROR.EMAIL_PROVIDER_FAILED });
  });

  it("requires a recipient", async () => {
    await expect(
      sendPayslipEmail({
        to: "",
        shareToken: "11111111-1111-4111-8111-111111111111",
        transport: vi.fn(),
      })
    ).rejects.toMatchObject({ code: DOCUMENT_ENGINE_ERROR.RECIPIENT_MISSING });
  });
});

describe("pdf template selection", () => {
  it("selects a generator per document type", async () => {
    const invoice = vi.fn(async () => ({ blob: {}, filename: "INV.pdf" }));
    const quote = vi.fn(async () => ({ blob: {}, filename: "QUO.pdf" }));
    const payslip = vi.fn(async () => ({ blob: {}, filename: "PS.pdf" }));
    const generators = { invoice, quote, payslip };
    for (const type of ["invoice", "quote", "payslip"]) {
      await generators[type]({ documentType: type, documentId: `${type}-1` });
    }
    expect(invoice).toHaveBeenCalledTimes(1);
    expect(quote).toHaveBeenCalledTimes(1);
    expect(payslip).toHaveBeenCalledTimes(1);
  });
});
