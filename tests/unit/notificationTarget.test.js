import { describe, expect, it } from "vitest";
import {
  employeeLeaveNotificationPath,
  invoiceNotificationPath,
  leaveNotificationPath,
  notificationLookupFromMessage,
  safeNotificationPath,
} from "../../shared/notifications/notificationTarget.js";

const ID = "11111111-1111-4111-8111-111111111111";

describe("notification targets", () => {
  it("builds an in-app path for each source", () => {
    expect(invoiceNotificationPath(ID)).toBe(`/ViewInvoice?id=${ID}`);
    expect(leaveNotificationPath(ID)).toBe(`/Leave?request=${ID}`);
    expect(employeeLeaveNotificationPath(ID)).toBe(`/employees/${ID}?tab=leave`);
  });

  it("rejects paths that are not an in-app source", () => {
    expect(safeNotificationPath(`/ViewInvoice?id=${ID}`)).toBe(`/ViewInvoice?id=${ID}`);
    expect(safeNotificationPath("https://example.com")).toBeNull();
    expect(safeNotificationPath("//ViewInvoice")).toBeNull();
    expect(safeNotificationPath("/Settings?tab=billing")).toBeNull();
  });

  it("recovers the source from an older notification sentence", () => {
    expect(notificationLookupFromMessage("Invoice #INV-2026-0042 was viewed by the client.")).toEqual({
      kind: "invoice_number",
      number: "INV-2026-0042",
    });
    expect(notificationLookupFromMessage("Quote #Q-12 was accepted.")).toEqual({
      kind: "quote_number",
      number: "Q-12",
    });
    expect(notificationLookupFromMessage("Armando has requested leave (Annual leave, 0.5 day(s)).").path).toBe("/Leave");
    expect(notificationLookupFromMessage("Your Paidly payslip for October 2026 is available.").path).toBe("/MyPayroll");
  });
});
