import { describe, it, expect } from "vitest";
import { canDecideLeave, canSeeOrgWorkforce, canOverrideLeave } from "../../server/src/leave/leaveAuthz.js";
import {
  hashLeaveApprovalToken,
  leaveApprovalExpiry,
  leaveApprovalTokenMatches,
  publicLeaveApprovalView,
} from "../../shared/workforce/leaveApprovalToken.js";

describe("leave approval authz", () => {
  const manager = { id: "mgr-1", companyRole: "manager", jobFunction: "general" };
  const hr = { id: "hr-1", companyRole: "manager", jobFunction: "hr" };
  const admin = { id: "adm-1", companyRole: "admin", jobFunction: "general" };
  const employee = { id: "emp-1", manager_membership_id: "mgr-1" };

  it("lets the assigned manager decide", () => {
    expect(canDecideLeave(manager, employee).ok).toBe(true);
  });

  it("blocks a different manager", () => {
    const other = { id: "mgr-2", companyRole: "manager", jobFunction: "general" };
    expect(canDecideLeave(other, employee).ok).toBe(false);
    expect(canDecideLeave(other, employee).code).toBe("NOT_THIS_MANAGER");
  });

  it("lets HR and admin override", () => {
    expect(canDecideLeave(hr, employee).ok).toBe(true);
    expect(canDecideLeave(admin, employee).ok).toBe(true);
    expect(canOverrideLeave(hr)).toBe(true);
    expect(canOverrideLeave(admin)).toBe(true);
    expect(canOverrideLeave(manager)).toBe(false);
  });

  it("maps memberships.role and job_function onto leave permission checks", () => {
    const hrRow = { id: "hr-1", role: "manager", job_function: "hr" };
    const adminRow = { id: "adm-1", role: "owner", job_function: "general" };
    const missingFields = { id: "hr-1", org_id: "org-1" };
    expect(canDecideLeave(hrRow, employee).ok).toBe(true);
    expect(canDecideLeave(adminRow, employee).ok).toBe(true);
    expect(canDecideLeave(missingFields, employee).ok).toBe(false);
    expect(canSeeOrgWorkforce(hrRow)).toBe(true);
  });

  it("blocks self-approval including admin", () => {
    expect(canDecideLeave(admin, { id: "adm-1", manager_membership_id: "x" }).code).toBe("SELF_APPROVAL");
    expect(canDecideLeave(hr, { id: "hr-1" }).ok).toBe(false);
  });

  it("does not treat department managers as org-wide workforce admins", () => {
    expect(canSeeOrgWorkforce(manager)).toBe(false);
    expect(canSeeOrgWorkforce(hr)).toBe(true);
    expect(canSeeOrgWorkforce(admin)).toBe(true);
  });
});

describe("leave approval tokens", () => {
  it("hashes one-way and matches with timing-safe compare", () => {
    const token = "test-token-value";
    const hash = hashLeaveApprovalToken(token);
    expect(hash).not.toBe(token);
    expect(leaveApprovalTokenMatches(token, hash)).toBe(true);
    expect(leaveApprovalTokenMatches("other", hash)).toBe(false);
  });

  it("clamps expiry to the leave start date", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const expiry = leaveApprovalExpiry({ now, startDate: "2026-09-03", ttlDays: 7 });
    expect(expiry.startsWith("2026-09-03")).toBe(true);
  });

  it("does not include salary or email in the public view", () => {
    const view = publicLeaveApprovalView({
      employeeName: "Thabo Mavelele",
      leaveTypeName: "Annual leave",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      workingDays: 5,
      currentBalance: 20,
      remainingAfterApproval: 15,
      reason: "Family visit",
      companyName: "Acme",
    });
    expect(JSON.stringify(view)).not.toMatch(/salary|bank|email|id number/i);
    expect(view.employee_name).toBe("Thabo Mavelele");
    expect(view.current_balance).toBe(20);
    expect(view.remaining_after_approval).toBe(15);
  });
});
