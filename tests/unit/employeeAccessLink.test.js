import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_ACCESS_SENT_MESSAGE,
  EMPLOYEE_ACCESS_TTL_SECONDS,
  employeeAccessExpiresAt,
  employeeAccessLinkPath,
  employeeAccessRemainingSeconds,
  normalizeEmploymentEmail,
  selectPortalMembership,
} from "../../shared/workforce/employeeAccessLink.js";

describe("employee access link", () => {
  it("accepts the email stored on an employment record", () => {
    expect(normalizeEmploymentEmail("  Ada@Cafe.Example ")).toBe("ada@cafe.example");
    expect(normalizeEmploymentEmail("not-an-email")).toBe("");
    expect(normalizeEmploymentEmail("a%@cafe.example")).toBe("");
  });

  it("expires 24 hours after it is sent", () => {
    const now = Date.parse("2026-10-07T10:00:00.000Z");
    expect(employeeAccessExpiresAt(now)).toBe("2026-10-08T10:00:00.000Z");
    expect(EMPLOYEE_ACCESS_TTL_SECONDS).toBe(24 * 60 * 60);
    expect(employeeAccessRemainingSeconds("2026-10-08T10:00:00.000Z", now)).toBe(24 * 60 * 60);
    expect(employeeAccessRemainingSeconds("2026-10-07T09:00:00.000Z", now)).toBe(0);
  });

  it("matches only an active employment record and prefers the employee role", () => {
    const rows = [
      { id: "owner", role: "owner", invited_email: "ada@cafe.example", employment_status: "active" },
      { id: "cashier", role: "employee", profile_email: "ada@cafe.example", employment_status: "active" },
      { id: "old", role: "employee", invited_email: "ada@cafe.example", employment_status: "inactive" },
      { id: "revoked", role: "employee", invited_email: "ada@cafe.example", portal_revoked_at: "2026-10-01", employment_status: "active" },
    ];
    expect(selectPortalMembership(rows, "Ada@cafe.example")?.id).toBe("cashier");
    expect(selectPortalMembership(rows, "someone@else.example")).toBeNull();
  });

  it("does not tell the requester whether the email was on file", () => {
    expect(EMPLOYEE_ACCESS_SENT_MESSAGE).toMatch(/if that email is on this company's employee records/i);
    expect(EMPLOYEE_ACCESS_SENT_MESSAGE).toMatch(/24 hours/);
  });

  it("puts the secret only in the link, not a permanent account path", () => {
    expect(employeeAccessLinkPath("cofe-shop", "tok_123", "https://paidly.co.za")).toBe(
      "https://paidly.co.za/employee/cofe-shop?access=tok_123"
    );
  });
});
