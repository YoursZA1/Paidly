import { describe, expect, it } from "vitest";
import {
  applyPaymentIntentTransition,
  canTransitionPaymentIntentStatus,
  mapOzowStatusToIntentStatus,
  PAYMENT_INTENT_STATUS,
} from "../../shared/payments/paymentIntentStates.js";
import {
  DOCUMENT_PAYMENT_ACTION,
  DOCUMENT_PAYMENT_BANNER,
  resolveDocumentPaymentCtas,
} from "../../shared/payments/documentPaymentCtas.js";
import {
  buildOzowNotifyHash,
  buildOzowRequestHash,
  ozowAmountString,
  verifyOzowNotifyHash,
} from "../../server/src/payments/ozowHash.js";
import { invoiceAmountDue } from "../../shared/payments/invoiceBalance.js";

describe("payment intent state machine", () => {
  it("allows pending → requires_action → processing → paid", () => {
    expect(canTransitionPaymentIntentStatus("pending", "requires_action")).toBe(true);
    expect(canTransitionPaymentIntentStatus("requires_action", "processing")).toBe(true);
    expect(canTransitionPaymentIntentStatus("processing", "paid")).toBe(true);
    expect(applyPaymentIntentTransition("paid", "paid")).toEqual({
      ok: true,
      same: true,
      next: "paid",
    });
  });

  it("rejects paid → failed and failed → paid on the same row", () => {
    expect(canTransitionPaymentIntentStatus("paid", "failed")).toBe(false);
    expect(canTransitionPaymentIntentStatus("failed", "paid")).toBe(false);
    expect(applyPaymentIntentTransition("failed", "paid").ok).toBe(false);
  });

  it("maps Ozow statuses without treating Success URL as paid", () => {
    expect(mapOzowStatusToIntentStatus("Complete")).toBe(PAYMENT_INTENT_STATUS.paid);
    expect(mapOzowStatusToIntentStatus("Cancelled")).toBe(PAYMENT_INTENT_STATUS.cancelled);
    expect(mapOzowStatusToIntentStatus("Error")).toBe(PAYMENT_INTENT_STATUS.failed);
    expect(mapOzowStatusToIntentStatus("PendingInvestigation")).toBe(PAYMENT_INTENT_STATUS.processing);
    expect(mapOzowStatusToIntentStatus("success")).toBeNull();
  });
});

describe("document payment CTAs", () => {
  it("shows edit/send on draft and pay/remind on overdue", () => {
    expect(resolveDocumentPaymentCtas({ invoiceStatus: "draft" }).actions).toEqual([
      DOCUMENT_PAYMENT_ACTION.edit,
      DOCUMENT_PAYMENT_ACTION.send,
    ]);
    const overdue = resolveDocumentPaymentCtas({
      invoiceStatus: "overdue",
      amountDue: 7750,
      overdue: true,
    });
    expect(overdue.banner).toBe(DOCUMENT_PAYMENT_BANNER.overdue);
    expect(overdue.actions).toEqual([DOCUMENT_PAYMENT_ACTION.pay_now, DOCUMENT_PAYMENT_ACTION.remind]);
  });

  it("keeps invoice status separate from payment status", () => {
    const processing = resolveDocumentPaymentCtas({
      invoiceStatus: "sent",
      paymentStatus: "processing",
      amountDue: 100,
    });
    expect(processing.invoiceStatus).toBe("sent");
    expect(processing.paymentStatus).toBe("processing");
    expect(processing.actions).toEqual([DOCUMENT_PAYMENT_ACTION.view_status]);

    const failed = resolveDocumentPaymentCtas({
      invoiceStatus: "overdue",
      paymentStatus: "failed",
      amountDue: 100,
    });
    expect(failed.actions).toEqual([DOCUMENT_PAYMENT_ACTION.retry, DOCUMENT_PAYMENT_ACTION.remind]);
  });
});

describe("Ozow hash", () => {
  it("is deterministic and verifies notify payloads", () => {
    const fields = {
      SiteCode: "TSTSTE0001",
      CountryCode: "ZA",
      CurrencyCode: "ZAR",
      Amount: ozowAmountString(7750),
      TransactionReference: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      BankReference: "INV-2026-001",
      Optional1: "document",
      Optional2: "",
      Optional3: "",
      Optional4: "",
      Optional5: "",
      Customer: "Brandcafe",
      CancelUrl: "https://www.paidly.co.za/cancel",
      ErrorUrl: "https://www.paidly.co.za/error",
      SuccessUrl: "https://www.paidly.co.za/success",
      NotifyUrl: "https://www.paidly.co.za/api/payment-intents/webhook/ozow",
      IsTest: "true",
    };
    const hash = buildOzowRequestHash(fields, "private-key");
    expect(hash).toHaveLength(128);
    expect(buildOzowRequestHash(fields, "private-key")).toBe(hash);
    expect(buildOzowRequestHash({ ...fields, Amount: "7750.01" }, "private-key")).not.toBe(hash);

    const notify = {
      SiteCode: "TSTSTE0001",
      TransactionId: "oz-1",
      TransactionReference: fields.TransactionReference,
      Amount: fields.Amount,
      Status: "Complete",
      Optional1: "document",
      Optional2: "",
      Optional3: "",
      Optional4: "",
      Optional5: "",
      CurrencyCode: "ZAR",
      IsTest: "true",
      StatusMessage: "Test",
    };
    notify.Hash = buildOzowNotifyHash(notify, "private-key");
    expect(verifyOzowNotifyHash(notify, "private-key")).toBe(true);
    expect(verifyOzowNotifyHash(notify, "wrong")).toBe(false);
  });
});

describe("invoice reconciliation", () => {
  it("does not mark paid from a partial confirmed payment", () => {
    const invoice = { total_amount: 7750 };
    expect(invoiceAmountDue(invoice, [{ amount: 2000, status: "paid" }])).toBe(5750);
    expect(invoiceAmountDue(invoice, [{ amount: 7750, status: "paid" }])).toBe(0);
    expect(invoiceAmountDue(invoice, [{ amount: 7750, status: "failed" }])).toBe(7750);
  });
});
