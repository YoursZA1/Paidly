import { describe, expect, it } from "vitest";
import { canEditInvoice, canRecordPayment, isPosOriginInvoice } from "@/logic/invoiceLogic";

describe("POS origin invoices", () => {
  const posInvoice = { status: "paid", pos_sale_event_id: "sale-1" };

  it("treats a POS tax copy as neither editable nor payable", () => {
    expect(isPosOriginInvoice(posInvoice)).toBe(true);
    expect(canEditInvoice(posInvoice)).toBe(false);
    expect(canRecordPayment(posInvoice)).toBe(false);
  });

  it("still allows recording payment on an unpaid document invoice", () => {
    expect(canRecordPayment({ status: "sent" })).toBe(true);
    expect(canEditInvoice({ status: "draft" })).toBe(true);
  });
});
