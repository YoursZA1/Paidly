import { describe, expect, it } from "vitest";
import { emailButtonRow } from "../../shared/email/mailButtons.js";
import { payslipPortalLinks } from "../../shared/email/payslipPortals.js";

const TILL = "11111111-1111-4111-8111-111111111111";

describe("branded mail buttons", () => {
  it("renders leave actions as buttons", () => {
    const html = emailButtonRow([
      { href: "https://paidly.co.za/leave-approval/tok", label: "View request", variant: "primary" },
      { href: "https://paidly.co.za/leave-approval/tok?action=approve", label: "Approve", variant: "primary" },
      { href: "https://paidly.co.za/leave-approval/tok?action=decline", label: "Decline", variant: "danger" },
    ]);
    expect(html).toContain("View request");
    expect(html).toContain("Approve");
    expect(html).toContain("Decline");
    expect(html).toContain("background-color:#f24e00");
    expect(html).toContain("action=decline");
    expect(html).not.toContain(">·");
  });
});

describe("payslip portal links", () => {
  it("offers the employee portal, and POS only when this person can use the till", () => {
    const office = payslipPortalLinks({
      origin: "https://paidly.co.za",
      portalSlug: "brand-cafe",
      membership: { role: "employee", job_function: "sales" },
    });
    expect(office.map((row) => row.label)).toEqual(["View your portal"]);
    expect(office[0].href).toBe("https://paidly.co.za/employee/brand-cafe");

    const till = payslipPortalLinks({
      origin: "https://paidly.co.za",
      portalSlug: "brand-cafe",
      membership: { role: "employee", job_function: "pos", pos_register_id: TILL },
    });
    expect(till.map((row) => row.label)).toEqual(["View your portal", "Open POS"]);
    expect(till[1].href).toBe(`https://paidly.co.za/pos/till/${TILL}`);
  });

  it("skips a revoked employee portal and a disabled till", () => {
    const links = payslipPortalLinks({
      origin: "https://paidly.co.za",
      portalSlug: "brand-cafe",
      membership: { role: "employee", job_function: "pos", portal_revoked_at: "2026-01-01", pos_access_disabled_at: "2026-01-01" },
    });
    expect(links).toEqual([]);
  });
});
