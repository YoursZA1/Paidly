import { describe, expect, it } from "vitest";
import { publicPayslipGateEmail } from "../../api/_publicPayslipShared.js";
import {
  isLeftoverHubLeaveRequest,
  leftoverHubLeaveMessage,
} from "../../src/document-engine/documentSystemOfRecord.js";
import { specialisedListPath } from "../../src/document-engine/documentCreateFlow.js";

describe("public payslip email gate", () => {
  it("prefers sent_to_email then employee_email and never treats token-only as enough", () => {
    expect(publicPayslipGateEmail({ sent_to_email: "Pat@Example.com", employee_email: "other@example.com" })).toBe(
      "pat@example.com"
    );
    expect(publicPayslipGateEmail({ employee_email: "  Emp@Example.com " })).toBe("emp@example.com");
    expect(publicPayslipGateEmail({ public_share_token: "11111111-1111-4111-8111-111111111111" })).toBe("");
  });
});

describe("leftover hub leave", () => {
  it("is not the leave ledger and routes to Leave", () => {
    expect(isLeftoverHubLeaveRequest("leave_request")).toBe(true);
    expect(isLeftoverHubLeaveRequest("expense_claim")).toBe(false);
    expect(leftoverHubLeaveMessage()).toMatch(/Leave page/i);
    expect(specialisedListPath("leave_request")).toMatch(/Leave/i);
  });
});
